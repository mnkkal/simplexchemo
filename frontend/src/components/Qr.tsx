'use client';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { scanUrl } from '@/lib/api';

export default function QrLabel({ token, title, lines }: { token: string; title: string; lines: string[] }) {
  const url = scanUrl(token);
  return (
    <div className="inline-block rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm print:break-inside-avoid print:shadow-none">
      <div className="text-sm font-bold text-slate-900">{title}</div>
      {lines.map((l) => (
        <div key={l} className="text-xs text-slate-500">{l}</div>
      ))}
      <QRCodeSVG value={url} size={160} className="mx-auto my-2" />
      <div className="max-w-[220px] break-all text-[10px] text-slate-400">{url}</div>
      <button onClick={() => window.print()} className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 print:hidden">Print</button>
    </div>
  );
}

export function TokenInput({ onGo, label }: { onGo: (t: string) => void; label: string }) {
  const [v, setV] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onGo(extractToken(v));
      }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={label} className="w-full flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500" />
      <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700">Go</button>
    </form>
  );
}

/** Pull a raw token out of camera/pasted input: full /scan/<t> or
 *  /articles/<t> URL, <t>?staff=1 query form, or a bare token. */
export function extractToken(text: string): string {
  const v = (text || '').trim();
  if (!v) return '';
  const m = v.match(/(?:scan|articles)\/([A-Za-z0-9]+)/);
  return m ? m[1] : v;
}
