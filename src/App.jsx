import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, Languages, Moon, Plane, ScanBarcode, Sun, SunMoon, Ticket } from 'lucide-react';
import Scanner from './components/Scanner.jsx';
import TicketResult from './components/TicketResult.jsx';
import TicketList from './components/TicketList.jsx';
import Toast from './components/Toast.jsx';
import ScanFlash from './components/ScanFlash.jsx';
import Menu from './components/Menu.jsx';
import UpdateBar from './components/UpdateBar.jsx';
import { promptInstall, useCanInstall } from './lib/install.js';
import { parseBCBP, BcbpError } from './lib/bcbp.js';
import { listTickets, saveTicket, flightKey } from './lib/db.js';
import { findDuplicates } from './lib/groups.js';
import { scanFeedback } from './lib/feedback.js';
import { getSetting, useSetting } from './lib/settings.js';
import { currentFlight, duplicatesOf, ticketsFromParsed } from './lib/tickets.js';
import { useKeyboardScanner } from './lib/keyboardScanner.js';
import { useT, locale, LANGS } from './lib/i18n.js';

/** 2026-11-21 → 21/11 */
const dm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—');

export default function App() {
  const { t, lang, setLang } = useT();
  const [tab, setTab] = useState('scan');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [saved, setSaved] = useState([]); // every saved ticket — for counts and duplicate checks
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const hideToast = useCallback(() => setToast(null), []);
  const [flash, setFlash] = useState(null);
  const [theme, setTheme] = useSetting('theme');
  const canInstall = useCanInstall();
  const offlineReady = useCallback(() => setToast({ text: t('offlineReady'), kind: 'ok' }), [t]);
  // Light / dark: 'auto' leaves it to the device (prefers-color-scheme), see index.css
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const hideFlash = useCallback(() => setFlash(null), []);
  const showFlash = (f) => setFlash({ ...f, id: Date.now() });

  const reload = useCallback(async () => {
    try {
      const list = await listTickets();
      savedRef.current = list;
      setSaved(list);
      return list;
    } catch {
      return savedRef.current;
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  function who(tk) {
    return [tk?.name, tk?.seat && t('seatN', { seat: tk.seat })].filter(Boolean).join(' · ');
  }

  /** "Keep scanning" mode: save straight away, no review screen. */
  async function autoSave(tickets, dupCount) {
    try {
      for (const tk of tickets) await saveTicket(tk);
      const list = await reload();
      const cur = currentFlight(list);
      const count = cur ? ` · ${t('nScanned', { n: cur.count })}` : '';
      setToast(dupCount ? { text: t('savedDupToast', { who: who(tickets[0]) }), kind: 'warn' } : { text: t('savedToast', { who: who(tickets[0]) }) + count, kind: 'ok' });
    } catch (e) {
      scanFeedback('err');
      setToast({ text: t('saveFailed', { msg: e.message }), kind: 'err' });
    }
  }

  /** `manual`: typed or pasted into the box, so the person is already looking at the error card below. */
  function handleText(text, { manual = false } = {}) {
    // Boarding pass barcodes are plain ASCII. Accented letters (â, ơ, đ…) mean a
    // Vietnamese input method changed what a USB scanner typed — even if it still parses.
    if (/[^\x00-\x7F]/.test(text)) {
      scanFeedback('err');
      if (!manual) showFlash({ kind: 'err', text: t('flashKeyboard') });
      setParsed(null);
      setError({ key: 'imeChanged', raw: text });
      return;
    }
    let pass;
    try {
      pass = parseBCBP(text);
    } catch (e) {
      scanFeedback('err');
      if (!manual) showFlash({ kind: 'err', text: t('flashUnreadable') });
      setParsed(null);
      // The parser's own messages are English; show a translated one for "not a boarding pass"
      setError(e instanceof BcbpError ? { key: 'notBoardingPass', raw: text } : { key: 'parseFailed', msg: e.message, raw: text });
      return;
    }
    setError(null);
    const tickets = ticketsFromParsed(pass);
    const dupCount = duplicatesOf(tickets, savedRef.current).length;
    scanFeedback(dupCount ? 'warn' : 'ok');
    showFlash({
      kind: dupCount ? 'warn' : 'ok',
      seat: tickets.map((tk) => tk.seat).filter(Boolean).join(' · '),
      name: pass.name,
      text: dupCount ? t('flashDuplicate') : tickets.map((tk) => tk.flight).filter(Boolean).join(' · '),
    });
    if (getSetting('keepScanning')) {
      setParsed(null);
      autoSave(tickets, dupCount);
      return;
    }
    setParsed(pass);
  }

  // USB / Bluetooth barcode scanner (keyboard mode) — active on the Scan tab
  useKeyboardScanner(handleText, tab === 'scan');

  function reset() {
    setParsed(null);
    setError(null);
  }

  function handleSaved({ tickets, dupCount }) {
    reset(); // stay on the Scan tab, ready for the next pass
    reload();
    setToast(dupCount ? { text: t('savedDupToast', { who: who(tickets[0]) }), kind: 'warn' } : { text: t('savedToast', { who: who(tickets[0]) }), kind: 'ok' });
  }

  const cur = currentFlight(saved);
  const dups = cur ? findDuplicates(saved) : null;
  const curDups = cur ? saved.filter((tk) => dups.has(tk.id) && flightKey(tk) === cur.key).length : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <h1>
            <span className="logo" aria-hidden="true">
              <Plane size={18} strokeWidth={2.25} />
            </span>
            {t('appTitle')}
          </h1>
          <div className="header-actions">
            {canInstall && (
              <button className="small-btn install-btn" onClick={promptInstall}>
                <Download size={16} aria-hidden="true" /> {t('installApp')}
              </button>
            )}
            <Menu
              label={t('theme')}
              icon={THEME_ICONS[theme] || SunMoon}
              items={['auto', 'light', 'dark'].map((v) => ({
                label: t(`theme_${v}`),
                icon: THEME_ICONS[v],
                checked: theme === v,
                onClick: () => setTheme(v),
              }))}
            />
            <Menu
              label={t('language')}
              icon={Languages}
              items={LANGS.map((l) => ({ label: LANG_NAMES[l], checked: lang === l, onClick: () => setLang(l) }))}
            />
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === 'scan' ? 'active' : ''} aria-current={tab === 'scan' ? 'page' : undefined} onClick={() => setTab('scan')}>
            <ScanBarcode size={20} aria-hidden="true" />
            <span>{t('tabScan')}</span>
          </button>
          <button className={tab === 'saved' ? 'active' : ''} aria-current={tab === 'saved' ? 'page' : undefined} onClick={() => setTab('saved')}>
            <Ticket size={20} aria-hidden="true" />
            <span>{t('tabSaved')}</span>
            {saved.length > 0 && <span className="tab-count">{saved.length}</span>}
          </button>
        </nav>
      </header>
      <UpdateBar onOfflineReady={offlineReady} />

      <main>
        {tab === 'scan' && (
          <>
            {cur && (
              <button className="flight-counter" onClick={() => setTab('saved')} title={t('tabSaved')}>
                <Plane size={16} aria-hidden="true" />
                <span className="fc-flight">{cur.flight || '—'}</span>
                <span className="muted">
                  {dm(cur.flightDate)}
                  {cur.from && ` · ${cur.from}→${cur.to}`}
                </span>
                <span className="fc-count">{t('nScanned', { n: cur.count })}</span>
                {curDups > 0 && (
                  <span className="badge warn">
                    <AlertTriangle size={12} aria-hidden="true" /> {t('nDup', { n: curDups })}
                  </span>
                )}
              </button>
            )}
            {!parsed && <Scanner onText={handleText} />}
            {error && (
              <div className="card error">
                <strong>{t(error.key, { msg: error.msg })}</strong>
                <p className="muted">{t('barcodeText')}</p>
                <pre className="raw">{error.raw}</pre>
                <button onClick={reset}>{t('tryAgain')}</button>
              </div>
            )}
            {parsed && <TicketResult key={parsed.raw} parsed={parsed} saved={saved} onSaved={handleSaved} onCancel={reset} />}
          </>
        )}
        {tab === 'saved' && <TicketList onToast={setToast} onChanged={setSaved} onGoScan={() => setTab('scan')} />}
      </main>
      <VersionFooter />
      <Toast toast={toast} onDone={hideToast} />
      <ScanFlash flash={flash} onDone={hideFlash} />
    </div>
  );
}

const LANG_NAMES = { vi: 'Tiếng Việt', en: 'English' };
const THEME_ICONS = { auto: SunMoon, light: Sun, dark: Moon };

const REPO_URL = 'https://github.com/TTomCCat/airline-scanner';

function VersionFooter() {
  const { t } = useT();
  const v = __APP_VERSION__; // injected at build time (vite.config.js)
  const built = new Date(v.builtAt).toLocaleString(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <footer className="version">
      v{v.version}
      {' · '}
      {v.commit !== 'unknown' ? (
        <a href={`${REPO_URL}/commit/${v.commit}`} target="_blank" rel="noopener noreferrer">
          {v.commit}
        </a>
      ) : (
        t('unknownCommit')
      )}
      {' · '}
      {v.dev ? t('devBuild') : t('builtAt', { date: built })}
    </footer>
  );
}
