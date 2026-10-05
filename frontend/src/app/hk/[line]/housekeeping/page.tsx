'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, CardBody, PageHeader, btnPrimary, inputCls, labelCls } from '@/components/ui';

type Opt = { value: string; label: string };

function currentSlot(slots: Opt[]): string {
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let pick = slots[0]?.value || '08:00';
  for (const s of slots) if (s.value <= hm) pick = s.value;
  return pick;
}

function TriToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['done', 'not_done'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-md border px-4 py-3 font-bold ${
            value === v
              ? v === 'done'
                ? 'border-green-700 bg-green-700 text-white'
                : 'border-red-700 bg-red-700 text-white'
              : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          {v === 'done' ? '✓ Done' : '✕ Not done'}
        </button>
      ))}
    </div>
  );
}

export default function HkHousekeeping({ params }: { params: { line: string } }) {
  const line = decodeURIComponent(params.line);
  const router = useRouter();
  const [meta, setMeta] = useState<any>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState('');
  const [shift, setShift] = useState('');
  const [sweeper, setSweeper] = useState('');
  const [sweeping, setSweeping] = useState('');
  const [mopping, setMopping] = useState('');
  const [machine, setMachine] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.hkMeta().then((m: any) => {
      setMeta(m);
      setSlot((s) => s || currentSlot(m.slots || []));
    }).catch((e: any) => setErr(e.message));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!slot || !shift) { setErr('Select shift and time slot.'); return; }
    if (!sweeper.trim()) { setErr('Enter sweeper name.'); return; }
    if (!sweeping || !mopping || !machine) { setErr('Mark sweeping, mopping and machine cleaning.'); return; }
    try {
      await api.hkEntryCreate({
        line_no: line, cleaning_date: date, slot, shift,
        sweeper_name: sweeper.trim(), sweeping, mopping, machine_cleaning: machine,
      });
      setMsg(`Recorded ✓ Line ${line} · ${date} · slot ${slot}.`);
      setSweeping(''); setMopping(''); setMachine('');
    } catch (ex: any) { setErr(ex.message); }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title={`Housekeeper — Line ${line}`} subtitle="One entry per 2-hour slot. Date and slot prefill — verify before saving." />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg} <button onClick={() => router.push(`/hk/${encodeURIComponent(line)}`)} className="underline underline-offset-2">Back</button></p>}
      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls()}>Date
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls('mt-1')} />
              </label>
              <label className={labelCls()}>Time slot
                <select value={slot} onChange={(e) => setSlot(e.target.value)} className={inputCls('mt-1')}>
                  <option value="">— Select —</option>
                  {(meta?.slots || []).map((s: Opt) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>
            <div>
              <span className={labelCls()}>Shift</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(meta?.shifts || ['A', 'B']).map((s: string) => (
                  <button key={s} type="button" onClick={() => setShift(s)} className={`rounded-md border px-4 py-2.5 font-bold ${shift === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{s}</button>
                ))}
              </div>
            </div>
            <label className={labelCls()}>Sweeper name
              <input value={sweeper} onChange={(e) => setSweeper(e.target.value)} placeholder="e.g. Reena" autoComplete="off" className={inputCls('mt-1 !py-3 !text-base')} />
            </label>
            <div>
              <span className={labelCls()}>Sweeping status</span>
              <div className="mt-1"><TriToggle value={sweeping} onChange={setSweeping} /></div>
            </div>
            <div>
              <span className={labelCls()}>Mopping status</span>
              <div className="mt-1"><TriToggle value={mopping} onChange={setMopping} /></div>
            </div>
            <div>
              <span className={labelCls()}>Machine cleaning status</span>
              <div className="mt-1"><TriToggle value={machine} onChange={setMachine} /></div>
            </div>
            <button className={btnPrimary('w-full !py-3 !text-base')}>Save entry</button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
