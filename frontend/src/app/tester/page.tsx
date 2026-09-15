'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { getCheckerCode, saveChecker, clearChecker } from '@/lib/checker';

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
    <div className="max-w-sm space-y-3">
      <h1 className="text-xl font-bold">Tester login</h1>
      {name ? (
        <p className="border bg-green-50 p-3 text-sm">
          Logged in as <b>{name} ({code})</b> on this device.<br />
          <button onClick={() => router.push('/tester/dashboard')} className="mt-2 bg-slate-900 px-4 py-2 text-white">Open my dashboard</button>
        </p>
      ) : (
        <p className="text-sm text-slate-500">No tester logged in on this device.</p>
      )}
      <form className="space-y-3" onSubmit={login}>
        <label className="block text-sm">Tester code
          <input value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full border p-2" placeholder="e.g. 001" />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button className="bg-slate-900 px-4 py-2 text-white">Login</button>
          {name && <button type="button" onClick={logout} className="border px-4 py-2">Logout</button>}
        </div>
      </form>
      <p className="text-xs text-slate-500">No password — your tester code (from Admin → Testers) identifies you. This device remembers you; every scan still records your code. One ready-made login: code <b>001</b> (Tester 001).</p>
    </div>
  );
}

export default function TesterLogin() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <TesterForm />
    </Suspense>
  );
}
