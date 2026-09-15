'use client';
// Offline-first queue: QC remarks + pallet packs are written to IndexedDB
// first (with client-generated UUID + timestamp), then synced when online.

import { openDB, DBSchema } from 'idb';

interface QueueItem {
  id?: number;
  uuid: string;
  kind: 'qc' | 'pallet' | 'article-scan';
  payload: any;
  createdAt: string;
  synced: boolean;
}

interface QcDB extends DBSchema {
  queue: { key: number; value: QueueItem; indexes: { 'by-synced': number } };
  cache: { key: string; value: any };
}

let dbPromise: Promise<any> | null = null;
function db() {
  if (!dbPromise) {
    dbPromise = openDB<QcDB>('qc-pwa', 1, {
      upgrade(d) {
        const q = d.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        q.createIndex('by-synced', 'synced');
        d.createObjectStore('cache');
      },
    });
  }
  return dbPromise;
}

export function newUuid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueue(kind: 'qc' | 'pallet' | 'article-scan', payload: any) {
  const d = await db();
  const uuid = payload.client_uuid || newUuid();
  const item: QueueItem = {
    uuid,
    kind,
    payload: { ...payload, client_uuid: uuid },
    createdAt: new Date().toISOString(),
    synced: false,
  };
  await d.add('queue', item);
  // Try immediate sync; if offline it stays queued.
  syncQueue().catch(() => {});
  return uuid;
}

export async function pendingCount() {
  const d = await db();
  return d.countFromIndex('queue', 'by-synced', 0 as any).catch(() => 0);
}

export async function syncQueue() {
  const d = await db();
  const tx = d.transaction('queue', 'readwrite');
  const items: QueueItem[] = await tx.store.getAll();
  const { api } = await import('./api');
  for (const item of items) {
    if (item.synced) continue;
    try {
      if (item.kind === 'qc') await api.submitQc(item.payload);
      else if (item.kind === 'article-scan') await api.submitArticleScan(item.payload);
      else await api.createPallet(item.payload);
      item.synced = true;
      await tx.store.put(item);
    } catch {
      // stay queued; retry on next reconnect
    }
  }
  await tx.done;
  // prune synced items older than a day
  try {
    const d2 = await db();
    const all: QueueItem[] = await d2.getAll('queue');
    for (const it of all) if (it.synced) await d2.delete('queue', it.id!);
  } catch {}
}

export async function cacheSet(key: string, value: any) {
  try {
    const d = await db();
    await d.put('cache', value, key);
  } catch {}
}

export async function cacheGet(key: string) {
  try {
    const d = await db();
    return d.get('cache', key);
  } catch {
    return undefined;
  }
}

export function watchOnline() {
  if (typeof window === 'undefined') return () => {};
  const go = () => syncQueue().catch(() => {});
  window.addEventListener('online', go);
  const t = setInterval(go, 15000);
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then((reg: any) => reg.sync?.register('qc-sync').catch(() => {})).catch(() => {});
  }
  return () => {
    window.removeEventListener('online', go);
    clearInterval(t);
  };
}
