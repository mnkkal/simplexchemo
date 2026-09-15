'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';

export default function POsPage() {
  const router = useRouter();
  const allowed = useRequireStaff('/pos');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!allowed) return;
    api.purchaseOrders().then(setData).catch((e: any) => {
      if (/401|Unauthenticated/i.test(e.message)) router.replace('/login?next=/pos');
      else setErr(e.message);
    });
  }, [router, allowed]);
  if (!allowed) return <p>Checking staff login…</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-xl font-bold">Purchase Orders (1 PO = N Articles)</h1>
        <Link href="/pos/new" className="ml-auto bg-slate-900 px-4 py-2 text-white">+ New PO</Link>
      </div>
      {err && <p className="text-sm text-red-600">{err} — is the Laravel API running on :8000?</p>}
      <div className="grid gap-2">
        {(data?.data || []).map((po: any) => (
          <Link key={po.id} href={`/pos/${po.id}`} className="border bg-white p-3">
            <b>#{po.id} {po.customer_name}</b> · PO {po.purchase_order_no} · articles {(po.line_items || po.lineItems || []).length}
          </Link>
        ))}
      </div>
    </div>
  );
}
