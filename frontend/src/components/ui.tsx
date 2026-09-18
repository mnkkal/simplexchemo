'use client';
import type { ReactNode } from 'react';

/* shadcn-style presentational primitives (Tailwind only, no extra deps).
 * Class names only — no behavior, no data logic. */

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string; [key: string]: any }) {
  return <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`} {...rest}>{children}</div>;
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-base font-semibold text-slate-900 ${className}`}>{children}</h2>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  green: 'bg-green-100 text-green-800 ring-green-600/20',
  red: 'bg-red-100 text-red-800 ring-red-600/20',
  amber: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  blue: 'bg-blue-100 text-blue-800 ring-blue-600/20',
  gray: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

/** Status → consistent color coding. Pure presentation mapping. */
export function statusTone(status: string): string {
  const s = (status || '').toLowerCase().replace(/[\s_]+/g, '');
  if (['pass', 'passed', 'accepted', 'complete', 'active'].includes(s)) return 'green';
  if (['repair', 'rework'].includes(s)) return 'amber';
  if (['reject', 'rejected', 'scrap', 'failed', 'inactive'].includes(s)) return 'red';
  if (['inprogress', 'in-progress'].includes(s)) return 'blue';
  if (['pending', 'new', 'queued'].includes(s)) return 'gray';
  return 'slate';
}

export function Badge({ tone = 'slate', children, className = '' }: { tone?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone] || badgeTones.slate} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, className = '' }: { status: string; className?: string }) {
  return <Badge tone={statusTone(status)} className={className}>{status}</Badge>;
}

export function btnPrimary(className = '') {
  return `inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 ${className}`;
}

export function btnSecondary(className = '') {
  return `inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 ${className}`;
}

export function btnDanger(className = '') {
  return `inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 ${className}`;
}

export function inputCls(className = '') {
  return `w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 ${className}`;
}

export function labelCls(className = '') {
  return `block text-sm font-medium text-slate-700 ${className}`;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">{children}</div>;
}

export function thCls(className = '') {
  return `border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`;
}

export function tdCls(className = '') {
  return `border-b border-slate-100 px-3 py-2 text-sm text-slate-800 ${className}`;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-3 py-4 text-sm text-slate-500">{children}</p>;
}
