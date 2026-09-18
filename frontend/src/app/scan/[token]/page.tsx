'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { cacheSet, cacheGet } from '@/lib/offline';
import { Card, CardBody } from '@/components/ui';

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
      <Card className="mx-auto max-w-md">
        <CardBody className="text-center">
          {data.qc_passed
            ? <CheckCircle2 size={36} className="mx-auto text-green-600" />
            : <Clock size={36} className="mx-auto text-amber-500" />}
          <h1 className="mt-2 text-xl font-bold text-slate-900">{data.qc_passed ? 'Article Complete' : 'In Quality Process'}</h1>
          <div className="mt-3 space-y-1 text-sm text-slate-600">Customer: {o.customer_name}<br />PO: {o.purchase_order_no}<br />Article: {o.article_no}<br />Size: {o.bag_size} · Qty: {o.order_qty}</div>
          <div className="mt-2 text-sm">Accepted: {c.accepted ?? 0} · Scrap: {c.scrap ?? 0} · Pending: {c.pending ?? 0} · Status: {data.status}</div>
          {err && <p className="mt-2 text-xs text-amber-700">{err}</p>}
        </CardBody>
      </Card>
    );
  }

  if (data.type === 'article') {
    const l = data.line_item;
    const c = data.counters || {};
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardBody>
            <h1 className="text-xl font-bold text-slate-900">Article {l.article_no} — {data.status}{c.complete ? ' ✅' : ''}</h1>
            <div className="mt-2 text-sm text-slate-600">PO: {data.purchase_order.customer_name} · {data.purchase_order.purchase_order_no} · Line {l.line_number} · {l.bag_size} · Qty {l.order_qty}</div>
            <div className="mt-2 text-sm">Accepted <b>{c.accepted}</b> · Rework <b>{c.rework}</b> · Scrap <b>{c.scrap}</b> · Pending <b>{c.pending}</b></div>
            <a href={`/articles/${token}`} className="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">Open article QC entry</a>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (data.type === 'unit' && !data.unit) {
    // Public redacted unit view
    return (
      <Card className="mx-auto max-w-md">
        <CardBody className="text-center">
          {data.qc_passed
            ? <CheckCircle2 size={36} className="mx-auto text-green-600" />
            : <Clock size={36} className="mx-auto text-amber-500" />}
          <h1 className="mt-2 text-xl font-bold text-slate-900">{data.qc_passed ? 'Quality Passed' : 'In Quality Process'}</h1>
          <div className="mt-3 space-y-1 text-sm text-slate-600">Customer: {data.order.customer_name}<br />PO: {data.order.purchase_order_no}<br />Article: {data.order.article_no}<br />Size: {data.order.bag_size}</div>
          <div className="mt-2 text-sm">Production QC: {data.production_passed ? 'Pass' : 'Pending'}<br />Air-wash QC: {data.air_wash_passed ? 'Pass' : 'Pending'}</div>
          {err && <p className="mt-2 text-xs text-amber-700">{err}</p>}
        </CardBody>
      </Card>
    );
  }

  if (data.type === 'unit') {
    const u = data.unit;
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card>
          <CardBody>
            <h1 className="text-xl font-bold text-slate-900">Unit #{u.id} — {u.status}</h1>
            <div className="mt-2 text-sm text-slate-600">Order: {data.order.customer_name} · PO {data.order.purchase_order_no} · {data.order.article_no} · {data.order.bag_size}</div>
            <div className="mt-2 text-sm">{(data.rounds || []).map((r: any) => (
              <div key={r.id} className="border-b border-slate-100 py-1 last:border-0">[{r.round_type} #{r.attempt_number}] {r.remark} — {r.qc_checker_code} ({r.qc_checker_name})</div>
            ))}</div>
            <a href={`/qc/${token}`} className="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">Open QC entry</a>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Pallet
  const p = data.pallet;
  const hasLines = (data.lines || []).length > 0;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardBody>
          <h1 className="text-xl font-bold text-slate-900">{hasLines
            ? (data.all_passed ? '✅ Pallet — all articles passed both levels' : `Pallet ${p.pallet_no}`)
            : (data.all_passed ? '✅ Pallet — all units QC passed' : `Pallet ${p.pallet_no}`)} {!hasLines && `(${data.passed_count}/${data.unit_count} passed)`}</h1>
          <div className="mt-2 text-sm text-slate-600">
            Customer: {p.customer_name}<br />PO: {p.purchase_order_no}<br />Article: {p.article_no}<br />Size: {p.bag_size}<br />
            Pallet: {p.pallet_no} · {p.pallet_pcs} pcs · {String(p.packing_date).slice(0, 10)} · shift {p.packing_shift}
          </div>
        </CardBody>
      </Card>
      {hasLines && (data.lines as any[]).map((l: any) => (
        <Card key={l.article_no}>
          <CardBody className="text-sm">
            <b>{l.article_no}</b> · {l.bag_size} · packed <b>{l.packed_qty}</b>/{l.order_qty} {l.complete ? '✅' : ''}
            <div className="mt-1">QC ✓{l.qc.accepted} RW{l.qc.rework} S{l.qc.scrap} · Air-wash ✓{l.airwash.accepted} RW{l.airwash.rework} S{l.airwash.scrap}</div>
            {(l.history || []).map((h: any) => (
              <div key={h.id} className="border-b border-slate-100 py-1 text-xs last:border-0">
                [{((h.stage || 'qc') === 'airwash' ? 'AW' : 'QC')}] ✓{h.accepted_qty} RW{h.rework_qty} S{h.scrap_qty} — QC {h.qc_checker_code}{h.air_wash_checker_code ? ` · AW ${h.air_wash_checker_code}` : ''}{h.notes ? ` · “${h.notes}”` : ''}
              </div>
            ))}
          </CardBody>
        </Card>
      ))}
      {data.units && !hasLines && <Card><CardBody className="text-sm">Units: {(data.units as any[]).map((u: any) => `#${u.id}(${u.status})`).join(', ')}</CardBody></Card>}
      {err && <p className="text-xs text-amber-700">{err}</p>}
    </div>
  );
}
