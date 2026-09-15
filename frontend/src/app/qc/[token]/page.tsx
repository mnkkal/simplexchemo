'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getCheckerCode, saveChecker } from '@/lib/checker';
import { enqueue, cacheSet, cacheGet } from '@/lib/offline';

export default function QcPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const [ctx, setCtx] = useState<any>(null);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [remark, setRemark] = useState('pass');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setCode(getCheckerCode());
    api.qcContext(token)
      .then((c) => { setCtx(c); cacheSet(`qc:${token}`, c); })
      .catch(async () => {
        const cached = await cacheGet(`qc:${token}`);
        if (cached) { setCtx(cached); setErr('Offline — showing cached unit details.'); }
        else setErr('Unit not found (and nothing cached offline).');
      });
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!code.trim()) { setErr('Enter your checker code.'); return; }
    const payload = {
      unit_token: token,
      round_type: ctx.current_round,
      remark,
      qc_checker_code: code.trim(),
      notes: notes || undefined,
      tested_at: new Date().toISOString(),
    };
    try {
      const r = await api.submitQc(payload);
      setMsg(`Recorded ${r.remark} (${r.round_type} attempt ${r.attempt_number}).`);
      const fresh = await api.qcContext(token);
      setCtx(fresh); cacheSet(`qc:${token}`, fresh);
    } catch (ex: any) {
      // Offline → queue with client UUID; syncs later (idempotent).
      if (!navigator.onLine || /fetch|network|Failed/i.test(ex.message)) {
        const uuid = await enqueue('qc', payload);
        try { await api.verifyChecker(code.trim()).then((c: any) => saveChecker(code.trim(), c.device_token)); } catch {}
        setMsg(`Offline — queued for sync (id ${uuid.slice(0, 8)}…).`);
      } else setErr(ex.message);
    }
  };

  const remember = async () => {
    try {
      const c = await api.verifyChecker(code.trim());
      saveChecker(code.trim(), c.device_token);
      setMsg(`Device remembered for ${c.name}. Still enter the code on each remark.`);
    } catch (ex: any) { setErr(ex.message); }
  };

  if (!ctx && !err) return <p>Loading…</p>;
  if (!ctx) return <p className="text-sm text-red-600">{err}</p>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-bold">QC entry — {ctx.current_round === 'production' ? 'Round 1 · Production' : 'Round 2 · Air-wash'}</h1>
      <div className="border bg-white p-3 text-sm">
        <div>Unit #{ctx.unit.id} · status <b>{ctx.unit.status}</b></div>
        <div>Order: {ctx.order.customer_name} · PO {ctx.order.purchase_order_no} · {ctx.order.article_no} · {ctx.order.bag_size}</div>
      </div>
      {err && <p className="text-sm text-amber-700">{err}</p>}
      <div className="text-sm">
        <b>History (never overwritten):</b>
        {(ctx.rounds || []).map((r: any) => (
          <div key={r.id} className="border-b py-1">[{r.round_type} #{r.attempt_number}] {r.remark} — {r.qc_checker_code} @ {r.tested_at || r.created_at}</div>
        ))}
        {(!ctx.rounds || ctx.rounds.length === 0) && <div className="text-slate-500">No attempts yet.</div>}
      </div>
      <form onSubmit={submit} className="space-y-3 border bg-white p-4">
        <label className="block text-sm">Checker code (required each time)
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} className="flex-1 border p-2" placeholder="e.g. QC01" />
            <button type="button" onClick={remember} className="border px-3 text-sm">Remember device</button>
          </div>
        </label>
        <div className="flex gap-2 text-sm">
          {['pass', 'repair', 'reject'].map((r) => (
            <label key={r} className={`flex-1 cursor-pointer border p-3 text-center ${remark === r ? 'bg-slate-900 text-white' : ''}`}>
              <input type="radio" className="hidden" checked={remark === r} onChange={() => setRemark(r)} />{r.toUpperCase()}
            </label>
          ))}
        </div>
        <label className="block text-sm">Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border p-2" rows={2} />
        </label>
        <button className="bg-slate-900 px-4 py-2 text-white">Submit {ctx.current_round} remark</button>
      </form>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
    </div>
  );
}
