'use client';
import { useEffect, useRef, useState } from 'react';

export default function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  const [active, setActive] = useState(false);

  useEffect(() => {
    let scanner: any;
    let mounted = true;
    (async () => {
      if (!active) return;
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted || !ref.current) return;
        scanner = new Html5Qrcode('qc-reader');
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text: string) => {
          onResult(text);
          setActive(false);
        }, () => {});
      } catch (e: any) {
        setErr(e?.message || 'Camera unavailable');
        setActive(false);
      }
    })();
    return () => {
      mounted = false;
      scanner?.stop().catch(() => {}).then(() => scanner?.clear().catch(() => {}));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div>
      {!active ? (
        <button onClick={() => { setErr(''); setActive(true); }} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">📷 Scan with camera</button>
      ) : (
        <div>
          <div id="qc-reader" ref={ref} className="max-w-sm overflow-hidden rounded-lg border border-slate-200" />
          <button onClick={() => setActive(false)} className="mt-2 rounded-md border border-slate-300 px-4 py-1 text-sm text-slate-600 hover:bg-slate-50">Stop</button>
        </div>
      )}
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
    </div>
  );
}
