'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { compressImage, apiOrigin } from '@/lib/compressImage';
import { Badge, Card, CardBody, PageHeader, StatusBadge, btnPrimary, inputCls, labelCls } from '@/components/ui';

function statusTone(v: string) {
  return v === 'done' || v === 'ok' ? 'green' : 'red';
}

export default function HkInspect({ params }: { params: { line: string } }) {
  const line = decodeURIComponent(params.line);
  const today = new Date().toISOString().slice(0, 10);
  const [meta, setMeta] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [entryId, setEntryId] = useState<number | null>(null);
  const [inspector, setInspector] = useState('');
  const [overall, setOverall] = useState('');
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [remark, setRemark] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api.hkDiary({ line_no: line, from: today, to: today })
      .then((d: any) => {
        const list = Array.isArray(d) ? d : [];
        setEntries(list);
        if (entryId == null && list.length > 0) {
          const firstOpen = list.find((e: any) => !e.inspection) || list[0];
          setEntryId(firstOpen.id);
        }
      })
      .catch((e: any) => setErr(e.message));
  };
  useEffect(() => {
    api.hkMeta().then(setMeta).catch((e: any) => setErr(e.message));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entry = entries.find((e: any) => e.id === entryId) || null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!entry) { setErr('Select a time slot entry first.'); return; }
    if (entry.inspection) { setErr('This slot is already inspected.'); return; }
    if (!inspector.trim()) { setErr('Enter inspector name.'); return; }
    if (!overall) { setErr('Select overall housekeeping status.'); return; }
    const stds: { key: string; value: string }[] = (meta?.standards || []).map((s: any) => ({ key: s.key, value: checks[s.key] || '' }));
    if (stds.some((s) => !s.value)) { setErr('Answer all 7 housekeeping standards (OK / NOT OK).'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('hk_entry_id', String(entry.id));
      fd.append('inspector_name', inspector.trim());
      fd.append('overall_status', overall);
      if (remark.trim()) fd.append('remark', remark.trim());
      stds.forEach((s, i) => {
        fd.append(`standards[${i}][key]`, s.key);
        fd.append(`standards[${i}][value]`, s.value);
      });
      for (const f of photos.slice(0, 3)) {
        const blob = await compressImage(f);
        fd.append('photos[]', blob, f.name.replace(/\.[^.]+$/, '') + '.jpg');
      }
      await api.hkInspectCreate(fd);
      setMsg(`Inspection saved ✓ Line ${line} · slot ${entry.slot}.`);
      setInspector(''); setOverall(''); setChecks({}); setRemark(''); setPhotos([]);
      load();
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  const origin = apiOrigin();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title={`Inspection — Line ${line}`} subtitle={`${today} · pick a slot, verify against the 7 standards.`} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}

      <Card>
        <CardBody>
          <span className={labelCls()}>Time slot entry</span>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {entries.map((en: any) => (
              <button
                key={en.id}
                type="button"
                onClick={() => { setEntryId(en.id); setErr(''); }}
                className={`rounded-md border px-2 py-2 text-sm font-bold ${entryId === en.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
              >
                {en.slot} {en.inspection ? '✓' : ''}
              </button>
            ))}
          </div>
          {entries.length === 0 && <p className="mt-2 text-sm text-slate-500">No housekeeping entries today yet.</p>}
          {entry && (
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
              <b>{entry.slot}</b> · Shift {entry.shift} · Sweeper {entry.sweeper_name} ·
              Sweeping <Badge tone={statusTone(entry.sweeping)}>{entry.sweeping}</Badge>{' '}
              Mopping <Badge tone={statusTone(entry.mopping)}>{entry.mopping}</Badge>{' '}
              M/C <Badge tone={statusTone(entry.machine_cleaning)}>{entry.machine_cleaning}</Badge>
              {entry.inspection && <div className="mt-1">Inspected by <b>{entry.inspection.inspector_name}</b> · <StatusBadge status={entry.inspection.overall_status === 'ok' ? 'passed' : 'reject'} /> · {entry.inspection.overall_status.toUpperCase()}</div>}
            </div>
          )}
        </CardBody>
      </Card>

      {entry && !entry.inspection && (
        <Card>
          <CardBody>
            <form onSubmit={submit} className="space-y-4">
              <label className={labelCls()}>Inspector name
                <input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="e.g. Nikhil" autoComplete="off" className={inputCls('mt-1 !py-3 !text-base')} />
              </label>
              <div>
                <span className={labelCls()}>Overall housekeeping status</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {(['ok', 'not_ok'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setOverall(v)} className={`rounded-md border px-4 py-3 font-bold ${overall === v ? (v === 'ok' ? 'border-green-700 bg-green-700 text-white' : 'border-red-700 bg-red-700 text-white') : 'border-slate-300 bg-white text-slate-600'}`}>
                      {v === 'ok' ? '✓ OK' : '✕ NOT OK'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className={labelCls()}>Housekeeping standards check</span>
                <div className="mt-1 space-y-2">
                  {(meta?.standards || []).map((s: any) => (
                    <div key={s.key} className="rounded-md border border-slate-200 p-2">
                      <p className="text-sm text-slate-700">{s.label}</p>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        {(['ok', 'not_ok'] as const).map((v) => (
                          <button key={v} type="button" onClick={() => setChecks((c) => ({ ...c, [s.key]: v }))} className={`rounded border px-3 py-1.5 text-sm font-bold ${checks[s.key] === v ? (v === 'ok' ? 'border-green-700 bg-green-700 text-white' : 'border-red-700 bg-red-700 text-white') : 'border-slate-300 bg-white text-slate-500'}`}>
                            {v === 'ok' ? 'OK' : 'NOT OK'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <label className={labelCls()}>Remark
                <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} placeholder="e.g. bin near L2 overfilled at 10:00" className={inputCls('mt-1')} />
              </label>
              <div>
                <span className={labelCls()}>Photos (optional, max 3 — auto-compressed)</span>
                <input type="file" accept="image/*" multiple capture="environment" onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 3))} className="mt-1 block w-full text-sm text-slate-600" />
                {photos.length > 0 && <p className="mt-1 text-xs text-slate-500">{photos.length} photo(s) selected — compressed on upload to save server space.</p>}
              </div>
              <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50">
                {busy ? 'Uploading…' : 'Submit inspection'}
              </button>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
