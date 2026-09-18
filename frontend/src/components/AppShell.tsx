'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Camera,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  QrCode,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { clearChecker } from '@/lib/checker';

function isPublicPath(p: string) {
  return p === '/' || p.startsWith('/scan/');
}

const TITLES: [RegExp, string][] = [
  [/^\/admin$/, 'Dashboard'],
  [/^\/pos\/new$/, 'New Purchase Order'],
  [/^\/pos\/[^/]+$/, 'Purchase Order Detail'],
  [/^\/pos$/, 'Purchase Orders'],
  [/^\/pallet\/new$/, 'Pallet Packing'],
  [/^\/tester\/dashboard/, 'My Work'],
  [/^\/tester$/, 'Tester Login'],
  [/^\/login$/, 'Staff Login'],
  [/^\/articles\//, 'Article QC'],
  [/^\/qc\//, 'QC Entry'],
  [/^\/orders/, 'Orders (Legacy)'],
];

function titleFor(path: string) {
  for (const [re, t] of TITLES) if (re.test(path)) return t;
  return 'QC Process';
}

type NavItem = { href: string; label: string; icon: any; exact?: boolean };

const STAFF_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/pos', label: 'POs', icon: ClipboardList },
  { href: '/pallet/new', label: 'Pack Pallet', icon: Package },
  { href: '/admin#testers', label: 'Testers', icon: UsersRound },
  { href: '/admin#export', label: 'Reports', icon: BarChart3 },
];

const TESTER_NAV: NavItem[] = [
  { href: '/tester/dashboard#scan', label: 'Scan', icon: Camera },
  { href: '/tester/dashboard#queue', label: 'Queue', icon: QrCode },
  { href: '/tester/dashboard#history', label: 'History', icon: History },
  { href: '/tester/dashboard#profile', label: 'Profile', icon: UserRound },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [staff, setStaff] = useState(false);
  const [staffUser, setStaffUser] = useState('');
  const [tester, setTester] = useState('');
  const [testerName, setTesterName] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      setStaff(!!localStorage.getItem('staff_token'));
      setStaffUser(localStorage.getItem('staff_user') || '');
      setTester(localStorage.getItem('checker_code') || '');
      setTesterName(localStorage.getItem('checker_name') || '');
    };
    sync();
    try {
      const c = localStorage.getItem('qc-shell-collapsed');
      if (c === '1') setCollapsed(true);
    } catch {}
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem('qc-shell-collapsed', v ? '0' : '1');
      } catch {}
      return !v;
    });
  };

  const logoutStaff = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_user');
    setStaff(false);
    setStaffUser('');
    router.push('/login');
  };
  const logoutTester = () => {
    clearChecker();
    setTester('');
    setTesterName('');
    router.push('/tester');
  };

  // Public pages (landing + customer scan): minimal centered, no sidebar.
  if (isPublicPath(pathname)) {
    return (
      <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
        <div className="border-b border-slate-800 bg-[#0f172a] py-2.5 text-center text-sm font-bold tracking-wide text-white">
          QC Process
        </div>
        <main className="mx-auto w-full max-w-4xl px-4 py-6">{children}</main>
      </div>
    );
  }

  const authed = staff || !!tester;
  const items = staff ? STAFF_NAV : TESTER_NAV;
  const roleLabel = staff ? `Admin · ${staffUser || 'Staff'}` : tester ? `Tester · ${testerName ? `${testerName} (${tester})` : tester}` : '';

  const isActive = (it: NavItem) => {
    const base = it.href.split('#')[0];
    return it.exact ? pathname === base : pathname === base || pathname.startsWith(base + '/');
  };

  const sidebar = (overlay: boolean) => (
    <div className="flex h-full flex-col bg-[#0f172a] text-slate-200">
      <div className="flex items-center gap-2 px-4 py-4">
        <Link href={staff ? '/admin' : tester ? '/tester/dashboard' : '/'} className="truncate text-base font-bold tracking-wide text-white">
          {collapsed && !overlay ? 'QC' : 'QC Process'}
        </Link>
        {overlay && (
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="ml-auto rounded p-1 text-slate-300 hover:bg-slate-800">
            <X size={20} />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {items.map((it) => {
          const Icon = it.icon;
          const active = isActive(it);
          return (
            <Link
              key={it.href}
              href={it.href}
              title={collapsed && !overlay ? it.label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              } ${collapsed && !overlay ? 'justify-center px-2' : ''}`}
            >
              <Icon size={18} className="shrink-0" />
              {(!collapsed || overlay) && <span className="truncate">{it.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-2">
        {!overlay && (
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60 hover:text-white md:flex"
          >
            <PanelLeftClose size={18} className={collapsed ? 'rotate-180' : ''} />
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </div>
  );

  // Login screens (no session yet): simple centered card, no sidebar.
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
        <div className="border-b border-slate-800 bg-[#0f172a] py-2.5 text-center text-sm font-bold tracking-wide text-white">
          QC Process
        </div>
        <main className="mx-auto w-full max-w-md px-4 py-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden transition-all md:block ${collapsed ? 'w-16' : 'w-60'}`}>{sidebar(false)}</aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{sidebar(true)}</aside>
        </div>
      )}
      <div className={collapsed ? 'md:pl-16' : 'md:pl-60'}>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 md:hidden">
            <Menu size={20} />
          </button>
          <h1 className="truncate text-base font-semibold text-slate-900">{titleFor(pathname)}</h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden truncate text-sm text-slate-500 sm:inline">{roleLabel}</span>
            <button
              onClick={staff ? logoutStaff : logoutTester}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
