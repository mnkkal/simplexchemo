'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function Admin() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState('');
  const [checker, setChecker] = useState({ name: '', checker_code: '', production_line_no: '', production_shift: '' });
  const [checkers, setCheckers] = useState<any[]>([]);

  // Admin is password-protected: staff login required.
  useEffect(() => {
    if (!localStorage.getItem('staff_token')) {
      router.replace('/login?next=/admin');
      return;
    }
    api.dashboard().then(setStats).catch((e: any) => {
      if (/401|Unauthenticated/i.test(e.message)) {
        localStorage.removeItem('staff_token');
        router.replace('/login?next=/admin');
      } else setErr(e.message);
    });
    api.checkers().then((d: any) => setCheckers(d.data || [])).catch(() => {});
  }, [router]);

  const exportCsv = async () => {
    const d = await api.exportData();
    const { utils, writeFile } = await import('xlsx');
    const wb = utils.book_new();
    (Object.entries({ 'Order & Barcode': d.order_barcode, 'Production & QC Data': d.production_qc, 'Pallet Scanner Data': d.pallet_scanner, 'PO Articles': d.po_articles || [], 'Article Scans': d.article_scans || [] }) as [string, any[]][]).forEach(([name, rows]) => {
      utils.book_append_sheet(wb, utils.json_to_sheet(rows), name);
    });
    writeFile(wb, 'qc-export-3tab.xlsx');
  };

  const addChecker = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createChecker({
        name: checker.name,
        checker_code: checker.checker_code,
        production_line_no: checker.production_line_no || undefined,
        production_shift: checker.production_shift || undefined,
      });
      setChecker({ name: '', checker_code: '', production_line_no: '', production_shift: '' });
      const d: any = await api.checkers();
      setCheckers(d.data || []);
    } catch (ex: any) { setErr(ex.message); }
  };

  const toggleChecker = async (c: any) => {
    try {
      const updated = await api.updateChecker(c.id, { active: !c.active });
      setCheckers((list) => list.map((x) => (x.id === c.id ? updated : x)));
    } catch (ex: any) { setErr(ex.message); }
  };

  const saveAssignment = async (c: any) => {
    try {
      const updated = await api.updateChecker(c.id, {
        production_line_no: c.production_line_no || null,
        production_shift: c.production_shift || null,
      });
      setCheckers((list) => list.map((x) => (x.id === c.id ? updated : x)));
    } catch (ex: any) { setErr(ex.message); }
  };

  const removeChecker = async (c: any) => {
    if (!confirm(`Remove tester ${c.name} (${c.checker_code})?`)) return;
    try {
      await api.deleteChecker(c.id);
      setCheckers((list) => list.filter((x) => x.id !== c.id));
    } catch (ex: any) { setErr(ex.message); }
  };

  const logout = () => {
    localStorage.removeItem('staff_token');
    router.replace('/login?next=/admin');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h1 className="text-xl font-bold">Admin dashboard</h1>
        <button onClick={logout} className="ml-auto border px-3 py-1 text-sm">Logout</button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="border bg-white p-3">POs<b className="block text-xl">{stats.purchase_orders ?? '—'}</b></div>
            <div className="border bg-white p-3">Articles<b className="block text-xl">{stats.articles ?? '—'} ({stats.articles_complete ?? 0} complete)</b></div>
            <div className="border bg-white p-3">Accepted<b className="block text-xl">{stats.article_remarks?.accepted ?? '—'}</b></div>
            <div className="border bg-white p-3">Rework/Scrap<b className="block text-xl">{stats.article_remarks?.rework ?? '—'}/{stats.article_remarks?.scrap ?? '—'}</b></div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="border bg-white p-3">Orders<b className="block text-xl">{stats.orders}</b></div>
            <div className="border bg-white p-3">Pallets<b className="block text-xl">{stats.pallets}</b></div>
            <div className="border bg-white p-3">Pass<b className="block text-xl">{stats.remarks.pass}</b></div>
            <div className="border bg-white p-3">Repair/Reject<b className="block text-xl">{stats.remarks.repair}/{stats.remarks.reject}</b></div>
          </div>
          {([['by_line', 'production_line_no'], ['by_shift', 'production_shift'], ['by_checker', 'qc_checker_code']] as const).map(([k, col]) => (
            <div key={k}>
              <h2 className="font-bold">{k} (unit flow)</h2>
              <table className="w-full border text-sm">
                <thead><tr className="bg-slate-100"><th className="border p-1">{col}</th><th className="border p-1">total</th><th className="border p-1">pass</th><th className="border p-1">repair</th><th className="border p-1">reject</th></tr></thead>
                <tbody>          {(stats[k] || []).map((r: any, i: number) => (
                  <tr key={i}><td className="border p-1">{r[col] || r.qc_checker_name || '—'}</td><td className="border p-1">{r.total}</td><td className="border p-1">{r.pass}</td><td className="border p-1">{r.repair}</td><td className="border p-1">{r.reject}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          <div>
            <h2 className="font-bold">article_by_tester (accepted / rework / scrap)</h2>
            <table className="w-full border text-sm">
              <thead><tr className="bg-slate-100"><th className="border p-1">tester</th><th className="border p-1">scans</th><th className="border p-1">accepted</th><th className="border p-1">rework</th><th className="border p-1">scrap</th></tr></thead>
              <tbody>{(stats.article_by_checker || []).map((r: any, i: number) => (
                <tr key={i}><td className="border p-1">{r.qc_checker_code || r.qc_checker_name || '—'}</td><td className="border p-1">{r.scans}</td><td className="border p-1">{r.accepted}</td><td className="border p-1">{r.rework}</td><td className="border p-1">{r.scrap}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div>
            <h2 className="font-bold">article_by_mfg_line (worst fail line on top)</h2>
            <table className="w-full border text-sm">
              <thead><tr className="bg-slate-100"><th className="border p-1">mfg line</th><th className="border p-1">scans</th><th className="border p-1">accepted</th><th className="border p-1">rework</th><th className="border p-1">scrap</th></tr></thead>
              <tbody>{(stats.article_by_line || []).map((r: any, i: number) => (
                <tr key={i}><td className="border p-1">{r.manufacturing_line_no || '—'}</td><td className="border p-1">{r.scans}</td><td className="border p-1">{r.accepted}</td><td className="border p-1">{r.rework}</td><td className="border p-1">{r.scrap}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div>
            <h2 className="font-bold">daily_defects — Pass / Repair / Reject per day</h2>
            <table className="w-full border text-sm">
              <thead><tr className="bg-slate-100"><th className="border p-1">date</th><th className="border p-1">scans</th><th className="border p-1">pass</th><th className="border p-1">repair</th><th className="border p-1">reject</th></tr></thead>
              <tbody>{(stats.article_daily || []).map((r: any, i: number) => (
                <tr key={i}><td className="border p-1">{String(r.day || '').slice(0, 10)}</td><td className="border p-1">{r.scans}</td><td className="border p-1">{r.accepted}</td><td className="border p-1">{r.rework}</td><td className="border p-1">{r.scrap}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div>
            <h2 className="font-bold">article_by_shift (pass / repair / reject)</h2>
            <table className="w-full border text-sm">
              <thead><tr className="bg-slate-100"><th className="border p-1">shift</th><th className="border p-1">scans</th><th className="border p-1">pass</th><th className="border p-1">repair</th><th className="border p-1">reject</th></tr></thead>
              <tbody>{(stats.article_by_shift || []).map((r: any, i: number) => (
                <tr key={i}><td className="border p-1">{r.production_shift || '—'}</td><td className="border p-1">{r.scans}</td><td className="border p-1">{r.accepted}</td><td className="border p-1">{r.rework}</td><td className="border p-1">{r.scrap}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      <div>
        <button onClick={exportCsv} className="bg-slate-900 px-4 py-2 text-white">Export 3-tab Excel (Order & Barcode · Production & QC · Pallet Scanner)</button>
      </div>
      <div>
        <h2 className="font-bold">Testers (checker code + production line + shift)</h2>
        <form onSubmit={addChecker} className="grid max-w-3xl gap-2 sm:grid-cols-5">
          <input value={checker.name} onChange={(e) => setChecker({ ...checker, name: e.target.value })} placeholder="Tester name" className="border p-2" required />
          <input value={checker.checker_code} onChange={(e) => setChecker({ ...checker, checker_code: e.target.value })} placeholder="Code e.g. T01" className="border p-2" required />
          <input value={checker.production_line_no} onChange={(e) => setChecker({ ...checker, production_line_no: e.target.value })} placeholder="Line e.g. L2" className="border p-2" />
          <input value={checker.production_shift} onChange={(e) => setChecker({ ...checker, production_shift: e.target.value })} placeholder="Shift e.g. A" className="border p-2" />
          <button className="border px-4">Add</button>
        </form>
        <table className="mt-2 w-full max-w-3xl border text-sm">
          <thead><tr className="bg-slate-100"><th className="border p-1">Tester</th><th className="border p-1">Line</th><th className="border p-1">Shift</th><th className="border p-1">Status</th><th className="border p-1">Actions</th></tr></thead>
          <tbody>{checkers.map((c: any) => (
            <tr key={c.id}>
              <td className="border p-1">{c.name} ({c.checker_code})</td>
              <td className="border p-1"><input value={c.production_line_no || ''} onChange={(e) => setCheckers((list) => list.map((x) => (x.id === c.id ? { ...x, production_line_no: e.target.value } : x)))} placeholder="L2" className="w-20 border p-1" /></td>
              <td className="border p-1"><input value={c.production_shift || ''} onChange={(e) => setCheckers((list) => list.map((x) => (x.id === c.id ? { ...x, production_shift: e.target.value } : x)))} placeholder="A" className="w-16 border p-1" /></td>
              <td className="border p-1">{c.active ? 'active' : 'inactive'}</td>
              <td className="border p-1 space-x-1">
                <button onClick={() => saveAssignment(c)} className="border px-2">Save</button>
                <button onClick={() => toggleChecker(c)} className="border px-2">{c.active ? 'Deactivate' : 'Activate'}</button>
                <button onClick={() => removeChecker(c)} className="border px-2 text-red-600">Remove</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
