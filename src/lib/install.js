// "Install app" button support. Chrome / Edge / Android fire `beforeinstallprompt` when the site can be
// installed; we keep that event so a button can open the install dialog. (iPhone: Share → Add to Home Screen.)
import { useSyncExternalStore } from 'react';

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own button instead of the mini-infobar
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** True when the browser is ready to install the app. */
export function useCanInstall() {
  return useSyncExternalStore(subscribe, () => Boolean(deferred), () => false);
}

/** Open the browser's install dialog. Resolves to 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const e = deferred;
  deferred = null;
  notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome;
}
