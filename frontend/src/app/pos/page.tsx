'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';
import { Card, CardBody, PageHeader } from '@/components/ui';

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
      <PageHeader
        title="Purchase Orders"
        subtitle="1 PO = N articles, 1 QR per article."
        actions={<Link href="/pos/new" className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"><Plus size={16} /> New PO</Link>}
      />
      {err && <p className="text-sm text-red-600">{err} — is the Laravel API running on :8000?</p>}
      <div className="grid gap-3">
        {(data?.data || []).map((po: any) => (
          <Link key={po.id} href={`/pos/${po.id}`}>
            <Card className="transition-shadow hover:shadow">
              <CardBody className="flex items-center gap-3 !p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-slate-900">#{po.id} {po.customer_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">PO {po.purchase_order_no} · {(po.line_items || po.lineItems || []).length} articles</div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-slate-400" />
              </CardBody>
            </Card>
          </Link>
        ))}
        {(data?.data || []).length === 0 && (
          <Card><CardBody><p className="text-sm text-slate-500">No purchase orders yet — create the first one.</p></CardBody></Card>
        )}
      </div>
    </div>
  );
}
