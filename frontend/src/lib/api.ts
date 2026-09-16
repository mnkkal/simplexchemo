const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const APP = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function authHeaders(): HeadersInit {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('staff_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function deviceHeader(): HeadersInit {
  if (typeof window === 'undefined') return {};
  const t = localStorage.getItem('device_token');
  return t ? { 'X-Device-Token': t } : {};
}

async function req(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  // Orders (staff, legacy per-unit flow)
  orders: () => req('/orders'),
  createOrder: (data: any) => req('/orders', { method: 'POST', body: JSON.stringify(data) }),
  order: (id: string) => req(`/orders/${id}`),
  // Purchase orders — new flow: 1 PO = N articles, 1 QR per article
  purchaseOrders: () => req('/purchase-orders'),
  createPurchaseOrder: (data: any) => req('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  purchaseOrder: (id: string) => req(`/purchase-orders/${id}`),
  poLabels: (id: string) => req(`/purchase-orders/${id}/labels`, { method: 'POST' }),
  // Article QC (accepted / rework / scrap counts per scan)
  articleContext: (token: string) => req(`/articles/${token}`, { headers: deviceHeader() }),
  submitArticleScan: (data: any) => req('/article-scans', { method: 'POST', body: JSON.stringify(data) }),
  updateArticleScan: (id: number, data: any) => req(`/article-scans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  // QC
  qcContext: (token: string) => req(`/qc/${token}`, { headers: deviceHeader() }),
  submitQc: (data: any) => req('/qc', { method: 'POST', body: JSON.stringify(data) }),
  // Pallets
  createPallet: (data: any) => req('/pallets', { method: 'POST', body: JSON.stringify(data) }),
  pallets: () => req('/pallets'),
  pallet: (id: string) => req(`/pallets/${id}`),
  // Scan (public; staff=1 unlocks full history when authed)
  scan: (token: string, staff = false) => req(`/scan/${token}${staff ? '?staff=1' : ''}`),
  // Tester self-service (device-token auth, own work only)
  testerWork: (checker_code: string) => req(`/tester/${encodeURIComponent(checker_code)}/work`, {
    headers: deviceHeader(),
  }),
  // Checkers
  verifyChecker: (checker_code: string) => req('/checkers/verify', { method: 'POST', body: JSON.stringify({ checker_code }) }),
  checkers: () => req('/checkers'),
  createChecker: (data: any) => req('/checkers', { method: 'POST', body: JSON.stringify(data) }),
  updateChecker: (id: number, data: { active?: boolean; name?: string; checker_code?: string; production_line_no?: string | null; production_shift?: string | null }) => req(`/checkers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteChecker: (id: number) => req(`/checkers/${id}`, { method: 'DELETE' }),
  // Dashboard / export
  dashboard: () => req('/dashboard'),
  exportData: () => req('/export'),
  // Auth
  login: (email: string, password: string) => req('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
};

export function scanUrl(token: string) {
  return `${APP}/scan/${token}`;
}

export function qrApiUrl(token: string) {
  return `${API}/scan/${token}`;
}
