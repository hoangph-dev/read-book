'use client';

import { useEffect } from 'react';

const SETTINGS_KEY = 'sach-settings';

/** Áp theme lưu trước khi render, khóa dọc, đăng ký SW. */
export function ShellInit() {
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
      const theme = saved.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'paper');
      document.documentElement.dataset.theme = theme;
    } catch {
      document.documentElement.dataset.theme = 'paper';
    }
    try {
      const o = screen.orientation as unknown as { lock?: (orientation: string) => Promise<void> };
      if (o && o.lock) o.lock('portrait').catch(() => {});
    } catch {
      /* trình duyệt không hỗ trợ */
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}