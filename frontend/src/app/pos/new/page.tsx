'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';
import { Card, CardBody, CardTitle, PageHeader, btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/ui';

type Row = { article_no: string; bag_size: string; order_qty: number };

export default function NewPO() {
  const router = useRouter();
  const allowed = useRequireStaff('/pos/new');
  const [customer_name, setCustomer] = useState('');
  const [purchase_order_no, setPo] = useState('');
  const [rows, setRows] = useState<Row[]>([{ article_no: '', bag_size: '', order_qty: 100 }]);
  const [err, setErr] = useState('');

  const setRow = (i: number, k: keyof Row, v: any) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.article_no.trim()) { setErr('Every row needs an Article Number.'); return; }
      const key = r.article_no.trim().toLowerCase();
      if (seen.has(key)) { setErr(`Duplicate Article Number in this PO: ${r.article_no}`); return; }
      seen.add(key);
      if (!r.bag_size.trim() || Number(r.order_qty) < 1) { setErr('Each row needs bag size and qty ≥ 1.'); return; }
    }
    try {
      const po = await api.createPurchaseOrder({
        customer_name,
        purchase_order_no,
        items: rows.map((r) => ({ article_no: r.article_no.trim(), bag_size: r.bag_size.trim(), order_qty: Number(r.order_qty) })),
      });
      router.push(`/pos/${po.id}`);
    } catch (ex: any) {
      if (/401|Unauthenticated/i.test(ex.message)) { router.replace('/login?next=/pos/new'); return; }
      setErr(ex.message);
    }
  };

  if (!allowed) return <p>Checking staff login…</p>;

  return (
    <form className="max-w-2xl space-y-4" onSubmit={submit}>
      <PageHeader title="New PO → 1 QR per Article" subtitle="Quantity stays bound to its article — no mix-ups." />
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls()}>Customer Name
            <input required value={customer_name} onChange={(e) => setCustomer(e.target.value)} className={inputCls('mt-1')} />
          </label>
          <label className={labelCls()}>PO Number
            <input required value={purchase_order_no} onChange={(e) => setPo(e.target.value)} className={inputCls('mt-1')} />
          </label>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <CardTitle className="mb-3">Articles (line items)</CardTitle>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[40px_1fr_1fr_110px_40px]">
                <div className="text-sm font-bold text-slate-500">L{i + 1}</div>
                <input value={r.article_no} onChange={(e) => setRow(i, 'article_no', e.target.value)} placeholder="Article No (unique)" className={inputCls('!text-sm')} required />
                <input value={r.bag_size} onChange={(e) => setRow(i, 'bag_size', e.target.value)} placeholder="Bag/Batch size" className={inputCls('!text-sm')} required />
                <input type="number" min={1} value={r.order_qty} onChange={(e) => setRow(i, 'order_qty', e.target.value)} placeholder="Qty" className={inputCls('!text-sm')} required />
                <button type="button" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove row ${i + 1}`} className="rounded-md border border-slate-300 p-2 text-sm text-slate-500 hover:bg-white disabled:opacity-40"><X size={14} /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setRows((rs) => [...rs, { article_no: '', bag_size: '', order_qty: 100 }])} className={btnSecondary('!text-sm')}><Plus size={15} /> Add article row</button>
            <button className={btnPrimary('!text-sm')}>Create PO + generate article QRs</button>
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </CardBody>
      </Card>
    </form>
  );
}
