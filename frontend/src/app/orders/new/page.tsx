'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';

export default function NewOrder() {
  const router = useRouter();
  const allowed = useRequireStaff('/orders/new');
  const [f, setF] = useState({ customer_name: '', purchase_order_no: '', article_no: '', bag_size: '', order_qty: 100 });
  const [err, setErr] = useState('');
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));
  if (!allowed) return <p>Checking staff login…</p>;
  return (
    <form
      className="max-w-lg space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr('');
        try {
          const o = await api.createOrder({ ...f, order_qty: Number(f.order_qty) });
          router.push(`/orders/${o.id}`);
        } catch (ex: any) {
          if (/401|Unauthenticated/i.test(ex.message)) { router.replace('/login?next=/orders/new'); return; }
          setErr(ex.message);
        }
      }}
    >
      <h1 className="text-xl font-bold">New order → generate unit QRs</h1>
      {['customer_name', 'purchase_order_no', 'article_no', 'bag_size'].map((k) => (
        <label key={k} className="block text-sm">{k}
          <input required value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} className="mt-1 w-full border p-2" />
        </label>
      ))}
      <label className="block text-sm">order_qty
        <input required type="number" min={1} value={f.order_qty} onChange={(e) => set('order_qty', e.target.value)} className="mt-1 w-full border p-2" />
      </label>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="bg-slate-900 px-4 py-2 text-white">Create + generate QRs</button>
    </form>
  );
}
