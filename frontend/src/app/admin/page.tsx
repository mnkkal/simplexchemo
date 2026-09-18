'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardBody, CardTitle, EmptyState, PageHeader, StatusBadge, TableWrap, btnDanger, btnPrimary, btnSecondary, inputCls, tdCls, thCls } from '@/components/ui';

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
        localStorage.removeItem('staff_user');
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

  const saveTester = async (c: any) => {
    try {
      const updated = await api.updateChecker(c.id, {
        name: c.name,
        checker_code: c.checker_code,
        production_line_no: c.production_line_no || null,
        production_shift: c.production_shift || null,
      });
      setCheckers((list) => list.map((x) => (x.id === c.id ? updated : x)));
    } catch (ex: any) { setErr(ex.message); }
  };

  const toggleChecker = async (c: any) => {
    try {
      const updated = await api.updateChecker(c.id, { active: !c.active });
      setCheckers((list) => list.map((x) => (x.id === c.id ? updated : x)));
    } catch (ex: any) { setErr(ex.message); }
  };

  const removeChecker = async (c: any) => {
    if (!confirm(`Remove tester ${c.name} (${c.checker_code})?`)) return;
    try {
      await api.deleteChecker(c.id);
      setCheckers((list) => list.filter((x) => (x.id !== c.id)));
    } catch (ex: any) { setErr(ex.message); }
  };

  const logout = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    router.replace('/login?next=/admin');
  };

  const statCards: [string, any][] = stats ? [
    ['POs', stats.purchase_orders ?? '—'],
    ['Articles', `${stats.articles ?? '—'} (${stats.articles_complete ?? 0} complete)`],
    ['Accepted', stats.article_remarks?.accepted ?? '—'],
    ['Rework / Scrap', `${stats.article_remarks?.rework ?? '—'} / ${stats.article_remarks?.scrap ?? '—'}`],
    ['Orders', stats.orders],
    ['Pallets', stats.pallets],
    ['Pass', stats.remarks.pass],
    ['Repair / Reject', `${stats.remarks.repair} / ${stats.remarks.reject}`],
  ] : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin dashboard"
        subtitle="Orders, quality results, testers and exports at a glance."
        actions={<button onClick={logout} className={btnSecondary('!px-3 !py-1.5')}><LogOut size={15} /> Logout</button>}
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map(([label, value]) => (
              <Card key={label}>
                <CardBody className="!p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
                </CardBody>
              </Card>
            ))}
          </div>
          {([['by_line', 'production_line_no', 'By line (unit flow)'], ['by_shift', 'production_shift', 'By shift (unit flow)'], ['by_checker', 'qc_checker_code', 'By checker (unit flow)']] as const).map(([k, col, title]) => (
            <Card key={k}>
              <CardBody>
                <CardTitle className="mb-2">{title}</CardTitle>
                <TableWrap>
                  <table className="w-full">
                    <thead><tr><th className={thCls()}>{col}</th><th className={thCls()}>total</th><th className={thCls()}>pass</th><th className={thCls()}>repair</th><th className={thCls()}>reject</th></tr></thead>
                    <tbody>
                      {(stats[k] || []).map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50"><td className={tdCls()}>{r[col] || r.qc_checker_name || '—'}</td><td className={tdCls()}>{r.total}</td><td className={tdCls()}>{r.pass}</td><td className={tdCls()}>{r.repair}</td><td className={tdCls()}>{r.reject}</td></tr>
                      ))}
                      {(stats[k] || []).length === 0 && <tr><td colSpan={5}><EmptyState>No data yet.</EmptyState></td></tr>}
                    </tbody>
                  </table>
                </TableWrap>
              </CardBody>
            </Card>
          ))}
          <Card>
            <CardBody>
              <CardTitle className="mb-2">Article by tester (accepted / rework / scrap)</CardTitle>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><th className={thCls()}>tester</th><th className={thCls()}>scans</th><th className={thCls()}>accepted</th><th className={thCls()}>rework</th><th className={thCls()}>scrap</th></tr></thead>
                  <tbody>{(stats.article_by_checker || []).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50"><td className={tdCls()}>{r.qc_checker_code || r.qc_checker_name || '—'}</td><td className={tdCls()}>{r.scans}</td><td className={tdCls()}>{r.accepted}</td><td className={tdCls()}>{r.rework}</td><td className={tdCls()}>{r.scrap}</td></tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle className="mb-2">Article by mfg line (worst fail line on top)</CardTitle>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><th className={thCls()}>mfg line</th><th className={thCls()}>scans</th><th className={thCls()}>accepted</th><th className={thCls()}>rework</th><th className={thCls()}>scrap</th></tr></thead>
                  <tbody>{(stats.article_by_line || []).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50"><td className={tdCls()}>{r.manufacturing_line_no || '—'}</td><td className={tdCls()}>{r.scans}</td><td className={tdCls()}>{r.accepted}</td><td className={tdCls()}>{r.rework}</td><td className={tdCls()}>{r.scrap}</td></tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle className="mb-2">Daily defects — Pass / Repair / Reject per day</CardTitle>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><th className={thCls()}>date</th><th className={thCls()}>scans</th><th className={thCls()}>pass</th><th className={thCls()}>repair</th><th className={thCls()}>reject</th></tr></thead>
                  <tbody>{(stats.article_daily || []).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50"><td className={tdCls()}>{String(r.day || '').slice(0, 10)}</td><td className={tdCls()}>{r.scans}</td><td className={tdCls()}>{r.accepted}</td><td className={tdCls()}>{r.rework}</td><td className={tdCls()}>{r.scrap}</td></tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <CardTitle className="mb-2">Article by shift (pass / repair / reject)</CardTitle>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><th className={thCls()}>shift</th><th className={thCls()}>scans</th><th className={thCls()}>pass</th><th className={thCls()}>repair</th><th className={thCls()}>reject</th></tr></thead>
                  <tbody>{(stats.article_by_shift || []).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50"><td className={tdCls()}>{r.production_shift || '—'}</td><td className={tdCls()}>{r.scans}</td><td className={tdCls()}>{r.accepted}</td><td className={tdCls()}>{r.rework}</td><td className={tdCls()}>{r.scrap}</td></tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            </CardBody>
          </Card>
        </>
      )}
      <Card>
        <CardBody>
          <div id="export" className="scroll-mt-20" />
          <CardTitle>Export</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Order &amp; Barcode · Production &amp; QC · Pallet Scanner · PO Articles · Article Scans</p>
          <button onClick={exportCsv} className={btnPrimary('mt-3')}><Download size={16} /> Export Excel</button>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <div id="testers" className="scroll-mt-20" />
          <CardTitle>Testers</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Checker code + production line + shift. Name and code are editable — Save applies all fields.</p>
          <form onSubmit={addChecker} className="mt-3 grid gap-2 sm:grid-cols-5">
            <input value={checker.name} onChange={(e) => setChecker({ ...checker, name: e.target.value })} placeholder="Tester name" className={inputCls()} required />
            <input value={checker.checker_code} onChange={(e) => setChecker({ ...checker, checker_code: e.target.value })} placeholder="Code e.g. T01" className={inputCls()} required />
            <input value={checker.production_line_no} onChange={(e) => setChecker({ ...checker, production_line_no: e.target.value })} placeholder="Line e.g. L2" className={inputCls()} />
            <input value={checker.production_shift} onChange={(e) => setChecker({ ...checker, production_shift: e.target.value })} placeholder="Shift e.g. A" className={inputCls()} />
            <button className={btnSecondary()}><Plus size={15} /> Add</button>
          </form>
          <div className="mt-3">
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className={thCls()}>Tester name</th><th className={thCls()}>Code</th><th className={thCls()}>Line</th><th className={thCls()}>Shift</th><th className={thCls()}>Status</th><th className={thCls()}>Since</th><th className={thCls()}>Actions</th></tr></thead>
                <tbody>{checkers.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className={tdCls()}><input value={c.name || ''} onChange={(e) => setCheckers((list) => list.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} className={inputCls('!w-28 !px-2 !py-1')} /></td>
                    <td className={tdCls()}><input value={c.checker_code || ''} onChange={(e) => setCheckers((list) => list.map((x) => (x.id === c.id ? { ...x, checker_code: e.target.value } : x)))} className={inputCls('!w-20 !px-2 !py-1')} /></td>
                    <td className={tdCls()}><input value={c.production_line_no || ''} onChange={(e) => setCheckers((list) => list.map((x) => (x.id === c.id ? { ...x, production_line_no: e.target.value } : x)))} placeholder="L2" className={inputCls('!w-20 !px-2 !py-1')} /></td>
                    <td className={tdCls()}><input value={c.production_shift || ''} onChange={(e) => setCheckers((list) => list.map((x) => (x.id === c.id ? { ...x, production_shift: e.target.value } : x)))} placeholder="A" className={inputCls('!w-16 !px-2 !py-1')} /></td>
                    <td className={tdCls()}><StatusBadge status={c.active ? 'active' : 'inactive'} /></td>
                    <td className={tdCls()}>{c.created_at ? String(c.created_at).slice(0, 10) : '—'}</td>
                    <td className={tdCls()}>
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => saveTester(c)} className={btnSecondary('!px-2 !py-1 !text-xs')}>Save</button>
                        <button onClick={() => toggleChecker(c)} className={btnSecondary('!px-2 !py-1 !text-xs')}>{c.active ? 'Deactivate' : 'Activate'}</button>
                        <button onClick={() => removeChecker(c)} className={btnDanger('!px-2 !py-1 !text-xs')}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </TableWrap>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
