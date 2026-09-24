'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Settings2, List, X } from 'lucide-react';

import { getSharedBook } from '@/lib/api';
import { extractText, EXTRACT_VERSION, type Page } from '@/lib/extract';
import { idbGet, idbPut } from '@/lib/idb';
import type { Book } from '@/lib/types';

const SETTINGS_KEY = 'sach-settings';
const CHUNK_SIZE = 25;
const FONT_MIN = 15;
const FONT_MAX = 34;

const DEFAULTS = {
  theme: 'paper' as 'dark' | 'paper' | 'light',
  fontSize: 20,
  fontFamily: 'serif' as 'serif' | 'sans',
};

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id || '';

  const mainRef = useRef<HTMLDivElement>(null);
  const tocListRef = useRef<HTMLUListElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const pageInfoRef = useRef<HTMLSpanElement>(null);
  const loadTextRef = useRef<HTMLParagraphElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  const bookRef = useRef<Book | null>(null);
  const pageElsRef = useRef<HTMLElement[]>([]);
  const offsetsRef = useRef<number[]>([]);
  const readyRef = useRef(false);
  const settingsRefObj = useRef({ ...DEFAULTS });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastYRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [boot, setBoot] = useState<'loading' | 'error' | 'ready'>('loading');
  const [loadMsg, setLoadMsg] = useState('Đang mở sách…');
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toast = useCallback((msg: string) => {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimerRef.current!);
    toastTimerRef.current = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => (el.hidden = true), 300);
    }, 2200);
  }, []);

  const applySettings = useCallback(() => {
    const s = settingsRefObj.current;
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.style.setProperty(
      '--read-font',
      s.fontFamily === 'sans' ? '"Roboto", "Helvetica Neue", system-ui, sans-serif' : 'Georgia, "Noto Serif", "Times New Roman", serif',
    );
    document.documentElement.style.setProperty('--read-fs', s.fontSize + 'px');
    document.querySelectorAll('#fontFamilySeg button').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.font === s.fontFamily),
    );
    document.querySelectorAll('#themeRow .theme-dot').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.theme === s.theme),
    );
    const label = document.getElementById('fontSizeLabel');
    if (label) label.textContent = String(s.fontSize);
  }, []);

  const makePage = useCallback((page: Page, index: number): HTMLElement => {
    const sec = document.createElement('section');
    sec.className = 'pg';
    sec.dataset.i = String(index);
    const inner = document.createElement('div');
    inner.className = 'pg-inner';
    if (page && (page as { kind?: string }).kind === 'image') {
      inner.classList.add('pg-image');
      const img = document.createElement('img');
      img.src = (page as { src: string }).src;
      img.alt = `Trang ${index + 1}`;
      const w = (page as { w?: number }).w;
      const h = (page as { h?: number }).h;
      if (w && h) img.style.aspectRatio = `${w} / ${h}`;
      inner.appendChild(img);
    } else if (typeof page === 'string' && page.trim()) {
      inner.textContent = page;
    } else {
      inner.classList.add('pg-empty');
      inner.textContent = '(Trang này là hình ảnh, không có chữ)';
    }
    const mark = document.createElement('div');
    mark.className = 'pg-mark';
    mark.textContent = String(index + 1);
    sec.appendChild(inner);
    sec.appendChild(mark);
    return sec;
  }, []);

  const measureOffsets = useCallback(() => {
    offsetsRef.current = pageElsRef.current.map((el) => el.offsetTop);
  }, []);

  const currentIndex = useCallback(() => {
    if (!readyRef.current || offsetsRef.current.length === 0) return 0;
    const pos = window.scrollY + window.innerHeight * 0.35;
    const offs = offsetsRef.current;
    let lo = 0;
    let hi = offs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offs[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }, []);

  const updatePageInfo = useCallback(() => {
    if (!readyRef.current) return;
    const b = bookRef.current;
    if (!b) return;
    const idx = currentIndex();
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const pct = Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100)));
    const el = pageInfoRef.current;
    if (el) el.textContent = `Trang ${idx + 1}/${b.pageCount} · ${pct}%`;
  }, [currentIndex]);

  const queueSave = useCallback(() => {
    clearTimeout(saveTimerRef.current!);
    saveTimerRef.current = setTimeout(saveProgressNow, 700);
  }, [pageInfoRef]);

  function saveProgressNow() {
    const b = bookRef.current;
    if (!b || !readyRef.current || !mainRef.current) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const frac = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (b.progress !== frac || b.updatedAt === undefined) {
      b.progress = frac;
      b.updatedAt = Date.now();
      idbPut(b).catch(() => {});
    }
  }

  const finishBuild = useCallback(
    (restoreFrac: number, fracOnly: boolean) => {
      try {
        pageElsRef.current = [...(mainRef.current?.querySelectorAll('.pg') || [])] as HTMLElement[];
        measureOffsets();
        setBoot('ready');
        readyRef.current = true;
        const frac = fracOnly ? restoreFrac : Math.min(0.999, Math.max(0, restoreFrac));
        window.scrollTo(0, frac * (document.documentElement.scrollHeight - window.innerHeight));
        updatePageInfo();
      } catch (err) {
        console.error(err);
        readyRef.current = true;
        setBoot('loading');
        setLoadMsg('Không dựng được sách, thử mở lại');
      }
    },
    [measureOffsets, updatePageInfo],
  );

  const renderBook = useCallback(() => {
    const b = bookRef.current!;
    applySettings();
    if (titleRef.current) titleRef.current.textContent = b.title;
    document.title = b.title || 'Đọc sách';
    setLoadMsg('Đang sắp xếp sách…');
    setBoot('loading');
    const main = mainRef.current!;
    main.innerHTML = '';
    if (tocListRef.current) tocListRef.current.innerHTML = '';

    const total = b.pages.length;
    const pageFrag = document.createDocumentFragment();
    const tocFrag = document.createDocumentFragment();
    let i = 0;
    const pump = () => {
      try {
        const end = Math.min(i + CHUNK_SIZE, total);
        for (; i < end; i++) {
          pageFrag.appendChild(makePage(b.pages[i], i));
          const li = document.createElement('li');
          li.className = 'toc-item';
          li.dataset.i = String(i);
          li.textContent = `Trang ${i + 1}`;
          tocFrag.appendChild(li);
        }
        if (i < total) {
          setLoadMsg(`Đang sắp xếp trang ${i}/${total}…`);
          requestAnimationFrame(pump);
          return;
        }
        setLoadMsg('Đang dựng sách…');
        main.appendChild(pageFrag);
        tocListRef.current?.appendChild(tocFrag);
        requestAnimationFrame(() => finishBuild(b.progress || 0, false));
      } catch (err) {
        console.error(err);
        setLoadMsg('Không dựng được sách, thử mở lại');
      }
    };
    pump();
  }, [applySettings, finishBuild, makePage]);

  const upgradeBook = useCallback(
    async (b: Book) => {
      setLoadMsg('Đang nâng cấp sách…');
      setBoot('loading');
      try {
        const { pages, title, author, numPages } = await extractText(b.file!, (cur, total) =>
          setLoadMsg(`Đang nâng cấp sách ${cur}/${total}…`),
        );
        b.pages = pages;
        b.pageCount = numPages;
        if (title) b.title = title;
        if (author) b.author = author;
        b.ver = EXTRACT_VERSION;
        await idbPut(b);
      } catch (err) {
        console.error('nâng cấp sách thất bại:', err);
      }
    },
    [],
  );

  // mount: load book
  useEffect(() => {
    if (!id) {
      router.replace('/');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let b: Book | undefined;
        try {
          b = await idbGet(id);
        } catch {
          b = undefined;
        }
        if (!b) {
          try {
            b = await getSharedBook(id);
            await idbPut(b);
          } catch {
            if (!cancelled) {
              setLoadMsg('Không tìm thấy sách');
              setTimeout(() => router.replace('/'), 1200);
            }
            return;
          }
        }
        if (cancelled) return;
        bookRef.current = b;
        if (b.ver !== EXTRACT_VERSION && b.file) await upgradeBook(b);
        renderBook();
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadMsg('Lỗi mở sách');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router, renderBook, upgradeBook]);

  // global listeners
  useEffect(() => {
    if (!mainRef.current) return;
    const onScroll = () => {
      if (!readyRef.current) return;
      const y = window.scrollY;
      const tb = toolbarRef.current;
      if (tb) {
        if (y > 140 && y > lastYRef.current + 10) tb.classList.add('hide');
        else if (y < lastYRef.current - 10 || y <= 140) tb.classList.remove('hide');
      }
      lastYRef.current = y;
      clearTimeout(hideTimerRef.current!);
      hideTimerRef.current = setTimeout(() => {
        updatePageInfo();
        queueSave();
      }, 300);
    };
    const onScrollEnd = () => {
      if (!readyRef.current) return;
      clearTimeout(hideTimerRef.current!);
      updatePageInfo();
      saveProgressNow();
    };
    const onResize = () => {
      clearTimeout(hideTimerRef.current!);
      hideTimerRef.current = setTimeout(() => {
        if (!readyRef.current) return;
        measureOffsets();
        updatePageInfo();
      }, 200);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveProgressNow();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', onScrollEnd);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', saveProgressNow);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveProgressNow);
    };
  }, [measureOffsets, queueSave, saveProgressNow, updatePageInfo]);

  const scheduleRebuild = useCallback(() => {
    clearTimeout(hideTimerRef.current!);
    hideTimerRef.current = setTimeout(() => {
      if (!readyRef.current) return;
      const b = bookRef.current;
      if (!b) return;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const frac = Math.min(1, Math.max(0, window.scrollY / max));
      const main = mainRef.current;
      if (!main) return;
      main.innerHTML = '';
      readyRef.current = false;
      setBoot('loading');
      const frag = document.createDocumentFragment();
      const total = b.pages.length;
      let i = 0;
      const pump = () => {
        try {
          const end = Math.min(i + CHUNK_SIZE, total);
          for (; i < end; i++) frag.appendChild(makePage(b.pages[i], i));
          if (i < total) {
            requestAnimationFrame(pump);
            return;
          }
          main.appendChild(frag);
          requestAnimationFrame(() => finishBuild(frac, true));
        } catch (err) {
          console.error(err);
          readyRef.current = true;
          setBoot('loading');
        }
      };
      pump();
    }, 260);
  }, [finishBuild, makePage]);

  const changeSetting = useCallback((mutate: () => void) => {
    mutate();
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsRefObj.current));
    } catch {
      /* ignore */
    }
    applySettings();
    scheduleRebuild();
  }, [applySettings, scheduleRebuild]);

  const saveSettingsOnly = useCallback(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsRefObj.current));
    } catch {
      /* ignore */
    }
    applySettings();
  }, [applySettings]);

  const goToPage = useCallback((index: number) => {
    if (index >= 0 && index < offsetsRef.current.length) {
      window.scrollTo({ top: Math.max(0, offsetsRef.current[index] - 8), behavior: 'smooth' });
    }
  }, []);

  const tocListRefCb = useCallback(
    (el: HTMLUListElement | null) => {
      tocListRef.current = el;
    },
    [],
  );

  return (
    <div className="reader-body min-h-screen">
      {/* Toolbar */}
      <div className="reader-toolbar" ref={toolbarRef}>
        <button className="icon-btn" aria-label="Quay lại" onClick={() => router.push('/')}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center leading-tight">
          <span ref={titleRef} className="block truncate text-sm font-semibold" />
          <span ref={pageInfoRef} className="block text-xs text-muted-foreground" />
        </div>
        <button className="icon-btn" aria-label="Mục lục" onClick={() => setTocOpen(true)}>
          <List className="h-5 w-5" />
        </button>
        <button className="icon-btn" aria-label="Cài đặt đọc" onClick={() => setSettingsOpen(true)}>
          <Settings2 className="h-5 w-5" />
        </button>
      </div>

      {/* Nội dung sách — React không render children vào đây, toàn bộ là DOM thủ công */}
      <main className="reader-main pt-[4.2rem] pb-24" ref={mainRef} />

      {boot === 'loading' && (
        <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex flex-col items-center gap-4 px-4 text-sm text-muted-foreground">
          <div className="spinner" />
          <p ref={loadTextRef}>{loadMsg}</p>
        </div>
      )}

      {/* Mục lục */}
      <div
        className={`sheet ${tocOpen ? 'open' : ''}`}
        ref={tocRef}
        hidden={!tocOpen}
        onClick={(e) => {
          if (e.target === tocRef.current) setTocOpen(false);
        }}
      >
        <div className="sheet-head">
          <b>Mục lục</b>
          <button className="icon-btn" aria-label="Đóng" onClick={() => setTocOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul
          className="toc-list"
          ref={tocListRefCb}
          onClick={(e) => {
            const li = (e.target as HTMLElement).closest('.toc-item') as HTMLElement | null;
            if (!li) return;
            setTocOpen(false);
            goToPage(Number(li.dataset.i));
          }}
        />
      </div>

      {/* Cài đặt */}
      <div
        className={`sheet ${settingsOpen ? 'open' : ''}`}
        ref={settingsRef}
        hidden={!settingsOpen}
        onClick={(e) => {
          if (e.target === settingsRef.current) setSettingsOpen(false);
        }}
      >
        <div className="sheet-head">
          <b>Chế độ đọc</b>
          <button className="icon-btn" aria-label="Đóng" onClick={() => setSettingsOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="setting-row">
          <span>Cỡ chữ</span>
          <div className="seg">
            <button
              onClick={() => {
                if (settingsRefObj.current.fontSize <= FONT_MIN) return;
                changeSetting(() => {
                  settingsRefObj.current.fontSize = Math.min(FONT_MAX, settingsRefObj.current.fontSize - 2);
                });
              }}
            >
              A−
            </button>
            <span id="fontSizeLabel" />
            <button
              onClick={() => {
                if (settingsRefObj.current.fontSize >= FONT_MAX) return;
                changeSetting(() => {
                  settingsRefObj.current.fontSize = Math.min(FONT_MAX, settingsRefObj.current.fontSize + 2);
                });
              }}
            >
              A+
            </button>
          </div>
        </div>
        <div className="setting-row">
          <span>Kiểu chữ</span>
          <div className="seg" id="fontFamilySeg">
            <button
              data-font="serif"
              onClick={() =>
                changeSetting(() => {
                  settingsRefObj.current.fontFamily = 'serif';
                })
              }
            >
              Serif
            </button>
            <button
              data-font="sans"
              onClick={() =>
                changeSetting(() => {
                  settingsRefObj.current.fontFamily = 'sans';
                })
              }
            >
              Sans
            </button>
          </div>
        </div>
        <div className="setting-row">
          <span>Nền</span>
          <div className="theme-row" id="themeRow">
            {(['light', 'paper', 'dark'] as const).map((t) => (
              <button
                key={t}
                className={`theme-dot ${t}`}
                data-theme={t}
                aria-label={`Nền ${t}`}
                onClick={() => {
                  settingsRefObj.current.theme = t;
                  saveSettingsOnly();
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="reader-toast" ref={toastRef} hidden />
    </div>
  );
}