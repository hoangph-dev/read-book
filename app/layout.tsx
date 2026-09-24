import type { Metadata, Viewport } from 'next';

import { Toaster } from '@/components/ui/sonner';
import { ShellInit } from '@/components/shell-init';

import './globals.css';

export const metadata: Metadata = {
  title: 'Sách - Thư viện đọc chung',
  description: 'Tải PDF lên và đọc mượt mà trên điện thoại, thư viện dùng chung cho mọi người.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Sách' },
};

export const viewport: Viewport = {
  themeColor: '#13161f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <ShellInit />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}