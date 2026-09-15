'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, scanUrl } from '@/lib/api';
import { enqueue } from '@/lib/offline';
import { useRequireStaff } from '@/lib/requireStaff';
import { QRCodeSVG } from 'qrcode.react';

export default function PackPallet() {
  const router = useRouter();
  const allowed = useRequireStaff('/pallet/new');
  const [tokens, setTokens] = useState('');
  const [f, setF] = useState({ pallet_no: '', packing_date: new Date().toISOString().slice(0, 10), packing_time: '', packing_shift: 'A', packing_supervisor_name: '', packing_machine_operator_name: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setDone(null);
    const unit_tokens = tokens.split(/[\s,]+/).map((t) => {
      const m = t.match(/scan\/([A-Za-z0-9]+)/);
      return m ? m[1] : t;
    }).filter(Boolean);
    const payload = { unit_tokens, ...f, packing_time: f.packing_time || new Date().toTimeString().slice(0, 5) };
    try {
      setDone(await api.createPallet(payload));
    } catch (ex: any) {
      if (/401|Unauthenticated/i.test(ex.message)) { router.replace('/login?next=/pallet/new'); return; }
      if (!navigator.onLine || /fetch|network|Failed/i.test(ex.message)) {
        const uuid = await enqueue('pallet', payload);
        setErr(`Offline — packing queued for sync (session ${uuid.slice(0, 8)}…). Same session will not create a duplicate pallet on retry.`);
      } else setErr(ex.message);
    }
  };

  if (!allowed) return <p>Checking staff login…</p>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-bold">Pallet packing → new pallet QR</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">Unit QR tokens / scan URLs (one per line — only fully-passed units)
          <textarea required value={tokens} onChange={(e) => setTokens(e.target.value)} rows={5} className="w-full border p-2 font-mono text-xs" placeholder="paste tokens or full scan URLs" />
        </label>
        {(['pallet_no', 'packing_date', 'packing_time', 'packing_shift', 'packing_supervisor_name', 'packing_machine_operator_name'] as const).map((k) => (
          <label key={k} className="block text-sm">{k}
            <input value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} className="w-full border p-2" required={['pallet_no', 'packing_date', 'packing_shift'].includes(k)} />
          </label>
        ))}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="bg-slate-900 px-4 py-2 text-white">Save + generate pallet QR</button>
      </form>
      {done && (
        <div className="border bg-white p-4 text-center">
          <b>Pallet {done.pallet_no} · {done.pallet_pcs} pcs</b>
          <QRCodeSVG value={scanUrl(done.pallet_qr_token)} size={180} className="mx-auto my-2" />
          <div className="break-all text-xs">{scanUrl(done.pallet_qr_token)}</div>
          <div className="text-xs text-slate-500">Brand-new token — not reused from any unit. Common info copied: {done.customer_name} · {done.purchase_order_no} · {done.article_no} · {done.bag_size}.</div>
          <button onClick={() => window.print()} className="mt-2 border px-3 py-1 text-sm print:hidden">Print label</button>
        </div>
      )}
    </div>
  );
}
