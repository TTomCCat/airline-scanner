// Service worker glue for the installable / offline app.
// - Tells the user once when the app has been saved for offline use.
// - When a new version is deployed, shows a bar; it only switches when the user taps Reload,
//   so the app never changes in the middle of boarding.
import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../lib/i18n.js';

const CHECK_EVERY_MS = 30 * 60 * 1000; // look for a new version every 30 min while open

export default function UpdateBar({ onOfflineReady = () => {} }) {
  const { t } = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update().catch(() => {}), CHECK_EVERY_MS);
    },
  });

  const told = useRef(false);
  useEffect(() => {
    if (offlineReady && !told.current) {
      told.current = true;
      onOfflineReady();
      setOfflineReady(false);
    }
  }, [offlineReady, onOfflineReady, setOfflineReady]);

  if (!needRefresh) return null;
  return (
    <div className="update-bar" role="status">
      <RefreshCw size={18} aria-hidden="true" />
      <span>{t('updateAvailable')}</span>
      <button className="primary small-btn" onClick={() => updateServiceWorker(true)}>
        {t('reload')}
      </button>
      <button className="link small-btn" onClick={() => setNeedRefresh(false)}>
        {t('later')}
      </button>
    </div>
  );
}
