import { useCallback, useEffect, useRef, useState } from 'react';
import { startCamera, decodeImageFile } from '../lib/scanner.js';

export default function Scanner({ onText }) {
  const videoRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    if (!cameraOn) return;
    let controls;
    let cancelled = false;
    setMessage('Point the camera at the barcode…');
    startCamera(videoRef.current, (text) => {
      setCameraOn(false);
      setMessage('');
      onText(text);
    })
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((e) => {
        setCameraOn(false);
        setMessage(
          window.isSecureContext
            ? `Camera error: ${e.message}`
            : 'Camera needs HTTPS (or localhost). Use "Upload photo" instead.',
        );
      });
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [cameraOn, onText]);

  const decodeFile = useCallback(
    async (file, source = 'photo') => {
      setBusy(true);
      setMessage(`Reading barcode from ${source}…`);
      try {
        const text = await decodeImageFile(file);
        setMessage('');
        onText(text);
      } catch (err) {
        setMessage(err.message);
      } finally {
        setBusy(false);
      }
    },
    [onText],
  );

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) decodeFile(file);
  }

  // Ctrl+V / ⌘V anywhere on the page with an image in the clipboard
  useEffect(() => {
    function onPaste(e) {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (!item) return; // plain text: let the textarea handle it normally
      e.preventDefault();
      const file = item.getAsFile();
      if (file) decodeFile(file, 'pasted image');
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [decodeFile]);

  // "Paste image" button — reads the clipboard via the async Clipboard API
  async function pasteFromButton() {
    if (!navigator.clipboard?.read) {
      setMessage('Your browser can’t read the clipboard from a button. Press Ctrl+V (⌘V on Mac) instead.');
      return;
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          decodeFile(await item.getType(type), 'pasted image');
          return;
        }
      }
      setMessage('No image in the clipboard. Copy an image (or take a screenshot) first.');
    } catch (err) {
      setMessage(
        err.name === 'NotAllowedError'
          ? 'Clipboard access was blocked. Allow it, or press Ctrl+V (⌘V on Mac) instead.'
          : `Could not read clipboard: ${err.message}`,
      );
    }
  }

  return (
    <section className="card">
      <h2>Scan a boarding pass</h2>

      {cameraOn && (
        <div className="video-wrap">
          <video ref={videoRef} muted playsInline />
          <div className="aim" />
        </div>
      )}

      <div className="actions">
        {cameraOn ? (
          <button onClick={() => setCameraOn(false)}>Stop camera</button>
        ) : (
          <button className="primary" onClick={() => setCameraOn(true)}>
            📷 Use camera
          </button>
        )}
        <label className={`button ${busy ? 'disabled' : ''}`}>
          🖼 Upload photo
          <input type="file" accept="image/*" hidden disabled={busy} onChange={handleFile} />
        </label>
        <button disabled={busy} onClick={pasteFromButton}>
          📋 Paste image
        </button>
      </div>

      <p className="muted small">Tip: copy a ticket image and press Ctrl+V (⌘V on Mac) anywhere here.</p>
      {message && <p className="muted">{message}</p>}

      <details className="paste">
        <summary>Paste barcode text</summary>
        <textarea
          rows={3}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="M1DOE/JOHN MR         EABC123 SGNKULMH 0759 322Y026D0010 100"
        />
        <button disabled={!pasted.trim()} onClick={() => onText(pasted)}>
          Read text
        </button>
      </details>
    </section>
  );
}
