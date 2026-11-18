import { useEffect, useRef, useState } from 'react';
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

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage('Reading barcode from photo…');
    try {
      const text = await decodeImageFile(file);
      setMessage('');
      onText(text);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
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
      </div>

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
