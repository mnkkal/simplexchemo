'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, scanUrl } from '@/lib/api';
import { extractToken } from '@/components/Qr';
import { enqueue } from '@/lib/offline';
import { useRequireStaff } from '@/lib/requireStaff';
import { QRCodeSVG } from 'qrcode.react';

export default function PackPallet() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <PackPalletForm />
    </Suspense>
  );
}

function PackPalletForm() {
  const router = useRouter();
  const params = useSearchParams();
  const allowed = useRequireStaff('/pallet/new');
  const [mode, setMode] = useState<'articles' | 'units'>('articles');
  const [tokens, setTokens] = useState('');
  const [f, setF] = useState({ pallet_no: '', packing_date: new Date().toISOString().slice(0, 10), packing_time: '', packing_shift: 'A', packing_supervisor_name: '', packing_machine_operator_name: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const set = (k: string, v: any) => setF((s) => ({ ...s, [k]: v }));

  // Prefill from a completed article page (?articles=<token>&...).
  // Date/time already autofill (today / now at submit).
  useEffect(() => {
    const pre = params.getAll('articles').filter(Boolean);
    if (pre.length > 0) {
      setMode('articles');
      setTokens(pre.join('\n'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setDone(null);
    const pack: any = { ...f, packing_time: f.packing_time || new Date().toTimeString().slice(0, 5) };
    if (mode === 'articles') {
      // One per line: "<article token or scan URL> [pcs]" — pcs defaults to
      // all remaining passed stock. Only fully-tested articles pack.
      // Anything that doesn't look like a token (min 8 chars) is rejected
      // up front with the line number instead of failing the whole pallet.
      const articles: { article_token: string; qty?: number }[] = [];
      const bad: string[] = [];
      tokens.split('\n').map((ln) => ln.trim()).filter(Boolean).forEach((ln, i) => {
        const parts = ln.split(/\s+/);
        const last = parts[parts.length - 1];
        let qty: number | undefined;
        let tokStr = ln;
        if (parts.length > 1 && /^\d+$/.test(last)) { qty = Number(last); tokStr = parts.slice(0, -1).join(' '); }
        const t = extractToken(tokStr);
        if (!t || t.length < 8) { bad.push(`line ${i + 1} (“${ln}”)`); return; }
        articles.push(qty ? { article_token: t, qty } : { article_token: t });
      });
      if (bad.length > 0) { setErr(`These lines don't look like article QRs — remove or fix them: ${bad.join(', ')}.`); return; }
      if (articles.length === 0) { setErr('Paste at least one article QR token or scan URL (optional pcs after a space).'); return; }
      pack.articles = articles;
    } else {
      const unit_tokens = tokens.split(/[\s,]+/).map((t) => {
        const m = t.match(/scan\/([A-Za-z0-9]+)/);
        return m ? m[1] : t;
      }).filter(Boolean);
      const badUnit = unit_tokens.find((t) => t.length < 8);
      if (badUnit) { setErr(`“${badUnit}” doesn't look like a unit QR token — paste full tokens or scan URLs.`); return; }
      if (unit_tokens.length === 0) { setErr('Paste at least one unit QR token or scan URL.'); return; }
      pack.unit_tokens = unit_tokens;
    }
    try {
      setDone(await api.createPallet(pack));
      setTokens('');
    } catch (ex: any) {
      if (/401|Unauthenticated/i.test(ex.message)) { router.replace('/login?next=/pallet/new'); return; }
      if (!navigator.onLine || /fetch|network|Failed/i.test(ex.message)) {
        const uuid = await enqueue('pallet', pack);
        setErr(`Offline — packing queued for sync (session ${uuid.slice(0, 8)}…). Same session will not create a duplicate pallet on retry.`);
      } else setErr(ex.message);
    }
  };

  if (!allowed) return <p>Checking staff login…</p>;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-bold">Pallet packing → new pallet QR</h1>
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => { setMode('articles'); setTokens(''); setErr(''); }} className={`border px-3 py-1 ${mode === 'articles' ? 'bg-slate-900 text-white' : ''}`}>Tested articles</button>
        <button type="button" onClick={() => { setMode('units'); setTokens(''); setErr(''); }} className={`border px-3 py-1 ${mode === 'units' ? 'bg-slate-900 text-white' : ''}`}>Legacy units</button>
      </div>
      <form onSubmit={submit} className="space-y-3">
        {mode === 'articles' ? (
          <label className="block text-sm">Article QR tokens / scan URLs — one per line, optional pcs after a space (default: all remaining passed stock; only fully-tested articles)
            <textarea required value={tokens} onChange={(e) => setTokens(e.target.value)} rows={5} className="w-full border p-2 font-mono text-xs" placeholder="<article token or scan URL> [pcs]" />
          </label>
        ) : (
          <label className="block text-sm">Unit QR tokens / scan URLs (one per line — only fully-passed units)
            <textarea required value={tokens} onChange={(e) => setTokens(e.target.value)} rows={5} className="w-full border p-2 font-mono text-xs" placeholder="paste tokens or full scan URLs" />
          </label>
        )}
        {(['pallet_no', 'packing_date', 'packing_time', 'packing_shift', 'packing_supervisor_name', 'packing_machine_operator_name'] as const).map((k) => (
          <label key={k} className="block text-sm">{k}
            <input value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} className="w-full border p-2" required={['pallet_no', 'packing_date', 'packing_shift'].includes(k)} />
          </label>
        ))}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="bg-slate-900 px-4 py-2 text-white">Save + generate pallet QR</button>
      </form>
      {done && (
        <div className="border bg-white p-4 text-center">
          <b>Pallet {done.pallet_no} · {done.pallet_pcs} pcs</b>
          {(done.article_lines || []).length > 0 && (
            <div className="mx-auto mt-2 max-w-sm text-left text-sm">
              {(done.article_lines as any[]).map((l: any) => (
                <div key={l.id} className="border-b py-1">{l.article_no} · {l.bag_size} · packed <b>{l.pivot?.qty}</b></div>
              ))}
            </div>
          )}
          <QRCodeSVG value={scanUrl(done.pallet_qr_token)} size={180} className="mx-auto my-2" />
          <div className="break-all text-xs">{scanUrl(done.pallet_qr_token)}</div>
          <div className="text-xs text-slate-500">Brand-new token — not reused from any unit. Common info copied: {done.customer_name} · {done.purchase_order_no} · {done.article_no} · {done.bag_size}.</div>
          <button onClick={() => window.print()} className="mt-2 border px-3 py-1 text-sm print:hidden">Print label</button>
        </div>
      )}
    </div>
  );
}
