'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, QrCode } from 'lucide-react';
import { api } from '@/lib/api';
import { saveChecker } from '@/lib/checker';
import { TokenInput, extractToken } from '@/components/Qr';
import QrScanner from '@/components/QrScanner';
import { Card, CardBody, CardTitle, Badge, btnPrimary, btnSecondary, inputCls } from '@/components/ui';

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
    const t = extractToken(text);
    if (t) go(t);
  };

  const staffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await api.login(email, password);
      localStorage.setItem('staff_token', r.token);
      localStorage.setItem('staff_user', r.user?.email || email);
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
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Quality Check Process Management</h1>
        <p className="mt-2 text-sm text-slate-500">PO entry → QR labels → floor testing (QC + Air-wash) → pallet packing → reports.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map(([t, d]) => (
          <Card key={t}><CardBody className="!p-3 text-sm"><b className="text-slate-900">{t}</b><p className="mt-1 text-slate-600">{d}</p></CardBody></Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <CardTitle>Login</CardTitle>
            {(staff || tester) && (
              <div className="mt-2 space-y-1.5 text-sm">
                {staff && <div><Badge tone="green">Staff ✓</Badge> <button onClick={() => router.push('/admin')} className="ml-1 underline underline-offset-2">Go to Admin dashboard</button></div>}
                {tester && <div><Badge tone="amber">Tester: {tester}</Badge> <button onClick={() => router.push('/tester/dashboard')} className="ml-1 underline underline-offset-2">Go to My work</button></div>}
              </div>
            )}
            <div className="mt-3 flex gap-2 text-sm">
              <button onClick={() => setTab('staff')} className={`rounded-md border px-3 py-1.5 font-semibold ${tab === 'staff' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>Staff</button>
              <button onClick={() => setTab('tester')} className={`rounded-md border px-3 py-1.5 font-semibold ${tab === 'tester' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>Tester</button>
            </div>
            {tab === 'staff' ? (
              <form onSubmit={staffLogin} className="mt-3 space-y-2">
                <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls('!text-sm')} placeholder="email" autoComplete="username" />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className={inputCls('!text-sm')} placeholder="password" autoComplete="current-password" />
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button className={btnPrimary('!text-sm')}>Login as staff → Admin <ArrowRight size={15} /></button>
              </form>
            ) : (
              <form onSubmit={testerLogin} className="mt-3 space-y-2">
                <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls('!text-sm')} placeholder="Tester code e.g. 001" autoComplete="off" />
                {err && <p className="text-sm text-red-600">{err}</p>}
                <button className={btnPrimary('!text-sm')}>Login as tester → My work <ArrowRight size={15} /></button>
                <p className="text-xs text-slate-500">No password — code from Admin → Testers. Routes you to the Tester dashboard only.</p>
              </form>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <CardTitle><span className="inline-flex items-center gap-2"><QrCode size={18} /> Scan a QR</span></CardTitle>
            <p className="mt-1 text-xs text-slate-500">No login needed — open to staff and customers.</p>
            <div className="mt-3 space-y-3">
              <TokenInput onGo={go} label="Paste article / unit / pallet QR token or scan URL…" />
              <QrScanner onResult={fromScan} />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
