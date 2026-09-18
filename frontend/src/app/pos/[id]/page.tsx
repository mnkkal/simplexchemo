'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';
import QrLabel from '@/components/Qr';

export default function PODetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const allowed = useRequireStaff(`/pos/${params.id}`);
  const [po, setPo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!allowed) return;
    api.purchaseOrder(params.id).then(setPo).catch((e: any) => {
      if (/401|Unauthenticated/i.test(e.message)) router.replace(`/login?next=/pos/${params.id}`);
      else setErr(e.message);
    });
  }, [params.id, router, allowed]);
  if (!allowed) return <p>Checking staff login…</p>;

  const exportLabels = async () => {
    setErr(''); setMsg('');
    try {
      const d = await api.poLabels(params.id);
      const { utils, writeFile } = await import('xlsx');
      const wb = utils.book_new();
      utils.book_append_sheet(wb, utils.json_to_sheet(d.labels.map((l: any) => ({
        customer_name: d.customer_name,
        purchase_order_no: d.purchase_order_no,
        line_number: l.line_number,
        article_no: l.article_no,
        bag_size: l.bag_size,
        order_qty: l.order_qty,
        article_qr_token: l.article_qr_token,
        scan_url: `${window.location.origin}/scan/${l.article_qr_token}`,
      }))), 'Labels-For-Supplier');
      writeFile(wb, `labels-${d.purchase_order_no}.xlsx`);
      setMsg('Label file downloaded — send it to the label supplier for printing.');
    } catch (ex: any) { setErr(ex.message); }
  };

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!po) return <p>Loading…</p>;
  const lines = po.line_items || po.lineItems || [];
  const packable = lines.filter((l: any) => l.counters?.complete && l.article_qr_token);
  const packHref = (ls: any[]) => `/pallet/new?${ls.map((l: any) => `articles=${encodeURIComponent(l.article_qr_token)}`).join('&')}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">PO #{po.id} — {po.customer_name} · {po.purchase_order_no}</h1>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportLabels} className="bg-slate-900 px-4 py-2 text-white">Export labels for supplier (Excel)</button>
        <button onClick={() => window.print()} className="border px-4 py-2">Print QR sheet</button>
        {packable.length > 0 && <Link href={packHref(packable)} className="bg-green-700 px-4 py-2 text-white">Pack all complete ({packable.length}) →</Link>}
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      <table className="w-full border bg-white text-sm">
        <thead><tr className="bg-slate-100"><th className="border p-1">Line</th><th className="border p-1">Article</th><th className="border p-1">Bag size</th><th className="border p-1">Qty</th><th className="border p-1">Accepted</th><th className="border p-1">Rework</th><th className="border p-1">Scrap</th><th className="border p-1">Pending</th><th className="border p-1">Status</th></tr></thead>
        <tbody>{lines.map((l: any) => (
          <tr key={l.id}>
            <td className="border p-1">{l.line_number}</td>
            <td className="border p-1"><Link href={`/articles/${l.article_qr_token}`} className="underline">{l.article_no}</Link></td>
            <td className="border p-1">{l.bag_size}</td>
            <td className="border p-1">{l.order_qty}</td>
            <td className="border p-1">{l.counters?.accepted ?? '—'}</td>
            <td className="border p-1">{l.counters?.rework ?? '—'}</td>
            <td className="border p-1">{l.counters?.scrap ?? '—'}</td>
            <td className="border p-1">{l.counters?.pending ?? '—'}</td>
            <td className="border p-1">{l.status}{l.counters?.complete ? ' ✅' : ''}{l.counters?.complete && l.article_qr_token ? (<> <Link href={packHref([l])} className="underline">Pack</Link></>) : ''}</td>
          </tr>
        ))}</tbody>
      </table>
      <h2 className="font-bold">Article QR labels — 1 QR per article (all copies of one label encode the same token)</h2>
      <div className="flex flex-wrap gap-3">
        {lines.map((l: any) => (
          <QrLabel key={l.id} token={l.article_qr_token} title={`L${l.line_number} · ${l.article_no}`} lines={[`PO ${po.purchase_order_no} · ${l.bag_size} · Qty ${l.order_qty}`, `Status: ${l.status}`]} />
        ))}
      </div>
      <p className="text-xs text-slate-500">Same QR is pasted on every bag of that article. Scanning it opens <code>/scan/&lt;article_token&gt;</code> with PO + article details.</p>
    </div>
  );
}
