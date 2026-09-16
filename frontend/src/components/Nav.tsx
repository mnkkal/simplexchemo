'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Nav() {
  const router = useRouter();
  const [staff, setStaff] = useState(false);
  const [staffUser, setStaffUser] = useState('');
  const [tester, setTester] = useState('');
  const [testerName, setTesterName] = useState('');
  useEffect(() => {
    const sync = () => {
      setStaff(!!localStorage.getItem('staff_token'));
      setStaffUser(localStorage.getItem('staff_user') || '');
      const code = localStorage.getItem('checker_code') || '';
      const name = localStorage.getItem('checker_name') || '';
      setTester(code);
      setTesterName(name);
    };
    sync();
    window.addEventListener('storage', sync);
    // Same-tab updates don't fire storage events; re-sync on navigation focus.
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);
  // Role-based nav: staff sees back-office, tester sees only QA/scan areas.
  const logoutStaff = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    setStaff(false);
    setStaffUser('');
    router.push('/login');
  };
  return (
    <nav className="sticky top-0 z-10 bg-slate-900 text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/" className="font-bold">QC Process</Link>
        {staff ? (
          <>
            <Link href="/pos" className="text-sm opacity-90 hover:opacity-100">POs</Link>
            <Link href="/pos/new" className="text-sm opacity-90 hover:opacity-100">+ New PO</Link>
            <Link href="/orders" className="text-sm opacity-90 hover:opacity-100">Orders</Link>
            <Link href="/pallet/new" className="text-sm opacity-90 hover:opacity-100">Pack Pallet</Link>
            <Link href="/admin" className="text-sm opacity-90 hover:opacity-100">Admin</Link>
            <span title="Staff session active on this browser" className="rounded bg-green-700 px-2 py-0.5 text-xs">Staff ✓</span>
          </>
        ) : tester ? (
          <>
            <Link href="/tester/dashboard#scan" className="text-sm opacity-90 hover:opacity-100">📷 Scan</Link>
            <Link href="/tester/dashboard#queue" className="text-sm opacity-90 hover:opacity-100">Queue</Link>
            <Link href="/tester/dashboard#history" className="text-sm opacity-90 hover:opacity-100">History</Link>
            <Link href="/tester/dashboard#profile" className="text-sm opacity-90 hover:opacity-100">Profile</Link>
            <span title="Tester session active on this browser" className="rounded bg-amber-600 px-2 py-0.5 text-xs">Tester: {testerName ? `${testerName} (${tester})` : tester}</span>
          </>
        ) : (
          <>
            <Link href="/tester" className="text-sm opacity-90 hover:opacity-100">Tester login</Link>
          </>
        )}
        {staff ? (
          <span className="ml-auto text-sm" title="Logged-in staff admin">
            {staffUser || 'Admin'} <button onClick={logoutStaff} className="ml-2 underline opacity-90 hover:opacity-100">Logout</button>
          </span>
        ) : (
          <Link href="/login" className="ml-auto text-sm opacity-90 hover:opacity-100">Staff login</Link>
        )}
      </div>
    </nav>
  );
}
