import { useState } from 'react';
import Scanner from './components/Scanner.jsx';
import TicketResult from './components/TicketResult.jsx';
import TicketList from './components/TicketList.jsx';
import { parseBCBP } from './lib/bcbp.js';

export default function App() {
  const [tab, setTab] = useState('scan');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  function handleText(text) {
    try {
      setParsed(parseBCBP(text));
      setError(null);
    } catch (e) {
      setParsed(null);
      setError({ message: e.message, raw: text });
    }
  }

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
