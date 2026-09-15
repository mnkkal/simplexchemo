'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';

export default function OrdersPage() {
  const router = useRouter();
  const allowed = useRequireStaff('/orders');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!allowed) return;
    api.orders().then(setData).catch((e: any) => {
      if (/401|Unauthenticated/i.test(e.message)) router.replace('/login?next=/orders');
      else setErr(e.message);
    });
  }, [router, allowed]);
  if (!allowed) return <p>Checking staff login…</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-xl font-bold">Orders</h1>
        <Link href="/orders/new" className="ml-auto bg-slate-900 px-4 py-2 text-white">+ New order</Link>
      </div>
      {err && <p className="text-red-600 text-sm">{err} — is the Laravel API running on :8000?</p>}
      <div className="grid gap-2">
        {(data?.data || []).map((o: any) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="border bg-white p-3">
            <b>#{o.id} {o.customer_name}</b> · PO {o.purchase_order_no} · {o.article_no} · {o.bag_size} · qty {o.order_qty} · units {o.units_count}
          </Link>
        ))}
      </div>
    </div>
  );
}
