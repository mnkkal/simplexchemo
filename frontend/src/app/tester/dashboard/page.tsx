'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera } from 'lucide-react';
import { api } from '@/lib/api';
import { getCheckerCode, clearChecker } from '@/lib/checker';
import { TokenInput, extractToken } from '@/components/Qr';
import QrScanner from '@/components/QrScanner';
import { Badge, Card, CardBody, CardTitle, PageHeader, StatusBadge, TableWrap, tdCls, thCls } from '@/components/ui';

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
      <PageHeader title={`My work — ${p.name}`} />

      {/* 1 · SCAN FIRST — the primary action on mobile. */}
      <Card id="scan" className="!border-2 !border-slate-900 scroll-mt-16">
        <CardBody>
          <CardTitle className="!text-lg"><span className="inline-flex items-center gap-2"><Camera size={20} /> Scan article QR</span></CardTitle>
          <p className="mt-1 text-xs text-slate-500">Scan → Pass / Repair / Reject → done. Quantity defaults to 1 per scan.</p>
          <div className="mt-3 space-y-3">
            <QrScanner onResult={goArticle} />
            <TokenInput onGo={goArticle} label="Or paste token / QR URL…" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="text-sm">
          <b>{p.name} ({p.checker_code})</b>
          {p.production_line_no ? ` · Line ${p.production_line_no}` : ''}
          {p.production_shift ? ` · Shift ${p.production_shift}` : ''} ·{' '}
          Scans <b>{t.scans}</b> · Pass <b>{t.accepted}</b> · Repair <b>{t.rework}</b> · Reject <b>{t.scrap}</b>
        </CardBody>
      </Card>

      {/* 2 · CURRENT WORK */}
      <Card id="queue" className="scroll-mt-16">
        <CardBody>
          <CardTitle>My assigned work</CardTitle>
          {(!data.queue || data.queue.mine.length === 0) && <p className="mt-1 text-sm text-slate-500">No work assigned to you right now — ask staff to assign articles.</p>}
          {(data.queue?.mine || []).map((r: any) => (
            <Link key={r.line_item_id} href={`/articles/${r.article_qr_token}`} className="mt-2 block rounded-md border border-green-600 bg-green-50 p-2.5 text-sm hover:shadow">
              <b>{r.purchase_order_no} · {r.article_no}</b> · {r.bag_size} · {r.counters?.stage === 'airwash' ? 'Level 2 Air-wash' : 'Level 1 QC'} · pending <b>{r.counters.pending}</b> / {r.order_qty} · {r.status}{r.assigned_qc_code ? ` · QC→${r.assigned_qc_code}` : ''}{r.assigned_aw_code ? ` · AW→${r.assigned_aw_code}` : ''}
            </Link>
          ))}
        </CardBody>
      </Card>

      {/* 3 · PAST WORK */}
      <Card id="history" className="scroll-mt-16">
        <CardBody>
          <CardTitle>Past work (latest first)</CardTitle>
          <div className="mt-2">
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className={thCls()}>date</th><th className={thCls()}>PO</th><th className={thCls()}>article</th><th className={thCls()}>role</th><th className={thCls()}>pass</th><th className={thCls()}>repair</th><th className={thCls()}>reject</th><th className={thCls()}>remark</th></tr></thead>
                <tbody>{(data.recent || []).map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={tdCls()}>{String(r.production_date || r.tested_at || '').slice(0, 10)}</td>
                    <td className={tdCls()}>{r.purchase_order_no}</td>
                    <td className={tdCls()}>{r.article_no}</td>
                    <td className={tdCls()}><Badge tone={r.role === 'Air-wash' ? 'blue' : 'slate'}>{r.role}</Badge></td>
                    <td className={tdCls()}>{r.accepted_qty}</td>
                    <td className={tdCls()}>{r.rework_qty}</td>
                    <td className={tdCls()}>{r.scrap_qty}</td>
                    <td className={tdCls()}>{r.notes || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </TableWrap>
          </div>
          {(!data.recent || data.recent.length === 0) && <p className="mt-2 text-sm text-slate-500">No work recorded yet — scan an article QR to start.</p>}
        </CardBody>
      </Card>

      {/* 4 · PROFILE */}
      <Card id="profile" className="scroll-mt-16">
        <CardBody className="text-sm">
          <CardTitle>Profile</CardTitle>
          <dl className="mt-2 space-y-1">
            <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Code</dt><dd className="font-semibold">{p.checker_code}</dd></div>
            <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Assigned line</dt><dd className="font-semibold">{p.production_line_no || '—'}</dd></div>
            <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Shift</dt><dd className="font-semibold">{p.production_shift || '—'}</dd></div>
            <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Status</dt><dd><StatusBadge status={p.active ? 'active' : 'inactive'} /></dd></div>
          </dl>
          <button onClick={switchTester} className="mt-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Switch tester / logout</button>
        </CardBody>
      </Card>
      <p className="text-xs text-slate-500">Tester view — your work only. Back-office pages need a separate staff login. Signed in as tester {code} on this device.</p>
    </div>
  );
}
