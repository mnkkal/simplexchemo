'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { saveChecker } from '@/lib/checker';
import { TokenInput } from '@/components/Qr';
import QrScanner from '@/components/QrScanner';

const STEPS = [
  ['1 · PO & Article Entry', 'Customer name, PO number, article numbers with per-article quantity.'],
  ['2 · QR Generation', 'One unique QR per article number — never PO-level.'],
  ['3 · Supplier Printing', 'Export the label file; supplier prints QR alongside article details.'],
  ['4 · Internal Scanning', 'Scan the printed label to attach date, shift, unit, line, supervisor.'],
  ['5 · Quality Check', 'Tester verdict: Pass, or Repair / Reject with remark. Re-scan rework until Accepted + Scrap = Order Qty.'],
];

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<'staff' | 'tester'>('staff');
  const [email, setEmail] = useState('admin@factory.local');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [staff, setStaff] = useState(false);
  const [tester, setTester] = useState('');

  useEffect(() => {
    setStaff(!!localStorage.getItem('staff_token'));
    setTester(localStorage.getItem('checker_code') || '');
  }, []);

  const go = (t: string) => {
    if (!t) return;
    router.push(`/scan/${encodeURIComponent(t)}`);
  };
  const fromScan = (text: string) => {
    const m = text.match(/scan\/([A-Za-z0-9]+)/);
    go(m ? m[1] : text.trim());
  };

  const staffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await api.login(email, password);
      localStorage.setItem('staff_token', r.token);
      router.push('/admin');
    } catch (ex: any) { setErr(ex.message); }
  };

  const testerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const c = await api.verifyChecker(code.trim());
      saveChecker(c.checker_code, c.device_token, c.name);
      router.push('/tester/dashboard');
    } catch (ex: any) { setErr(ex.message); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Quality Check Process Management</h1>

      <div className="grid gap-2 md:grid-cols-5">
        {STEPS.map(([t, d]) => (
          <div key={t} className="border bg-white p-3 text-sm"><b>{t}</b><p className="mt-1 text-slate-600">{d}</p></div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border bg-white p-4">
          <h2 className="font-bold">Login</h2>
          {(staff || tester) && (
            <div className="mt-2 space-y-1 text-sm">
              {staff && <div><span className="rounded bg-green-700 px-2 py-0.5 text-xs text-white">Staff ✓</span> <button onClick={() => router.push('/admin')} className="ml-2 underline">Go to Admin dashboard</button></div>}
              {tester && <div><span className="rounded bg-amber-600 px-2 py-0.5 text-xs text-white">Tester: {tester}</span> <button onClick={() => router.push('/tester/dashboard')} className="ml-2 underline">Go to My work</button></div>}
            </div>
          )}
          <div className="mt-3 flex gap-2 text-sm">
            <button onClick={() => setTab('staff')} className={`border px-3 py-1 ${tab === 'staff' ? 'bg-slate-900 text-white' : ''}`}>Staff</button>
            <button onClick={() => setTab('tester')} className={`border px-3 py-1 ${tab === 'tester' ? 'bg-slate-900 text-white' : ''}`}>Tester</button>
          </div>
          {tab === 'staff' ? (
            <form onSubmit={staffLogin} className="mt-3 space-y-2">
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2 text-sm" placeholder="email" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="w-full border p-2 text-sm" placeholder="password" />
              {err && <p className="text-sm text-red-600">{err}</p>}
              <button className="bg-slate-900 px-4 py-2 text-sm text-white">Login as staff → Admin</button>
            </form>
          ) : (
            <form onSubmit={testerLogin} className="mt-3 space-y-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border p-2 text-sm" placeholder="Tester code e.g. 001" />
              {err && <p className="text-sm text-red-600">{err}</p>}
              <button className="bg-slate-900 px-4 py-2 text-sm text-white">Login as tester → My work</button>
              <p className="text-xs text-slate-500">No password — code from Admin → Testers. Routes you to the Tester dashboard only.</p>
            </form>
          )}
        </div>
        <div className="border bg-white p-4">
          <h2 className="font-bold">Scan a QR</h2>
          <p className="text-xs text-slate-500">No login needed — open to staff and customers.</p>
          <div className="mt-2 space-y-3">
            <TokenInput onGo={go} label="Paste article / unit / pallet QR token or scan URL…" />
            <QrScanner onResult={fromScan} />
          </div>
        </div>
      </div>
    </div>
  );
}
