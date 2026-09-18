'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRequireStaff } from '@/lib/requireStaff';
import QrLabel from '@/components/Qr';
import { Badge, Card, CardBody, CardTitle, PageHeader } from '@/components/ui';

export default function OrderDetail({ params }: { params: { id: string } }) {
  const router = useRouter();
  const allowed = useRequireStaff(`/orders/${params.id}`);
  const [order, setOrder] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!allowed) return;
    api.order(params.id).then(setOrder).catch((e: any) => {
      if (/401|Unauthenticated/i.test(e.message)) router.replace(`/login?next=/orders/${params.id}`);
      else setErr(e.message);
    });
  }, [params.id, router, allowed]);
  if (!allowed) return <p>Checking staff login…</p>;
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!order) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <PageHeader
        title={`Order #${order.id} — ${order.customer_name}`}
        subtitle={`PO ${order.purchase_order_no} · ${order.article_no} · ${order.bag_size} · qty ${order.order_qty}`}
        actions={<Badge tone="slate">Legacy</Badge>}
      />
      <Card>
        <CardBody>
          <CardTitle>Unit QR labels (first 200 shown)</CardTitle>
          <div className="mt-3 flex flex-wrap gap-3">
            {(order.units || []).map((u: any) => (
              <QrLabel key={u.id} token={u.unit_qr_token} title={`Unit #${u.id}`} lines={[`Order #${order.id} · ${order.article_no}`, `Status: ${u.status}`]} />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Each label QR opens <code>/scan/&lt;unit_token&gt;</code> — QC rounds are recorded against this same QR (no extra QR at QC stages).</p>
        </CardBody>
      </Card>
    </div>
  );
}
