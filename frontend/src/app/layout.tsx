import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import SyncWatcher from '@/components/SyncWatcher';

export const metadata: Metadata = {
  title: 'QC Process Management',
  description: 'Barcode/QR quality check process management (PWA)',
  manifest: '/manifest.json',
};

export const viewport = { themeColor: '#0f172a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-slate-50 text-slate-900">
        <AppShell>
          <SyncWatcher />
          {children}
        </AppShell>
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}` }} />
      </body>
    </html>
  );
}
