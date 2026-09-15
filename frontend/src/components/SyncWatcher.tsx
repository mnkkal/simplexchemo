'use client';
import { useEffect } from 'react';
import { watchOnline, pendingCount } from '@/lib/offline';

export default function SyncWatcher() {
  useEffect(() => watchOnline(), []);
  useEffect(() => {
    pendingCount().then((n) => {
      if (n > 0) console.log(`${n} offline action(s) pending sync`);
    });
  }, []);
  return null;
}
