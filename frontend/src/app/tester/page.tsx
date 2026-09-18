'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardCheck, LogIn, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { getCheckerCode, saveChecker, clearChecker } from '@/lib/checker';
import { Card, CardBody, btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/ui';

function TesterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/tester/dashboard';
  const [code, setCode] = useState(getCheckerCode());
  const [name, setName] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('checker_name') || '' : ''
  );
  const [err, setErr] = useState('');

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!code.trim()) { setErr('Enter your tester code.'); return; }
    try {
      const c = await api.verifyChecker(code.trim());
      saveChecker(c.checker_code, c.device_token, c.name);
      setName(c.name);
      router.push(next);
    } catch (ex: any) { setErr(ex.message); }
  };

  const logout = () => {
    clearChecker();
    setCode('');
    setName('');
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-600 text-white">
          <ClipboardCheck size={22} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Tester login</h1>
        <p className="mt-1 text-sm text-slate-500">Floor access — scan QRs and record verdicts.</p>
        {name ? (
          <p className="mt-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
            Logged in as <b>{name} ({code})</b> on this device.<br />
            <button onClick={() => router.push('/tester/dashboard')} className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Open my dashboard</button>
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No tester logged in on this device.</p>
        )}
        <form className="mt-3 space-y-3" onSubmit={login}>
          <label className={labelCls()}>Tester code
            <input value={code} onChange={(e) => setCode(e.target.value)} className={inputCls('mt-1 !py-3 !text-base')} placeholder="e.g. 001" autoComplete="off" inputMode="text" />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button className={btnPrimary('flex-1 !py-3')}><LogIn size={16} /> Login</button>
            {name && <button type="button" onClick={logout} className={btnSecondary()}><LogOut size={15} /> Logout</button>}
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">No password — your tester code (from Admin → Testers) identifies you. This device remembers you; every scan still records your code. One ready-made login: code <b>001</b> (Tester 001).</p>
      </CardBody>
    </Card>
  );
}

export default function TesterLogin() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <TesterForm />
    </Suspense>
  );
}
