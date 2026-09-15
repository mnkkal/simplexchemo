'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';

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
      <h1 className="text-xl font-bold">New PO → 1 QR per Article</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">Customer Name
          <input required value={customer_name} onChange={(e) => setCustomer(e.target.value)} className="mt-1 w-full border p-2" />
        </label>
        <label className="block text-sm">PO Number
          <input required value={purchase_order_no} onChange={(e) => setPo(e.target.value)} className="mt-1 w-full border p-2" />
        </label>
      </div>
      <h2 className="font-bold">Articles (line items)</h2>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 border bg-white p-3 sm:grid-cols-[40px_1fr_1fr_110px_40px]">
          <div className="text-sm font-bold">L{i + 1}</div>
          <input value={r.article_no} onChange={(e) => setRow(i, 'article_no', e.target.value)} placeholder="Article No (unique)" className="border p-2 text-sm" required />
          <input value={r.bag_size} onChange={(e) => setRow(i, 'bag_size', e.target.value)} placeholder="Bag/Batch size" className="border p-2 text-sm" required />
          <input type="number" min={1} value={r.order_qty} onChange={(e) => setRow(i, 'order_qty', e.target.value)} placeholder="Qty" className="border p-2 text-sm" required />
          <button type="button" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="border px-2 text-sm">✕</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={() => setRows((rs) => [...rs, { article_no: '', bag_size: '', order_qty: 100 }])} className="border px-4 py-2 text-sm">+ Add article row</button>
        <button className="bg-slate-900 px-4 py-2 text-white">Create PO + generate article QRs</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <p className="text-xs text-slate-500">Each article gets its own line number + its own QR. Quantity stays bound to its article — no mix-ups.</p>
    </form>
  );
}
