'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getCheckerCode, clearChecker } from '@/lib/checker';

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

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">My work — {p.name}</h1>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="border bg-white p-3">
          <b>Profile</b>
          <div>Code: <b>{p.checker_code}</b></div>
          <div>Assigned line: <b>{p.production_line_no || '—'}</b></div>
          <div>Shift: <b>{p.production_shift || '—'}</b></div>
          <div>Status: <b>{p.active ? 'active' : 'inactive'}</b></div>
        </div>
        <div className="border bg-white p-3">
          <b>Totals</b>
          <div>Scans: <b>{t.scans}</b> (QC {t.as_qc} · Air-wash {t.as_air_wash})</div>
          <div>Pass: <b>{t.accepted}</b> · Repair: <b>{t.rework}</b> · Reject: <b>{t.scrap}</b></div>
          <div className="mt-2"><Link href="/tester" className="underline">Switch tester / logout</Link></div>
        </div>
      </div>
      <div>
        <h2 className="font-bold">My queue — POs assigned to my line{p.production_line_no ? ` (${p.production_line_no})` : ''}</h2>
        {(!data.queue || data.queue.mine.length === 0) && <p className="text-sm text-slate-500">Nothing pending on your line right now.</p>}
        {(data.queue?.mine || []).map((r: any) => (
          <Link key={r.line_item_id} href={`/articles/${r.article_qr_token}`} className="mt-1 block border border-green-600 bg-green-50 p-2 text-sm">
            <b>{r.purchase_order_no} · {r.article_no}</b> · {r.bag_size} · pending <b>{r.counters.pending}</b> / {r.order_qty} · {r.status}
          </Link>
        ))}
      </div>
      <div>
        <h2 className="font-bold">Other pending articles</h2>
        {(!data.queue || data.queue.other.length === 0) && <p className="text-sm text-slate-500">Nothing else pending.</p>}
        {(data.queue?.other || []).map((r: any) => (
          <Link key={r.line_item_id} href={`/articles/${r.article_qr_token}`} className="mt-1 block border bg-white p-2 text-sm">
            <b>{r.purchase_order_no} · {r.article_no}</b> · {r.bag_size} · pending <b>{r.counters.pending}</b> / {r.order_qty} · {r.status}{r.last_line ? ` · line ${r.last_line}` : ' · not started'}
          </Link>
        ))}
      </div>
      <div>
        <h2 className="font-bold">By order / article</h2>
        <table className="w-full border bg-white text-sm">
          <thead><tr className="bg-slate-100"><th className="border p-1">Order | Article</th><th className="border p-1">scans</th><th className="border p-1">pass</th><th className="border p-1">repair</th><th className="border p-1">reject</th></tr></thead>
          <tbody>{(data.by_article || []).map((r: any, i: number) => (
            <tr key={i}><td className="border p-1">{r.order}</td><td className="border p-1">{r.scans}</td><td className="border p-1">{r.accepted}</td><td className="border p-1">{r.rework}</td><td className="border p-1">{r.scrap}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div>
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
      <p className="text-xs text-slate-500">Tester view — your work only. Back-office pages need a separate staff login. Signed in as tester {code} on this device.</p>
    </div>
  );
}
