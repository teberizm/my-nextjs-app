// lib/wakeLock.ts
let sentinel: any = null;
let onVis: ((this: Document, ev: Event) => any) | null = null;

export async function startWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      sentinel = await (navigator as any).wakeLock.request('screen');
      onVis = async () => {
        if (document.visibilityState === 'visible') {
          try {
            if (!sentinel || (sentinel as any).released) {
              sentinel = await (navigator as any).wakeLock.request('screen');
            }
          } catch {}
        }
      };
      document.addEventListener('visibilitychange', onVis);
      (window as any).__wakeOn__ = true;
      return;
    }
  } catch {}
  // Fallback: NoSleep.js (isteğe bağlı)
  try {
    const mod = await import('nosleep.js'); // npm i nosleep.js
    const NoSleep = (mod as any).default || mod;
    const ns = new NoSleep();
    ns.enable();
    (window as any).__wakeOn__ = true;
  } catch {}
}

export async function stopWakeLock() {
  try {
    if (sentinel && !(sentinel as any).released) await sentinel.release();
  } catch {}
  sentinel = null;
  if (onVis) document.removeEventListener('visibilitychange', onVis);
  onVis = null;
  (window as any).__wakeOn__ = false;
}
