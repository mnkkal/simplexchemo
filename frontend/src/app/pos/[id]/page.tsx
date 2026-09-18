'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, PackagePlus, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';
import QrLabel from '@/components/Qr';
import { Card, CardBody, CardTitle, PageHeader, StatusBadge, TableWrap, tdCls, thCls } from '@/components/ui';

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
      <PageHeader
        title={`PO #${po.id} — ${po.customer_name} · ${po.purchase_order_no}`}
        actions={<>
          <button onClick={exportLabels} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"><Download size={15} /> Export labels</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><Printer size={15} /> Print QR sheet</button>
          {packable.length > 0 && <Link href={packHref(packable)} className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-600"><PackagePlus size={15} /> Pack all complete ({packable.length})</Link>}
        </>}
      />
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      <Card>
        <CardBody className="!p-0">
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={thCls()}>Line</th><th className={thCls()}>Article</th><th className={thCls()}>Bag size</th><th className={thCls()}>Qty</th><th className={thCls()}>Accepted</th><th className={thCls()}>Rework</th><th className={thCls()}>Scrap</th><th className={thCls()}>Pending</th><th className={thCls()}>Status</th></tr></thead>
              <tbody>{lines.map((l: any) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className={tdCls()}>{l.line_number}</td>
                  <td className={tdCls()}><Link href={`/articles/${l.article_qr_token}`} className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600">{l.article_no}</Link></td>
                  <td className={tdCls()}>{l.bag_size}</td>
                  <td className={tdCls()}>{l.order_qty}</td>
                  <td className={tdCls()}>{l.counters?.accepted ?? '—'}</td>
                  <td className={tdCls()}>{l.counters?.rework ?? '—'}</td>
                  <td className={tdCls()}>{l.counters?.scrap ?? '—'}</td>
                  <td className={tdCls()}>{l.counters?.pending ?? '—'}</td>
                  <td className={tdCls()}>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusBadge status={l.status} />
                      {l.counters?.complete && l.article_qr_token && <Link href={packHref([l])} className="text-xs font-semibold text-green-700 underline underline-offset-2">Pack</Link>}
                    </span>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <CardTitle>Article QR labels</CardTitle>
          <p className="mt-1 text-sm text-slate-500">1 QR per article (all copies of one label encode the same token).</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {lines.map((l: any) => (
              <QrLabel key={l.id} token={l.article_qr_token} title={`L${l.line_number} · ${l.article_no}`} lines={[`PO ${po.purchase_order_no} · ${l.bag_size} · Qty ${l.order_qty}`, `Status: ${l.status}`]} />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Same QR is pasted on every bag of that article. Scanning it opens <code>/scan/&lt;article_token&gt;</code> with PO + article details.</p>
        </CardBody>
      </Card>
    </div>
  );
}
