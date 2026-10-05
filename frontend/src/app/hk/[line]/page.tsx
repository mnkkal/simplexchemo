'use client';
import Link from 'next/link';
import { ClipboardCheck, Eye, SprayCan } from 'lucide-react';
import { Card, CardBody, PageHeader } from '@/components/ui';

export default function HkLine({ params }: { params: { line: string } }) {
  const line = decodeURIComponent(params.line);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title={`Line ${line} — Housekeeping`} subtitle={`${today} · what do you want to do?`} />
      <div className="grid gap-3">
        <Link href={`/hk/${encodeURIComponent(line)}/housekeeping`}>
          <Card className="transition-shadow hover:shadow">
            <CardBody className="flex items-center gap-3 !p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white"><SprayCan size={22} /></span>
              <span>
                <span className="block font-bold text-slate-900">Housekeeper Operation</span>
                <span className="block text-xs text-slate-500">Record sweeping, mopping, machine cleaning for a time slot.</span>
              </span>
            </CardBody>
          </Card>
        </Link>
        <Link href={`/hk/${encodeURIComponent(line)}/inspect`}>
          <Card className="transition-shadow hover:shadow">
            <CardBody className="flex items-center gap-3 !p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white"><ClipboardCheck size={22} /></span>
              <span>
                <span className="block font-bold text-slate-900">Inspection Operation</span>
                <span className="block text-xs text-slate-500">Check the day&apos;s work against the 7 standards, with photos.</span>
              </span>
            </CardBody>
          </Card>
        </Link>
        <Link href={`/hk/view?line=${encodeURIComponent(line)}`}>
          <Card className="transition-shadow hover:shadow">
            <CardBody className="flex items-center gap-3 !p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white"><Eye size={22} /></span>
              <span>
                <span className="block font-bold text-slate-900">Viewer</span>
                <span className="block text-xs text-slate-500">Read-only: this line&apos;s data by day, week, month.</span>
              </span>
            </CardBody>
          </Card>
        </Link>
      </div>
    </div>
  );
}
