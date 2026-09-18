'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardBody, btnPrimary, inputCls, labelCls } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';
  const [email, setEmail] = useState('admin@factory.local');
  const [password, setPassword] = useState('password');
  const [err, setErr] = useState('');
  return (
    <Card>
      <CardBody>
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
          <KeyRound size={22} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Staff login</h1>
        <p className="mt-1 text-sm text-slate-500">Back-office access — POs, packing, admin.</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api.login(email, password);
              localStorage.setItem('staff_token', r.token);
              localStorage.setItem('staff_user', r.user?.email || email);
              router.push(next);
            } catch (ex: any) { setErr(ex.message); }
          }}
        >
          <label className={labelCls()}>Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls('mt-1')} placeholder="email" autoComplete="username" />
          </label>
          <label className={labelCls()}>Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className={inputCls('mt-1')} placeholder="password" autoComplete="current-password" />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className={btnPrimary('w-full !py-2.5')}><LogIn size={16} /> Login</button>
          <p className="text-xs text-slate-500">Seeded: admin@factory.local / password. Floor QC staff don&apos;t log in here — they use checker codes on QC pages.</p>
        </form>
      </CardBody>
    </Card>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
