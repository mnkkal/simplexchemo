'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getCheckerCode, clearChecker } from '@/lib/checker';
import { TokenInput, extractToken } from '@/components/Qr';
import QrScanner from '@/components/QrScanner';

export default function TesterDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    const c = getCheckerCode();
    if (!c) { router.replace('/tester?next=/tester/dashboard'); return; }
    setCode(c);
    api.testerWork(c).then(setData).catch((e: any) => {
      if (/401/i.test(e.message)) {
        clearChecker();
        router.replace('/tester?next=/tester/dashboard');
      } else setErr(e.message);
    });
  }, [router]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <p>Loading…</p>;
  const p = data.profile;
  const t = data.totals;

  // Tester's job, in order: scan QR → Pass / Repair / Reject → done.
  // Everything else (queue, history, profile) is secondary.
  const goArticle = (text: string) => {
    const tok = extractToken(text);
    if (tok) router.push(`/articles/${encodeURIComponent(tok)}`);
  };
  const switchTester = () => {
    clearChecker();
    router.push('/tester');
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">My work — {p.name}</h1>

      {/* 1 · SCAN FIRST — the primary action on mobile. */}
      <div id="scan" className="scroll-mt-16 border-2 border-slate-900 bg-white p-4">
        <h2 className="text-lg font-bold">📷 Scan article QR</h2>
        <p className="text-xs text-slate-500">Scan → Pass / Repair / Reject → done. Quantity defaults to 1 per scan.</p>
        <div className="mt-2 space-y-3">
          <QrScanner onResult={goArticle} />
          <TokenInput onGo={goArticle} label="Or paste token / QR URL…" />
        </div>
      </div>

      <div className="border bg-white p-3 text-sm">
        <b>{p.name} ({p.checker_code})</b>
        {p.production_line_no ? ` · Line ${p.production_line_no}` : ''}
        {p.production_shift ? ` · Shift ${p.production_shift}` : ''} ·{' '}
        Scans <b>{t.scans}</b> · Pass <b>{t.accepted}</b> · Repair <b>{t.rework}</b> · Reject <b>{t.scrap}</b>
      </div>

      {/* 2 · CURRENT WORK — only articles assigned to this tester. */}
      <div id="queue" className="scroll-mt-16">
        <h2 className="font-bold">My assigned work</h2>
        {(!data.queue || data.queue.mine.length === 0) && <p className="text-sm text-slate-500">No work assigned to you right now — ask staff to assign articles.</p>}
        {(data.queue?.mine || []).map((r: any) => (
          <Link key={r.line_item_id} href={`/articles/${r.article_qr_token}`} className="mt-1 block border border-green-600 bg-green-50 p-2 text-sm">
            <b>{r.purchase_order_no} · {r.article_no}</b> · {r.bag_size} · {r.counters?.stage === 'airwash' ? 'Level 2 Air-wash' : 'Level 1 QC'} · pending <b>{r.counters.pending}</b> / {r.order_qty} · {r.status}{r.assigned_qc_code ? ` · QC→${r.assigned_qc_code}` : ''}{r.assigned_aw_code ? ` · AW→${r.assigned_aw_code}` : ''}
          </Link>
        ))}
      </div>

      {/* 3 · PAST WORK */}
      <div id="history" className="scroll-mt-16">
        <h2 className="font-bold">Past work (latest first)</h2>
        <table className="w-full border bg-white text-sm">
          <thead><tr className="bg-slate-100"><th className="border p-1">date</th><th className="border p-1">PO</th><th className="border p-1">article</th><th className="border p-1">role</th><th className="border p-1">pass</th><th className="border p-1">repair</th><th className="border p-1">reject</th><th className="border p-1">remark</th></tr></thead>
          <tbody>{(data.recent || []).map((r: any) => (
            <tr key={r.id}>
              <td className="border p-1">{String(r.production_date || r.tested_at || '').slice(0, 10)}</td>
              <td className="border p-1">{r.purchase_order_no}</td>
              <td className="border p-1">{r.article_no}</td>
              <td className="border p-1">{r.role}</td>
              <td className="border p-1">{r.accepted_qty}</td>
              <td className="border p-1">{r.rework_qty}</td>
              <td className="border p-1">{r.scrap_qty}</td>
              <td className="border p-1">{r.notes || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {(!data.recent || data.recent.length === 0) && <p className="text-sm text-slate-500">No work recorded yet — scan an article QR to start.</p>}
      </div>

      {/* 4 · PROFILE */}
      <div id="profile" className="scroll-mt-16 border bg-white p-3 text-sm">
        <b>Profile</b>
        <div>Code: <b>{p.checker_code}</b></div>
        <div>Assigned line: <b>{p.production_line_no || '—'}</b></div>
        <div>Shift: <b>{p.production_shift || '—'}</b></div>
        <div>Status: <b>{p.active ? 'active' : 'inactive'}</b></div>
        <button onClick={switchTester} className="mt-2 border px-4 py-2">Switch tester / logout</button>
      </div>
      <p className="text-xs text-slate-500">Tester view — your work only. Back-office pages need a separate staff login. Signed in as tester {code} on this device.</p>
    </div>
  );
}
