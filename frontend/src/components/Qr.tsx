'use client';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { scanUrl } from '@/lib/api';

export default function QrLabel({ token, title, lines }: { token: string; title: string; lines: string[] }) {
  const url = scanUrl(token);
  return (
    <div className="inline-block border p-4 text-center print:break-inside-avoid">
      <div className="text-sm font-bold">{title}</div>
      {lines.map((l) => (
        <div key={l} className="text-xs">{l}</div>
      ))}
      <QRCodeSVG value={url} size={160} className="mx-auto my-2" />
      <div className="max-w-[220px] break-all text-[10px]">{url}</div>
      <button onClick={() => window.print()} className="mt-2 border px-3 py-1 text-xs print:hidden">Print</button>
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
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={label} className="flex-1 border p-2" />
      <button className="bg-slate-900 px-4 py-2 text-white">Go</button>
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
