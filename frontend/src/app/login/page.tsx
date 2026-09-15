'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';
  const [email, setEmail] = useState('admin@factory.local');
  const [password, setPassword] = useState('password');
  const [err, setErr] = useState('');
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api.login(email, password);
          localStorage.setItem('staff_token', r.token);
          router.push(next);
        } catch (ex: any) { setErr(ex.message); }
      }}
    >
      <h1 className="text-xl font-bold">Staff login</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2" placeholder="email" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="w-full border p-2" placeholder="password" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="bg-slate-900 px-4 py-2 text-white">Login</button>
      <p className="text-xs text-slate-500">Seeded: admin@factory.local / password. Floor QC staff don&apos;t log in here — they use checker codes on QC pages.</p>
    </form>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
