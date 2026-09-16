'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getCheckerCode, getCheckerName, saveChecker } from '@/lib/checker';
import { enqueue, cacheSet, cacheGet } from '@/lib/offline';

export default function ArticleQC({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const [ctx, setCtx] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  // Production details (admin-maintained; prefilled from last scan).
  const [department, setDept] = useState('packing');
  const [code, setCode] = useState('');
  const [testerName, setTesterName] = useState('');
  const [testerSession, setTesterSession] = useState(false);
  // Tester verdict buttons are visible only after a tester logs in on this
  // device (checker_code in storage). Staff/admin sees production details.
  const [lineNo, setLineNo] = useState('');
  const [shift, setShift] = useState('');
  const [prodDate, setProdDate] = useState(new Date().toISOString().slice(0, 10));
  const [unitNo, setUnitNo] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [airWashCode, setAirWashCode] = useState('');
  // Tester verdict: quantity (one unit per scan — defaults to 1 so a tap
  // never wipes the whole pending balance) + chosen remark + remark text.
  const [verdictQty, setVerdictQty] = useState(1);
  const [pendingVerdict, setPendingVerdict] = useState<'repair' | 'reject' | null>(null);
  const [remark, setRemark] = useState('');
  const [isStaff, setIsStaff] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Remember last-used production details so the next scan opens with the
  // same values prefilled (admin doesn't re-type date/shift/unit/line).
  const prefillFrom = (last: any) => {
    if (!last) return;
    if (last.production_date) setProdDate(String(last.production_date).slice(0, 10));
    if (last.production_shift) setShift(last.production_shift);
    if (last.production_unit_no) setUnitNo(last.production_unit_no);
    if (last.manufacturing_line_no) setLineNo(last.manufacturing_line_no);
    if (last.production_supervisor_name) setSupervisor(last.production_supervisor_name);
    if (last.department) setDept(last.department);
    if (last.air_wash_checker_code) setAirWashCode(last.air_wash_checker_code);
  };

  const load = async (first = false) => {
    try {
      const c = await api.articleContext(token);
      setCtx(c); cacheSet(`article:${token}`, c);
      if (first) {
        const hist = c.history || [];
        prefillFrom(hist[hist.length - 1]);
        setVerdictQty(1);
      }
    } catch (ex: any) {
      const cached = await cacheGet(`article:${token}`);
      if (cached) {
        setCtx(cached); setErr('Offline — showing cached article details.');
        if (first) {
          const hist = cached.history || [];
          prefillFrom(hist[hist.length - 1]);
          setVerdictQty(1);
        }
      }
      else setErr(ex.message);
    }
  };

  useEffect(() => {
    const storedCode = getCheckerCode();
    setCode(storedCode);
    setTesterSession(!!storedCode);
    setTesterName(getCheckerName());
    setIsStaff(!!localStorage.getItem('staff_token'));
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const basePayload = () => ({
    article_token: token,
    department,
    qc_checker_code: code.trim(),
    manufacturing_line_no: lineNo || undefined,
    production_shift: shift || undefined,
    production_date: prodDate || undefined,
    production_unit_no: unitNo || undefined,
    production_supervisor_name: supervisor || undefined,
    air_wash_checker_code: airWashCode.trim() || undefined,
    tested_at: new Date().toISOString(),
  });

  // Tester verdict: Pass submits at once; Repair/Reject go through a remark step.
  const submitVerdict = async (v: 'pass' | 'repair' | 'reject', remarkText: string) => {
    setErr(''); setMsg('');
    if (!code.trim()) { setErr('Log in as a tester first.'); return; }
    const qty = Number(verdictQty);
    const pending = ctx?.counters?.pending ?? 0;
    if (!qty || qty < 1) { setErr('Enter quantity ≥ 1.'); return; }
    if (qty > pending) { setErr(`Only ${pending} pending — quantity can't exceed it.`); return; }
    if (v !== 'pass' && !remarkText.trim()) { setErr('Add a remark for Repair / Reject.'); return; }
    // Safety: Passing/Rejecting the whole balance finishes the article and
    // can't be undone (only staff can correct via Edit) — confirm explicitly.
    if ((v === 'pass' || v === 'reject') && pending > 1 && qty >= pending) {
      if (!window.confirm(`Record ${qty} and finish this article (pending becomes 0)? This can't be undone.`)) return;
    }
    const payload = {
      ...basePayload(),
      accepted_qty: v === 'pass' ? qty : 0,
      rework_qty: v === 'repair' ? qty : 0,
      scrap_qty: v === 'reject' ? qty : 0,
      notes: remarkText.trim() || undefined,
    };
    try {
      const r = await api.submitArticleScan(payload);
      try { await api.verifyChecker(code.trim()).then((c: any) => { saveChecker(code.trim(), c.device_token, c.name); setTesterName(c.name); setTesterSession(true); }); } catch {}
      const label = v === 'pass' ? 'Pass' : v === 'repair' ? 'Repair' : 'Reject';
      setMsg(`Recorded ${label} ${qty} ✓ Now: accepted ${r.counters.accepted}, pending ${r.counters.pending}.`);
      setPendingVerdict(null); setRemark('');
      setVerdictQty(1);
      await load();
    } catch (ex: any) {
      if (!navigator.onLine || /fetch|network|Failed/i.test(ex.message)) {
        const uuid = await enqueue('article-scan', payload);
        setMsg(`Offline — verdict queued for sync (id ${uuid.slice(0, 8)}…). Same id will not double-count on retry.`);
      } else setErr(ex.message);
    }
  };

  // Staff-only: save production details without a verdict (zero quantities).
  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!code.trim()) { setErr('Enter a valid tester code — Admin → Testers must create it first.'); return; }
    const payload = { ...basePayload(), accepted_qty: 0, rework_qty: 0, scrap_qty: 0 };
    try {
      await api.submitArticleScan(payload);
      setMsg('Production details saved ✓ (no quantities — tester enters Pass / Repair / Reject).');
      await load();
    } catch (ex: any) {
      if (!navigator.onLine || /fetch|network|Failed/i.test(ex.message)) {
        const uuid = await enqueue('article-scan', payload);
        setMsg(`Offline — details queued for sync (id ${uuid.slice(0, 8)}…).`);
      } else setErr(ex.message);
    }
  };

  if (!ctx && !err) return <p>Loading…</p>;
  if (!ctx) return <p className="text-sm text-red-600">{err}</p>;
  const c = ctx.counters;
  const pct = (n: number) => ctx.line_item.order_qty ? Math.round((n / ctx.line_item.order_qty) * 100) : 0;
  const last: any = (ctx.history || [])[(ctx.history || []).length - 1];

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Article QC — {ctx.line_item.article_no} {c.complete ? '✅ Complete' : ''}</h1>
      <div className="border bg-white p-3 text-sm">
        PO {ctx.purchase_order.purchase_order_no} · Line {ctx.line_item.line_number} · {ctx.line_item.bag_size} · Order {ctx.line_item.order_qty}<br />
        Accepted <b>{c.accepted} ({pct(c.accepted)}%)</b> · Rework <b>{c.rework}</b> · Scrap <b>{c.scrap} ({pct(c.scrap)}%)</b> · Pending <b>{c.pending}</b>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg}{testerSession && (<> <Link href="/tester/dashboard#scan" className="underline">Scan next QR →</Link></>)}</p>}
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="border bg-white p-3"><b>By tester</b>{(ctx.by_checker || []).map((r: any) => (
          <div key={r.key} className="border-b py-1">{r.key}: ✓{r.accepted} · RW{r.rework} · S{r.scrap} → {r.pass_pct}% pass</div>
        ))}</div>
        <div className="border bg-white p-3"><b>By mfg line</b>{(ctx.by_line || []).map((r: any) => (
          <div key={r.key} className="border-b py-1">Line {r.key}: ✓{r.accepted} · RW{r.rework} · S{r.scrap} → {r.fail_pct}% fail</div>
        ))}</div>
      </div>

      {!c.complete && testerSession && (
        <div className="space-y-3 border bg-white p-4">
          <h2 className="text-sm font-bold">Tester verdict (pending {c.pending})</h2>
          {testerName ? (
            <p className="text-sm">Logged in as <b>{testerName} ({code})</b> · <Link href={`/tester?next=/articles/${token}`} className="underline">switch</Link></p>
          ) : (
            <p className="text-sm">Tester code
              <input value={code} onChange={(e) => setCode(e.target.value)} className="ml-2 border p-2" placeholder="e.g. 001" />
              <Link href={`/tester?next=/articles/${token}`} className="ml-2 underline">Tester login</Link>
            </p>
          )}
          <label className="block text-sm">Quantity (max {c.pending})
            <input type="number" min={1} max={c.pending} value={verdictQty} onChange={(e) => setVerdictQty(Number(e.target.value))} className="mt-1 w-full border p-2" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => submitVerdict('pass', '')} className="bg-green-700 px-4 py-3 font-bold text-white">✓ Pass</button>
            <button onClick={() => { setErr(''); setPendingVerdict('repair'); }} className="bg-amber-600 px-4 py-3 font-bold text-white">Repair</button>
            <button onClick={() => { setErr(''); setPendingVerdict('reject'); }} className="bg-red-700 px-4 py-3 font-bold text-white">Reject</button>
          </div>
          {pendingVerdict && (
            <div className="space-y-2 border border-amber-400 bg-amber-50 p-3">
              <p className="text-sm font-bold">Remark required for {pendingVerdict === 'repair' ? 'Repair' : 'Reject'}</p>
              <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} className="w-full border p-2 text-sm" placeholder="e.g. stitch open at bottom, print smudge…" />
              <div className="flex gap-2">
                <button onClick={() => submitVerdict(pendingVerdict, remark)} className="bg-slate-900 px-4 py-2 text-white">Submit {pendingVerdict === 'repair' ? 'Repair' : 'Reject'}</button>
                <button onClick={() => { setPendingVerdict(null); setRemark(''); }} className="border px-4 py-2">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!c.complete && !testerSession && (
        <div className="border border-amber-400 bg-amber-50 p-4 text-sm">
          <b>Tester login required.</b> Pass / Repair / Reject buttons appear after a tester logs in on this device.{' '}
          <Link href={`/tester?next=/articles/${token}`} className="underline">Go to Tester login</Link>
          {isStaff && <span className="mt-1 block text-slate-600">Staff/admin: use Production details below to add information (no quantities).</span>}
        </div>
      )}

      {c.complete && (
        <div className="border border-green-600 bg-green-50 p-4 text-sm">
          <b>✅ Article complete — no further entry needed.</b> Accepted {c.accepted} + Scrap {c.scrap} = Order {ctx.line_item.order_qty}, pending 0.
          To fix anything, use <b>Edit</b> on the history row above (staff only).
        </div>
      )}

      <details className="border bg-white p-3 text-sm">
        <summary className="cursor-pointer font-bold">Production details (from printed label scan) — tap to expand</summary>
        {isStaff ? (
          <form onSubmit={saveDetails} className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-sm">Date
                <input type="date" value={prodDate} onChange={(e) => setProdDate(e.target.value)} className="mt-1 w-full border p-2" />
              </label>
              <label className="block text-sm">Shift
                <input value={shift} onChange={(e) => setShift(e.target.value)} className="mt-1 w-full border p-2" placeholder="e.g. A" />
              </label>
              <label className="block text-sm">Production unit no
                <input value={unitNo} onChange={(e) => setUnitNo(e.target.value)} className="mt-1 w-full border p-2" placeholder="e.g. U1" />
              </label>
              <label className="block text-sm">Mfg line no
                <input value={lineNo} onChange={(e) => setLineNo(e.target.value)} className="mt-1 w-full border p-2" placeholder="e.g. L2" />
              </label>
              <label className="block text-sm">Production supervisor
                <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="mt-1 w-full border p-2" placeholder="Supervisor name" />
              </label>
              <label className="block text-sm">Department
                <select value={department} onChange={(e) => setDept(e.target.value)} className="mt-1 w-full border p-2">
                  <option value="bagging">Bagging</option>
                  <option value="packing">Packing</option>
                  <option value="qc">QC</option>
                </select>
              </label>
              <label className="block text-sm">QC tester code
                {(ctx.testers || []).length > 0 ? (
                  <select value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full border p-2">
                    <option value="">— Select tester —</option>
                    {(ctx.testers || []).map((t: any) => (
                      <option key={t.id} value={t.checker_code}>{t.name} ({t.checker_code})</option>
                    ))}
                  </select>
                ) : (
                  <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full border p-2" placeholder="e.g. 001" />
                )}
              </label>
              <label className="block text-sm">Air-wash checker code
                {(ctx.testers || []).length > 0 ? (
                  <select value={airWashCode} onChange={(e) => setAirWashCode(e.target.value)} className="mt-1 w-full border p-2">
                    <option value="">— None —</option>
                    {(ctx.testers || []).map((t: any) => (
                      <option key={t.id} value={t.checker_code}>{t.name} ({t.checker_code})</option>
                    ))}
                  </select>
                ) : (
                  <input value={airWashCode} onChange={(e) => setAirWashCode(e.target.value)} className="mt-1 w-full border p-2" placeholder="e.g. 002" />
                )}
              </label>
            </div>
            <button className="border px-4 py-2">Save details (no quantities)</button>
          </form>
        ) : (
          <div className="mt-3">
            {last ? (
              <table className="w-full border text-sm">
                <tbody>
                  <tr><td className="border bg-slate-50 p-1">Date</td><td className="border p-1">{String(last.production_date || '').slice(0, 10) || '—'}</td></tr>
                  <tr><td className="border bg-slate-50 p-1">Shift</td><td className="border p-1">{last.production_shift || '—'}</td></tr>
                  <tr><td className="border bg-slate-50 p-1">Production unit</td><td className="border p-1">{last.production_unit_no || '—'}</td></tr>
                  <tr><td className="border bg-slate-50 p-1">Mfg line</td><td className="border p-1">{last.manufacturing_line_no || '—'}</td></tr>
                  <tr><td className="border bg-slate-50 p-1">Supervisor</td><td className="border p-1">{last.production_supervisor_name || '—'}</td></tr>
                  <tr><td className="border bg-slate-50 p-1">Department</td><td className="border p-1">{last.department || '—'}</td></tr>
                  <tr><td className="border bg-slate-50 p-1">Air-wash checker</td><td className="border p-1">{last.air_wash_checker_code || '—'}</td></tr>
                </tbody>
              </table>
            ) : (
              <p className="text-slate-500">No production details recorded yet.</p>
            )}
            <p className="mt-1 text-xs text-slate-500">Read-only for testers — only staff can change these.</p>
          </div>
        )}
      </details>

      <div className="text-sm"><b>History (never overwritten):</b>
        {(ctx.history || []).map((h: any) => (
          <div key={h.id} className="border-b py-1">[{h.department}]{h.production_date ? ` ${String(h.production_date).slice(0, 10)}` : ''} ✓{h.accepted_qty} RW{h.rework_qty} S{h.scrap_qty} — QC {h.qc_checker_code}{h.air_wash_checker_code ? ` · Air-wash ${h.air_wash_checker_code}` : ''}{h.manufacturing_line_no ? ` · Line ${h.manufacturing_line_no}` : ''}{h.production_unit_no ? ` · Unit ${h.production_unit_no}` : ''}{h.production_shift ? ` · Shift ${h.production_shift}` : ''}{h.production_supervisor_name ? ` · Sup ${h.production_supervisor_name}` : ''}{h.notes ? ` · “${h.notes}”` : ''}
            {isStaff && (
              <button onClick={() => setEditing({ ...h, production_date: String(h.production_date || '').slice(0, 10) })} className="ml-2 border px-2 text-xs">Edit</button>
            )}
          </div>
        ))}
        {(!ctx.history || ctx.history.length === 0) && <div className="text-slate-500">No scans yet.</div>}
      </div>
      {isStaff && editing && (
        <form
          className="space-y-3 border border-amber-400 bg-amber-50 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(''); setMsg('');
            try {
              await api.updateArticleScan(editing.id, {
                department: editing.department,
                qc_checker_code: editing.qc_checker_code,
                manufacturing_line_no: editing.manufacturing_line_no || null,
                production_shift: editing.production_shift || null,
                production_date: editing.production_date || null,
                production_unit_no: editing.production_unit_no || null,
                production_supervisor_name: editing.production_supervisor_name || null,
                air_wash_checker_code: editing.air_wash_checker_code || null,
                accepted_qty: Number(editing.accepted_qty),
                rework_qty: Number(editing.rework_qty),
                scrap_qty: Number(editing.scrap_qty),
                notes: editing.notes || null,
              });
              setEditing(null);
              setMsg('Scan corrected ✓ counters refreshed.');
              await load();
            } catch (ex: any) {
              if (/401|Unauthenticated/i.test(ex.message)) setErr('Staff login expired — please log in again.');
              else setErr(ex.message);
            }
          }}
        >
          <h2 className="text-sm font-bold">Correct scan #{editing.id} (prefilled — change only what&apos;s wrong)</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">Date<input type="date" value={editing.production_date || ''} onChange={(e) => setEditing({ ...editing, production_date: e.target.value })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">Shift<input value={editing.production_shift || ''} onChange={(e) => setEditing({ ...editing, production_shift: e.target.value })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">Production unit no<input value={editing.production_unit_no || ''} onChange={(e) => setEditing({ ...editing, production_unit_no: e.target.value })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">Mfg line no<input value={editing.manufacturing_line_no || ''} onChange={(e) => setEditing({ ...editing, manufacturing_line_no: e.target.value })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">Production supervisor<input value={editing.production_supervisor_name || ''} onChange={(e) => setEditing({ ...editing, production_supervisor_name: e.target.value })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">QC tester code<input value={editing.qc_checker_code || ''} onChange={(e) => setEditing({ ...editing, qc_checker_code: e.target.value })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">Air-wash checker code<input value={editing.air_wash_checker_code || ''} onChange={(e) => setEditing({ ...editing, air_wash_checker_code: e.target.value })} className="mt-1 w-full border p-2" /></label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">Pass<input type="number" min={0} value={editing.accepted_qty} onChange={(e) => setEditing({ ...editing, accepted_qty: Number(e.target.value) })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">Repair<input type="number" min={0} value={editing.rework_qty} onChange={(e) => setEditing({ ...editing, rework_qty: Number(e.target.value) })} className="mt-1 w-full border p-2" /></label>
            <label className="block text-sm">Reject<input type="number" min={0} value={editing.scrap_qty} onChange={(e) => setEditing({ ...editing, scrap_qty: Number(e.target.value) })} className="mt-1 w-full border p-2" /></label>
          </div>
          <label className="block text-sm">Remark<textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="mt-1 w-full border p-2" rows={2} /></label>
          <div className="flex gap-2">
            <button className="bg-slate-900 px-4 py-2 text-white">Save correction</button>
            <button type="button" onClick={() => setEditing(null)} className="border px-4 py-2">Cancel</button>
          </div>
        </form>
      )}
      <p className="text-xs text-slate-500">Rework lots are re-scanned with the same QR after repair until Accepted + Scrap = Order Qty. Scrap is terminal.</p>
    </div>
  );
}
