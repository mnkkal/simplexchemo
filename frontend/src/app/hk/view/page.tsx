'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, hkUrl } from '@/lib/api';
import { apiOrigin } from '@/lib/compressImage';
import { Badge, Card, CardBody, PageHeader, StatusBadge, TableWrap, btnSecondary, inputCls, labelCls, tdCls, thCls } from '@/components/ui';

function monday(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ViewerInner() {
  const params = useSearchParams();
  const [line, setLine] = useState(params.get('line') || '');
  const [from, setFrom] = useState(iso(new Date()));
  const [to, setTo] = useState(iso(new Date()));
  const [preset, setPreset] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [qrLine, setQrLine] = useState('');
  const origin = apiOrigin();

  const applyPreset = (p: 'day' | 'week' | 'month') => {
    const now = new Date();
    setPreset(p);
    if (p === 'day') { setFrom(iso(now)); setTo(iso(now)); }
    if (p === 'week') { setFrom(iso(monday(now))); setTo(iso(now)); }
    if (p === 'month') { setFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`); setTo(iso(now)); }
  };

  const load = () => {
    setErr('');
    api.hkDiary({ line_no: line.trim() || undefined, from: from || undefined, to: to || undefined })
      .then((d: any) => setRows(Array.isArray(d) ? d : []))
      .catch((e: any) => setErr(e.message));
  };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="Housekeeping viewer" subtitle="Read-only · same-day default, browse by week or month." />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Card>
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className={labelCls()}>Line no.
              <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. 2" className={inputCls('mt-1')} />
            </label>
            <label className={labelCls()}>From
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} className={inputCls('mt-1')} />
            </label>
            <label className={labelCls()}>To
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} className={inputCls('mt-1')} />
            </label>
            <div className="flex items-end">
              <button onClick={load} className={btnSecondary('w-full')}>Show</button>
            </div>
          </div>
          <div className="mt-2 flex gap-2 text-sm">
            {(['day', 'week', 'month'] as const).map((p) => (
              <button key={p} type="button" onClick={() => applyPreset(p)} className={`rounded-md border px-3 py-1.5 font-semibold capitalize ${preset === p ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{p === 'day' ? 'Today' : p === 'week' ? 'This week' : 'This month'}</button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="!p-0">
          <TableWrap>
            <table className="w-full">
              <thead><tr>
                <th className={thCls()}>date</th><th className={thCls()}>line</th><th className={thCls()}>slot</th>
                <th className={thCls()}>shift</th><th className={thCls()}>sweeper</th><th className={thCls()}>sweep</th>
                <th className={thCls()}>mop</th><th className={thCls()}>m/c</th><th className={thCls()}>inspector</th>
                <th className={thCls()}>overall</th><th className={thCls()}>remark</th><th className={thCls()}>photos</th>
              </tr></thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={tdCls()}>{String(r.cleaning_date).slice(0, 10)}</td>
                    <td className={tdCls()}><b>{r.line_no}</b></td>
                    <td className={tdCls()}>{r.slot}</td>
                    <td className={tdCls()}>{r.shift}</td>
                    <td className={tdCls()}>{r.sweeper_name}</td>
                    <td className={tdCls()}><Badge tone={r.sweeping === 'done' ? 'green' : 'red'}>{r.sweeping}</Badge></td>
                    <td className={tdCls()}><Badge tone={r.mopping === 'done' ? 'green' : 'red'}>{r.mopping}</Badge></td>
                    <td className={tdCls()}><Badge tone={r.machine_cleaning === 'done' ? 'green' : 'red'}>{r.machine_cleaning}</Badge></td>
                    <td className={tdCls()}>{r.inspection?.inspector_name || '—'}</td>
                    <td className={tdCls()}>{r.inspection ? <StatusBadge status={r.inspection.overall_status === 'ok' ? 'passed' : 'reject'} /> : <span className="text-slate-400">—</span>}</td>
                    <td className={tdCls()}>{r.inspection?.remark || '—'}</td>
                    <td className={tdCls()}>
                      {((r.inspection?.photo_paths || []) as string[]).map((p: string) => (
                        <a key={p} href={origin ? `${origin}/${p}` : `/${p}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={origin ? `${origin}/${p}` : `/${p}`} alt="housekeeping photo" className="mr-1 inline h-10 w-10 rounded object-cover" loading="lazy" />
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {rows.length === 0 && <p className="p-4 text-sm text-slate-500">No records in this range.</p>}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <b className="text-sm">Print line QR (post one in front of each line)</b>
          <div className="mt-2 flex gap-2">
            <input value={qrLine} onChange={(e) => setQrLine(e.target.value)} placeholder="Line no. e.g. 2" className={inputCls('max-w-xs')} />
          </div>
          {qrLine.trim() && (
            <div className="mt-3 inline-block rounded-lg border border-slate-200 p-4 text-center">
              <div className="text-sm font-bold">Line {qrLine.trim()} · Housekeeping</div>
              <QRCodeSVG value={hkUrl(qrLine.trim())} size={160} className="mx-auto my-2" />
              <div className="max-w-[220px] break-all text-[10px] text-slate-400">{hkUrl(qrLine.trim())}</div>
              <button onClick={() => window.print()} className={`${btnSecondary('!py-1 !text-sm')} mt-2 print:hidden`}><Printer size={14} /> Print</button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function HkView() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ViewerInner />
    </Suspense>
  );
}
