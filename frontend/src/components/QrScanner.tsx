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
        <button onClick={() => { setErr(''); setActive(true); }} className="border px-4 py-2">📷 Scan with camera</button>
      ) : (
        <div>
          <div id="qc-reader" ref={ref} className="max-w-sm" />
          <button onClick={() => setActive(false)} className="mt-2 border px-4 py-1 text-sm">Stop</button>
        </div>
      )}
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
    </div>
  );
}
