'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cacheSet, cacheGet } from '@/lib/offline';

export default function ScanView({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const staff = typeof window !== 'undefined' && !!localStorage.getItem('staff_token');

  useEffect(() => {
    api.scan(token, staff)
      .then((d) => { setData(d); cacheSet(`scan:${token}`, d); })
      .catch(async () => {
        const cached = await cacheGet(`scan:${token}`);
        if (cached) { setData(cached); setErr('Offline — showing last cached view.'); }
        else setErr('Code not found (and nothing cached offline).');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (err && !data) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <p>Loading…</p>;

  if (data.type === 'article' && !data.line_item) {
    // Public redacted article view
    const o = data.order;
    const c = data.counters || {};
    return (
      <div className="max-w-md space-y-3 border bg-white p-4">
        <h1 className="text-xl font-bold">{data.qc_passed ? '✅ Article Complete' : '⏳ In Quality Process'}</h1>
        <div className="text-sm">Customer: {o.customer_name}<br />PO: {o.purchase_order_no}<br />Article: {o.article_no}<br />Size: {o.bag_size} · Qty: {o.order_qty}</div>
        <div className="text-sm">Accepted: {c.accepted ?? 0} · Scrap: {c.scrap ?? 0} · Pending: {c.pending ?? 0} · Status: {data.status}</div>
        {err && <p className="text-xs text-amber-700">{err}</p>}
      </div>
    );
  }

  if (data.type === 'article') {
    const l = data.line_item;
    const c = data.counters || {};
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-bold">Article {l.article_no} — {data.status}{c.complete ? ' ✅' : ''}</h1>
        <div className="border bg-white p-3 text-sm">PO: {data.purchase_order.customer_name} · {data.purchase_order.purchase_order_no} · Line {l.line_number} · {l.bag_size} · Qty {l.order_qty}</div>
        <div className="border bg-white p-3 text-sm">Accepted <b>{c.accepted}</b> · Rework <b>{c.rework}</b> · Scrap <b>{c.scrap}</b> · Pending <b>{c.pending}</b></div>
        <a href={`/articles/${token}`} className="inline-block bg-slate-900 px-4 py-2 text-white">Open article QC entry</a>
      </div>
    );
  }

  if (data.type === 'unit' && !data.unit) {
    // Public redacted unit view
    return (
      <div className="max-w-md space-y-3 border bg-white p-4">
        <h1 className="text-xl font-bold">{data.qc_passed ? '✅ Quality Passed' : '⏳ In Quality Process'}</h1>
        <div className="text-sm">Customer: {data.order.customer_name}<br />PO: {data.order.purchase_order_no}<br />Article: {data.order.article_no}<br />Size: {data.order.bag_size}</div>
        <div className="text-sm">Production QC: {data.production_passed ? 'Pass' : 'Pending'}<br />Air-wash QC: {data.air_wash_passed ? 'Pass' : 'Pending'}</div>
        {err && <p className="text-xs text-amber-700">{err}</p>}
      </div>
    );
  }

  if (data.type === 'unit') {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-bold">Unit #{data.unit.id} — {data.unit.status}</h1>
        <div className="border bg-white p-3 text-sm">Order: {data.order.customer_name} · PO {data.order.purchase_order_no} · {data.order.article_no} · {data.order.bag_size}</div>
        <div className="text-sm">{(data.rounds || []).map((r: any) => (
          <div key={r.id} className="border-b py-1">[{r.round_type} #{r.attempt_number}] {r.remark} — {r.qc_checker_code} ({r.qc_checker_name})</div>
        ))}</div>
        <a href={`/qc/${token}`} className="inline-block bg-slate-900 px-4 py-2 text-white">Open QC entry</a>
      </div>
    );
  }

  // Pallet
  const p = data.pallet;
  const hasLines = (data.lines || []).length > 0;
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-xl font-bold">{hasLines
        ? (data.all_passed ? '✅ Pallet — all articles passed both QC levels' : `Pallet ${p.pallet_no}`)
        : (data.all_passed ? '✅ Pallet — all units QC passed' : `Pallet ${p.pallet_no}`)} {!hasLines && `(${data.passed_count}/${data.unit_count} passed)`}</h1>
      <div className="border bg-white p-3 text-sm">
        Customer: {p.customer_name}<br />PO: {p.purchase_order_no}<br />Article: {p.article_no}<br />Size: {p.bag_size}<br />
        Pallet: {p.pallet_no} · {p.pallet_pcs} pcs · {String(p.packing_date).slice(0, 10)} · shift {p.packing_shift}
      </div>
      {hasLines && (data.lines as any[]).map((l: any) => (
        <div key={l.article_no} className="border bg-white p-3 text-sm">
          <b>{l.article_no}</b> · {l.bag_size} · packed <b>{l.packed_qty}</b>/{l.order_qty} {l.complete ? '✅' : ''}<br />
          QC ✓{l.qc.accepted} RW{l.qc.rework} S{l.qc.scrap} · Air-wash ✓{l.airwash.accepted} RW{l.airwash.rework} S{l.airwash.scrap}
          {(l.history || []).map((h: any) => (
            <div key={h.id} className="border-b py-1 text-xs">
              [{((h.stage || 'qc') === 'airwash' ? 'AW' : 'QC')}] ✓{h.accepted_qty} RW{h.rework_qty} S{h.scrap_qty} — QC {h.qc_checker_code}{h.air_wash_checker_code ? ` · AW ${h.air_wash_checker_code}` : ''}{h.notes ? ` · “${h.notes}”` : ''}
            </div>
          ))}
        </div>
      ))}
      {data.units && !hasLines && <div className="text-sm">Units: {(data.units as any[]).map((u: any) => `#${u.id}(${u.status})`).join(', ')}</div>}
      {err && <p className="text-xs text-amber-700">{err}</p>}
    </div>
  );
}
