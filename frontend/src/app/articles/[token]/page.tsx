'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Badge, Card, CardBody, PageHeader, btnPrimary, btnSecondary, inputCls } from '@/components/ui';
import { getCheckerCode, getCheckerName, saveChecker } from '@/lib/checker';
import { enqueue, cacheSet, cacheGet } from '@/lib/offline';

export default function ArticleQC({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const router = useRouter();
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ctx, setCtx] = useState<any>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  // Production details (admin-maintained; prefilled from last scan).
  const [department, setDept] = useState('packing');
  const [code, setCode] = useState('');
  const [testerName, setTesterName] = useState('');
  const [testerSession, setTesterSession] = useState(false);
  // Article assignment (staff-maintained; persisted per article — never
  // taken from the device session, so it can't "reset" on its own).
  const [assignQc, setAssignQc] = useState('');
  const [assignAw, setAssignAw] = useState('');
  // Tester verdict buttons are visible only after a tester logs in on this
  // device (checker_code in storage). Staff/admin sees production details.
  const [lineNo, setLineNo] = useState('');
  const [shift, setShift] = useState('');
  const [prodDate, setProdDate] = useState(new Date().toISOString().slice(0, 10));
  const [unitNo, setUnitNo] = useState('');
  const [supervisor, setSupervisor] = useState('');
  // Tester verdict: quantity (one unit per scan — defaults to 1 so a tap
  // never wipes the whole pending balance) + chosen remark + remark text.
  const [verdictQty, setVerdictQty] = useState(1);
  // Testing level picked by the tester — balances are per level.
  const [stageSel, setStageSel] = useState<'qc' | 'airwash'>('qc');
  const [replQty, setReplQty] = useState(1);
  const [pendingVerdict, setPendingVerdict] = useState<'repair' | 'reject' | null>(null);
  const [remark, setRemark] = useState('');
  const [isStaff, setIsStaff] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  // Remember last-used production details so the next scan opens with the
  // same values prefilled (admin doesn't re-type date/shift/unit/line).
  // Assignment dropdowns are NOT prefilled from the session or last scan —
  // they reflect the article's saved assignment (loaded below).
  const prefillFrom = (last: any) => {
    if (!last) return;
    if (last.production_date) setProdDate(String(last.production_date).slice(0, 10));
    if (last.production_shift) setShift(last.production_shift);
    if (last.production_unit_no) setUnitNo(last.production_unit_no);
    if (last.manufacturing_line_no) setLineNo(last.manufacturing_line_no);
    if (last.production_supervisor_name) setSupervisor(last.production_supervisor_name);
    if (last.department) setDept(last.department);
  };

  const applyAssignment = (lineItem: any, last: any) => {
    if (lineItem && (lineItem.assigned_qc_code || lineItem.assigned_aw_code)) {
      setAssignQc(lineItem.assigned_qc_code || '');
      setAssignAw(lineItem.assigned_aw_code || '');
    } else {
      // No assignment yet: convenience default from the last scan's codes.
      if (last?.qc_checker_code) setAssignQc(last.qc_checker_code);
      if (last?.air_wash_checker_code) setAssignAw(last.air_wash_checker_code);
    }
  };

  // Tester isolation (§7): staff sees full history; a tester sees only
  // their own rows. The server redacts live responses — this also covers
  // data served from the offline cache of a previous session.
  // Also normalizes pre-levels cached payloads (no qc/airwash/stage keys).
  const scopeToViewer = (c: any) => {
    if (!c || typeof window === 'undefined') return c;
    if (c.stage === undefined || !c.qc || !c.airwash) {
      const legacyComplete = !!c.complete;
      c = {
        ...c, by_airwash: c.by_airwash || [],
        stage: legacyComplete ? 'airwash' : 'qc',
        qc: { accepted: c.accepted || 0, rework: c.rework || 0, scrap: c.scrap || 0, pending: c.pending || 0, complete: legacyComplete },
        airwash: { accepted: 0, rework: 0, scrap: 0, pending: 0, complete: false },
        complete: false,
      };
    }
    if (localStorage.getItem('staff_token')) return c;
    const mine = getCheckerCode();
    if (!mine) return { ...c, history: [], by_checker: [], by_airwash: [] };
    const owns = (h: any) => ((h.stage || 'qc') === 'airwash' ? h.air_wash_checker_code === mine : h.qc_checker_code === mine);
    return {
      ...c,
      history: (c.history || []).filter(owns),
      by_checker: (c.by_checker || []).filter((r: any) => r.key === mine),
      by_airwash: (c.by_airwash || []).filter((r: any) => r.key === mine),
    };
  };

  // Level visibility (strict assignment): a tester is offered only levels
  // assigned TO THEM. Unassigned articles show no tabs at all — staff must
  // assign first. Staff sees both. The effective level falls back to the
  // visible tab when the selected one is hidden.
  const levelAccess = (cc: any) => {
    const l = cc?.line_item || {};
    const q = isStaff || (!!l.assigned_qc_code && l.assigned_qc_code === code);
    const a = isStaff || (!!l.assigned_aw_code && l.assigned_aw_code === code);
    const e = !q && a ? 'airwash' : (!a && q ? 'qc' : stageSel);
    return { showQc: q, showAw: a, eff: e as 'qc' | 'airwash' };
  };

  const load = async (first = false) => {
    try {
      const c = await api.articleContext(token);
      setCtx(scopeToViewer(c)); cacheSet(`article:${token}`, c);
      if (first) {
        const hist = c.history || [];
        prefillFrom(hist[hist.length - 1]);
        applyAssignment(c.line_item, hist[hist.length - 1]);
        setVerdictQty(1);
        if (c.stage === 'airwash') setStageSel('airwash');
      }
    } catch (ex: any) {
      const cached = await cacheGet(`article:${token}`);
      if (cached) {
        setCtx(scopeToViewer(cached)); setErr('Offline — showing cached article details.');
        if (first) {
          const hist = cached.history || [];
          prefillFrom(hist[hist.length - 1]);
          applyAssignment((cached as any).line_item, hist[hist.length - 1]);
          setVerdictQty(1);
          if ((cached as any).stage === 'airwash') setStageSel('airwash');
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
    return () => { if (backTimer.current) clearTimeout(backTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const basePayload = () => ({
    article_token: token,
    department,
    manufacturing_line_no: lineNo || undefined,
    production_shift: shift || undefined,
    production_date: prodDate || undefined,
    production_unit_no: unitNo || undefined,
    production_supervisor_name: supervisor || undefined,
    tested_at: new Date().toISOString(),
  });

  // Fast floor flow: after a verdict is recorded (or queued offline),
  // return to the scan screen so the next QR can be scanned immediately.
  const backToScan = () => {
    if (backTimer.current) clearTimeout(backTimer.current);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    backTimer.current = setTimeout(() => router.push('/tester/dashboard#scan'), 1500);
  };

  // Tester verdict: Pass submits at once; Repair/Reject go through a remark step.
  // The tester picks the level (tabs); each level enforces its own balance.
  const submitVerdict = async (v: 'pass' | 'repair' | 'reject', remarkText: string) => {
    setErr(''); setMsg('');
    if (!code.trim()) { setErr('Log in as a tester first.'); return; }
    const qty = Number(verdictQty);
    if (!qty || qty < 1) { setErr('Enter quantity ≥ 1.'); return; }
    // Live balance of the EFFECTIVE level (a teammate may have recorded).
    const { eff } = levelAccess(ctx);
    const selOf = (cc: any) => (eff === 'airwash' ? cc?.counters?.airwash : cc?.counters?.qc);
    let pending = selOf(ctx)?.pending ?? 0;
    try {
      const live = await api.articleContext(token);
      const scoped = scopeToViewer(live);
      setCtx(scoped);
      pending = selOf(scoped)?.pending ?? 0;
    } catch { /* offline: fall back to the shown balance */ }
    if (qty > pending) { setErr(`Only ${pending} pending now at ${eff === 'airwash' ? 'Air-wash' : 'QC'} — a teammate just recorded. Quantity adjusted.`); setVerdictQty(Math.max(1, pending)); await load(); return; }
    if (v !== 'pass' && !remarkText.trim()) { setErr('Add a remark for Repair / Reject.'); return; }
    // Safety: finishing the level balance can't be undone (only staff can
    // correct via Edit) — confirm explicitly.
    if ((v === 'pass' || v === 'reject') && pending > 1 && qty >= pending) {
      if (!window.confirm(`Record ${qty} and finish ${eff === 'airwash' ? 'Air-wash' : 'QC'} (pending becomes 0)? This can't be undone.`)) return;
    }
    const payload = {
      ...basePayload(),
      stage: eff,
      qc_checker_code: code.trim(),
      air_wash_checker_code: assignAw.trim() || undefined,
      accepted_qty: v === 'pass' ? qty : 0,
      rework_qty: v === 'repair' ? qty : 0,
      scrap_qty: v === 'reject' ? qty : 0,
      notes: remarkText.trim() || undefined,
    };
    try {
      const r = await api.submitArticleScan(payload);
      try { await api.verifyChecker(code.trim()).then((c: any) => { saveChecker(code.trim(), c.device_token, c.name); setTesterName(c.name); setTesterSession(true); }); } catch {}
      const label = v === 'pass' ? 'Pass' : v === 'repair' ? 'Repair' : 'Reject';
      const rc = eff === 'airwash' ? r.counters.airwash : r.counters.qc;
      setMsg(`Recorded ${label} ${qty} (${eff === 'airwash' ? 'Air-wash' : 'QC'}) ✓ Now: accepted ${rc.accepted}, pending ${rc.pending}. Back to scan…`);
      setPendingVerdict(null); setRemark('');
      setVerdictQty(1);
      await load();
      backToScan();
    } catch (ex: any) {
      if (!navigator.onLine || /fetch|network|Failed/i.test(ex.message)) {
        const uuid = await enqueue('article-scan', payload);
        setMsg(`Offline — verdict queued for sync (id ${uuid.slice(0, 8)}…). Same id will not double-count on retry. Back to scan…`);
        backToScan();
      } else setErr(ex.message);
    }
  };

  // Staff-only: assign testers + save production details without a verdict
  // (zero quantities). Assignment persists on the article — the dropdowns
  // always show the saved assignment, never the device session.
  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!assignQc.trim()) { setErr('Select the assigned QC tester first.'); return; }
    const payload = { ...basePayload(), qc_checker_code: assignQc.trim(), air_wash_checker_code: assignAw.trim() || undefined, accepted_qty: 0, rework_qty: 0, scrap_qty: 0 };
    try {
      const li = ctx?.line_item || {};
      if (assignQc.trim() !== (li.assigned_qc_code || '') || assignAw.trim() !== (li.assigned_aw_code || '')) {
        await api.setAssignment(token, { qc_checker_code: assignQc.trim(), air_wash_checker_code: assignAw.trim() || null });
      }
      await api.submitArticleScan(payload);
      setMsg('Assignment + production details saved ✓ (no quantities — tester enters Pass / Repair / Reject).');
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
  // Selected testing level drives the verdict form (each level: own balance).
  // Tabs follow assignment: only own levels and open-pool levels are offered.
  const { showQc, showAw, eff } = levelAccess(ctx);
  const sel = eff === 'airwash' ? c.airwash : c.qc;
  // Assignment gate: a tester records only where assigned (per level).
  // Unassigned = locked for testers; staff bypasses (admin override).
  const stageAssignee = eff === 'airwash'
    ? (ctx.line_item.assigned_aw_code || '')
    : (ctx.line_item.assigned_qc_code || '');
  const hasAnyAssignment = !!(ctx.line_item.assigned_qc_code || ctx.line_item.assigned_aw_code);
  const canRecord = isStaff || (stageAssignee !== '' && stageAssignee === code);

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title={`Article QC — ${ctx.line_item.article_no}`}
        subtitle={`PO ${ctx.purchase_order.purchase_order_no} · Line ${ctx.line_item.line_number} · ${ctx.line_item.bag_size} · Order ${ctx.line_item.order_qty}`}
        actions={c.complete ? <Badge tone="green">✅ Complete</Badge> : <Badge tone="blue">In progress</Badge>}
      />
      <Card>
        <CardBody className="text-sm">
          Accepted <b>{c.accepted} ({pct(c.accepted)}%)</b> · Rework <b>{c.rework}</b> · Scrap <b>{c.scrap} ({pct(c.scrap)}%)</b> · Pending <b>{c.pending}</b>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="text-sm">
          <b>Level 1 · QC:</b> ✓{c.qc.accepted}/{ctx.line_item.order_qty} · RW{c.qc.rework} · S{c.qc.scrap} {c.qc.complete ? '✅' : <>· pending <b>{c.qc.pending}</b></>}<br />
          <b>Level 2 · Air-wash:</b> ✓{c.airwash.accepted}/{ctx.line_item.order_qty} · RW{c.airwash.rework} · S{c.airwash.scrap} {c.airwash.complete ? '✅' : <>· pending <b>{c.airwash.pending}</b></>}
        </CardBody>
      </Card>
      {isStaff && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(''); setMsg('');
            const q = Number(replQty);
            if (!q || q < 1) { setErr('Enter replacement quantity ≥ 1.'); return; }
            try {
              const r: any = await api.addReplacement(token, q);
              setMsg(`Recorded ${q} replacement unit(s) ✓ Testable pool now ${r.pool_qty}.`);
              setReplQty(1);
              await load();
            } catch (ex: any) { setErr(ex.message); }
          }}
          className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm"
        >
          <b>Replacement units</b> <span className="text-slate-500">(fresh bags produced for scrapped ones — enlarges both levels&apos; pools)</span>
          <div className="mt-2 flex items-center gap-2">
            <input type="number" min={1} value={replQty} onChange={(e) => setReplQty(Number(e.target.value))} className={inputCls('!w-24')} />
            <button className={btnSecondary('!py-2')}>Add</button>
            {(ctx.line_item.replacement_qty || 0) > 0 && <span className="text-slate-500">Recorded so far: {ctx.line_item.replacement_qty}</span>}
          </div>
        </form>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg}{testerSession && (<> <Link href="/tester/dashboard#scan" className="underline">Scan next QR →</Link></>)}</p>}
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <Card><CardBody><b>By tester (QC)</b>{(ctx.by_checker || []).map((r: any) => (
          <div key={r.key} className="border-b border-slate-100 py-1 last:border-0">{r.key}: ✓{r.accepted} · RW{r.rework} · S{r.scrap} → {r.pass_pct}% pass</div>
        ))}</CardBody></Card>
        <Card><CardBody><b>By air-wash tester</b>{(ctx.by_airwash || []).map((r: any) => (
          <div key={r.key} className="border-b border-slate-100 py-1 last:border-0">{r.key}: ✓{r.accepted} · RW{r.rework} · S{r.scrap} → {r.pass_pct}% pass</div>
        ))}</CardBody></Card>
        <Card><CardBody><b>By mfg line</b>{(ctx.by_line || []).map((r: any) => (
          <div key={r.key} className="border-b border-slate-100 py-1 last:border-0">Line {r.key}: ✓{r.accepted} · RW{r.rework} · S{r.scrap} → {r.fail_pct}% fail</div>
        ))}</CardBody></Card>
      </div>

      {/* Tester verdict is the tester's tool: it shows only on a tester-only
          session. Staff (admin login) gets admin tools, never this section —
          one role per screen, no dual sessions. */}
      {!c.complete && testerSession && !isStaff && (
        <Card><CardBody className="space-y-3">
          <h2 className="text-sm font-bold">Tester verdict ({eff === 'airwash' ? 'Air-wash' : 'QC'} pending {sel.pending})</h2>
          <div className="flex gap-2 text-sm" role="tablist" aria-label="Testing level">
            {showQc && <button type="button" onClick={() => { setErr(''); setStageSel('qc'); setVerdictQty(1); }} className={`rounded-md border px-4 py-2 font-bold ${eff === 'qc' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>Level 1 · QC ({c.qc.pending} left)</button>}
            {showAw && <button type="button" onClick={() => { setErr(''); setStageSel('airwash'); setVerdictQty(1); }} className={`rounded-md border px-4 py-2 font-bold ${eff === 'airwash' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>Level 2 · Air-wash ({c.airwash.pending} left)</button>}
            {!showQc && !showAw && <p className="text-sm text-slate-600">{hasAnyAssignment ? 'This article is assigned to other testers — nothing for you here.' : 'This article is not assigned to any tester yet — ask staff to assign it first.'}</p>}
          </div>
          {testerName ? (
            <p className="text-sm text-slate-600">Logged in as <b className="text-slate-900">{testerName} ({code})</b> · <Link href={`/tester?next=/articles/${token}`} className="underline underline-offset-2">switch</Link></p>
          ) : (
            <p className="text-sm">Tester code
              <input value={code} onChange={(e) => setCode(e.target.value)} className="ml-2 rounded-md border border-slate-300 p-2 text-sm" placeholder="e.g. 001" />
              <Link href={`/tester?next=/articles/${token}`} className="ml-2 underline underline-offset-2">Tester login</Link>
            </p>
          )}
          <label className="block text-sm font-medium text-slate-700">Quantity (max {sel.pending})
            <input type="number" min={1} max={sel.pending} value={verdictQty} onChange={(e) => setVerdictQty(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-base" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button disabled={!canRecord} onClick={() => submitVerdict('pass', '')} className="rounded-md bg-green-700 px-4 py-3 font-bold text-white shadow-sm hover:bg-green-600 disabled:opacity-40">✓ Pass</button>
            <button disabled={!canRecord} onClick={() => { setErr(''); setPendingVerdict('repair'); }} className="rounded-md bg-amber-600 px-4 py-3 font-bold text-white shadow-sm hover:bg-amber-500 disabled:opacity-40">Repair</button>
            <button disabled={!canRecord} onClick={() => { setErr(''); setPendingVerdict('reject'); }} className="rounded-md bg-red-700 px-4 py-3 font-bold text-white shadow-sm hover:bg-red-600 disabled:opacity-40">Reject</button>
          </div>
          {!canRecord && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              {stageAssignee
                ? <>Assigned to tester <b>{stageAssignee}</b> at {eff === 'airwash' ? 'Air-wash' : 'QC'} level — your code ({code || '—'}) can&apos;t record here. <Link href={`/tester?next=/articles/${token}`} className="underline underline-offset-2">Switch tester</Link></>
                : <>Not assigned to any tester yet — ask staff to assign it first.</>}
            </p>
          )}
          {pendingVerdict && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-bold">Remark required for {pendingVerdict === 'repair' ? 'Repair' : 'Reject'}</p>
              <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} className="w-full rounded-md border border-slate-300 p-2 text-sm" placeholder="e.g. stitch open at bottom, print smudge…" />
              <div className="flex gap-2">
                <button onClick={() => submitVerdict(pendingVerdict, remark)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Submit {pendingVerdict === 'repair' ? 'Repair' : 'Reject'}</button>
                <button onClick={() => { setPendingVerdict(null); setRemark(''); }} className="rounded-md border border-slate-300 px-4 py-2 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </CardBody></Card>
      )}

      {!c.complete && !testerSession && !isStaff && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm shadow-sm">
          <b>Tester login required.</b> Pass / Repair / Reject buttons appear after a tester logs in on this device.{' '}
          <Link href={`/tester?next=/articles/${token}`} className="underline underline-offset-2">Go to Tester login</Link>
        </div>
      )}

      {c.complete && (
        <div className="rounded-lg border border-green-600 bg-green-50 p-4 text-sm shadow-sm">
          <b>✅ Article complete — both levels done, no further entry needed.</b> QC ✓{c.qc.accepted} S{c.qc.scrap} · Air-wash ✓{c.airwash.accepted} S{c.airwash.scrap} (order {ctx.line_item.order_qty}).
          To fix anything, use <b>Edit</b> on the history row above (staff only).
          <span className="mt-2 block"><Link href={`/pallet/new?articles=${encodeURIComponent(token)}`} className="inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white">Pack Pallet →</Link></span>
        </div>
      )}

      <Card>
        <CardBody className="!p-3 text-sm">
      <details>
        <summary className="cursor-pointer font-bold">Production details (from printed label scan) — tap to expand</summary>
        {isStaff ? (
          <form onSubmit={saveDetails} className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Date
                <input type="date" value={prodDate} onChange={(e) => setProdDate(e.target.value)} className={inputCls('mt-1')} />
              </label>
              <label className="block text-sm font-medium text-slate-700">Shift
                <input value={shift} onChange={(e) => setShift(e.target.value)} className={inputCls('mt-1')} placeholder="e.g. A" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Production unit no
                <input value={unitNo} onChange={(e) => setUnitNo(e.target.value)} className={inputCls('mt-1')} placeholder="e.g. U1" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Mfg line no
                <input value={lineNo} onChange={(e) => setLineNo(e.target.value)} className={inputCls('mt-1')} placeholder="e.g. L2" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Production supervisor
                <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className={inputCls('mt-1')} placeholder="Supervisor name" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Department
                <select value={department} onChange={(e) => setDept(e.target.value)} className={inputCls('mt-1')}>
                  <option value="bagging">Bagging</option>
                  <option value="packing">Packing</option>
                  <option value="qc">QC</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Assigned QC tester (only they can record QC)
                {(ctx.testers || []).length > 0 ? (
                  <select value={assignQc} onChange={(e) => setAssignQc(e.target.value)} className={inputCls('mt-1')}>
                    <option value="">— Not assigned (hidden from testers) —</option>
                    {(ctx.testers || []).map((t: any) => (
                      <option key={t.id} value={t.checker_code}>{t.name} ({t.checker_code})</option>
                    ))}
                  </select>
                ) : (
                  <input value={assignQc} onChange={(e) => setAssignQc(e.target.value)} className={inputCls('mt-1')} placeholder="e.g. 001" />
                )}
              </label>
              <label className="block text-sm font-medium text-slate-700">Assigned air-wash tester (only they can record air-wash)
                {(ctx.testers || []).length > 0 ? (
                  <select value={assignAw} onChange={(e) => setAssignAw(e.target.value)} className={inputCls('mt-1')}>
                    <option value="">— Not assigned (hidden from testers) —</option>
                    {(ctx.testers || []).map((t: any) => (
                      <option key={t.id} value={t.checker_code}>{t.name} ({t.checker_code})</option>
                    ))}
                  </select>
                ) : (
                  <input value={assignAw} onChange={(e) => setAssignAw(e.target.value)} className={inputCls('mt-1')} placeholder="e.g. 002" />
                )}
              </label>
            </div>
            <button className={btnSecondary()}>Save assignment + details (no quantities)</button>
          </form>
        ) : (
          <div className="mt-3">
            {last ? (
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="w-32 bg-slate-50 p-1.5 text-slate-500">Date</td><td className="p-1.5">{String(last.production_date || '').slice(0, 10) || '—'}</td></tr>
                  <tr><td className="bg-slate-50 p-1.5 text-slate-500">Shift</td><td className="p-1.5">{last.production_shift || '—'}</td></tr>
                  <tr><td className="bg-slate-50 p-1.5 text-slate-500">Production unit</td><td className="p-1.5">{last.production_unit_no || '—'}</td></tr>
                  <tr><td className="bg-slate-50 p-1.5 text-slate-500">Mfg line</td><td className="p-1.5">{last.manufacturing_line_no || '—'}</td></tr>
                  <tr><td className="bg-slate-50 p-1.5 text-slate-500">Supervisor</td><td className="p-1.5">{last.production_supervisor_name || '—'}</td></tr>
                  <tr><td className="bg-slate-50 p-1.5 text-slate-500">Department</td><td className="p-1.5">{last.department || '—'}</td></tr>
                  <tr><td className="bg-slate-50 p-1.5 text-slate-500">Air-wash checker</td><td className="p-1.5">{last.air_wash_checker_code || '—'}</td></tr>
                </tbody>
              </table>
            ) : (
              <p className="text-slate-500">No production details recorded yet.</p>
            )}
            <p className="mt-1 text-xs text-slate-500">Read-only for testers — only staff can change these.</p>
          </div>
        )}
      </details>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="text-sm">
          <b>History (never overwritten):</b>
          {(ctx.history || []).map((h: any) => (
            <div key={h.id} className="border-b border-slate-100 py-1.5 last:border-0">[{((h.stage || 'qc') === 'airwash' ? 'AW' : 'QC')}][{h.department}]{h.production_date ? ` ${String(h.production_date).slice(0, 10)}` : ''} ✓{h.accepted_qty} RW{h.rework_qty} S{h.scrap_qty} — QC {h.qc_checker_code}{h.air_wash_checker_code ? ` · Air-wash ${h.air_wash_checker_code}` : ''}{h.manufacturing_line_no ? ` · Line ${h.manufacturing_line_no}` : ''}{h.production_unit_no ? ` · Unit ${h.production_unit_no}` : ''}{h.production_shift ? ` · Shift ${h.production_shift}` : ''}{h.production_supervisor_name ? ` · Sup ${h.production_supervisor_name}` : ''}{h.notes ? ` · “${h.notes}”` : ''}
              {isStaff && (
                <button onClick={() => setEditing({ ...h, production_date: String(h.production_date || '').slice(0, 10) })} className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">Edit</button>
              )}
            </div>
          ))}
          {(!ctx.history || ctx.history.length === 0) && <div className="text-slate-500">No scans yet.</div>}
        </CardBody>
      </Card>
      {isStaff && editing && (
        <Card className="!border-amber-300 !bg-amber-50">
        <form
          className="space-y-3 p-4"
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
            <label className="block text-sm font-medium text-slate-700">Date<input type="date" value={editing.production_date || ''} onChange={(e) => setEditing({ ...editing, production_date: e.target.value })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">Shift<input value={editing.production_shift || ''} onChange={(e) => setEditing({ ...editing, production_shift: e.target.value })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">Production unit no<input value={editing.production_unit_no || ''} onChange={(e) => setEditing({ ...editing, production_unit_no: e.target.value })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">Mfg line no<input value={editing.manufacturing_line_no || ''} onChange={(e) => setEditing({ ...editing, manufacturing_line_no: e.target.value })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">Production supervisor<input value={editing.production_supervisor_name || ''} onChange={(e) => setEditing({ ...editing, production_supervisor_name: e.target.value })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">QC tester code<input value={editing.qc_checker_code || ''} onChange={(e) => setEditing({ ...editing, qc_checker_code: e.target.value })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">Air-wash checker code<input value={editing.air_wash_checker_code || ''} onChange={(e) => setEditing({ ...editing, air_wash_checker_code: e.target.value })} className={inputCls('mt-1')} /></label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm font-medium text-slate-700">Pass<input type="number" min={0} value={editing.accepted_qty} onChange={(e) => setEditing({ ...editing, accepted_qty: Number(e.target.value) })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">Repair<input type="number" min={0} value={editing.rework_qty} onChange={(e) => setEditing({ ...editing, rework_qty: Number(e.target.value) })} className={inputCls('mt-1')} /></label>
            <label className="block text-sm font-medium text-slate-700">Reject<input type="number" min={0} value={editing.scrap_qty} onChange={(e) => setEditing({ ...editing, scrap_qty: Number(e.target.value) })} className={inputCls('mt-1')} /></label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Remark<textarea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className={inputCls('mt-1')} rows={2} /></label>
          <div className="flex gap-2">
            <button className={btnPrimary('!text-sm')}>Save correction</button>
            <button type="button" onClick={() => setEditing(null)} className={btnSecondary('!text-sm')}>Cancel</button>
          </div>
        </form>
        </Card>
      )}
      <p className="text-xs text-slate-500">Rework lots are re-scanned with the same QR after repair until Accepted + Scrap = Order Qty. Scrap is terminal.</p>
    </div>
  );
}
