import { useState } from 'react';
import Scanner from './components/Scanner.jsx';
import TicketResult from './components/TicketResult.jsx';
import TicketList from './components/TicketList.jsx';
import { parseBCBP } from './lib/bcbp.js';
import { useKeyboardScanner } from './lib/keyboardScanner.js';

export default function App() {
  const [tab, setTab] = useState('scan');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  function handleText(text) {
    // Boarding pass barcodes are plain ASCII. Accented letters (â, ơ, đ…) mean a
    // Vietnamese input method changed what a USB scanner typed — even if it still parses.
    if (/[^\x00-\x7F]/.test(text)) {
      setParsed(null);
      setError({
        message:
          'The scanned text was changed by a Vietnamese keyboard (Unikey/EVKey). Switch the keyboard to English (E) and scan again.',
        raw: text,
      });
      return;
    }
    try {
      setParsed(parseBCBP(text));
      setError(null);
    } catch (e) {
      setParsed(null);
      setError({ message: e.message, raw: text });
    }
  }

  // USB / Bluetooth barcode scanner (keyboard mode) — active on the Scan tab
  useKeyboardScanner(handleText, tab === 'scan');

  function reset() {
    setParsed(null);
    setError(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>✈ Boarding Pass Reader</h1>
        <nav className="tabs">
          <button className={tab === 'scan' ? 'active' : ''} onClick={() => setTab('scan')}>
            Scan
          </button>
          <button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>
            Saved
          </button>
        </nav>
      </header>

      <main>
        {tab === 'scan' && (
          <>
            {!parsed && <Scanner onText={handleText} />}
            {error && (
              <div className="card error">
                <strong>{error.message}</strong>
                <p className="muted">Barcode text:</p>
                <pre className="raw">{error.raw}</pre>
                <button onClick={reset}>Try again</button>
              </div>
            )}
            {parsed && (
              <TicketResult
                parsed={parsed}
                onSaved={() => {
                  reset();
                  setTab('saved');
                }}
                onCancel={reset}
              />
            )}
          </>
        )}
        {tab === 'saved' && <TicketList />}
      </main>
    </div>
  );
}
