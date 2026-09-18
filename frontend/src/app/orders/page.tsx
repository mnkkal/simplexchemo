'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';
import { Badge, Card, CardBody, PageHeader } from '@/components/ui';

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
      <PageHeader
        title="Orders"
        subtitle="Legacy per-unit flow."
        actions={<Link href="/orders/new" className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"><Plus size={16} /> New order</Link>}
      />
      {err && <p className="text-sm text-red-600">{err} — is the Laravel API running on :8000?</p>}
      <div className="grid gap-3">
        {(data?.data || []).map((o: any) => (
          <Link key={o.id} href={`/orders/${o.id}`}>
            <Card className="transition-shadow hover:shadow">
              <CardBody className="flex items-center gap-3 !p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900">#{o.id} {o.customer_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">PO {o.purchase_order_no} · {o.article_no} · {o.bag_size} · qty {o.order_qty} · units {o.units_count}</div>
                </div>
                <Badge tone="slate">Legacy</Badge>
                <ChevronRight size={18} className="shrink-0 text-slate-400" />
              </CardBody>
            </Card>
          </Link>
        ))}
        {(data?.data || []).length === 0 && (
          <Card><CardBody><p className="text-sm text-slate-500">No orders yet.</p></CardBody></Card>
        )}
      </div>
    </div>
  );
}
