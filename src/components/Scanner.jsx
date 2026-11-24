import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ClipboardPaste, Flashlight, ImageUp, Repeat, ScanBarcode, Volume2, ZoomIn } from 'lucide-react';
import { startCamera, decodeImageFile } from '../lib/scanner.js';
import { useT } from '../lib/i18n.js';
import { useSetting } from '../lib/settings.js';

export default function Scanner({ onText }) {
  const { t } = useT();
  const videoRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pasted, setPasted] = useState('');
  const [cam, setCam] = useState(null); // camera controls: zoom / torch
  const [zoom, setZoom] = useState(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hit, setHit] = useState(0); // bumps on each camera read → green flash on the aim box
  const [keepScanning, setKeepScanning] = useSetting('keepScanning');
  const [sound, setSound] = useSetting('sound');
  // The parent re-renders on every save; keep the camera running instead of restarting it
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    if (!cameraOn) return;
    let controls;
    let cancelled = false;
    setMessage(t('startingCamera'));
    startCamera(
      videoRef.current,
      (text) => {
        if (!keepScanning) setCameraOn(false);
        setMessage('');
        setHit((n) => n + 1);
        onTextRef.current(text);
      },
      setMessage,
      { continuous: keepScanning },
    )
      .then((c) => {
        if (cancelled) return c.stop();
        controls = c;
        setCam(c);
        setZoom(c.zoom?.value ?? null);
        setTorchOn(false);
      })
      .catch((e) => {
        setCameraOn(false);
        setMessage(
          window.isSecureContext
            ? t('cameraError', { msg: e.message })
            : t('cameraNeedsHttps'),
        );
      });
    return () => {
      cancelled = true;
      controls?.stop();
      setCam(null);
    };
  }, [cameraOn, keepScanning]);

  const decodeFile = useCallback(
    async (file, source = t('sourcePhoto')) => {
      setBusy(true);
      setMessage(t('readingFrom', { source }));
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
      if (file) decodeFile(file, t('sourcePasted'));
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [decodeFile]);

  // "Paste image" button — reads the clipboard via the async Clipboard API
  async function pasteFromButton() {
    if (!navigator.clipboard?.read) {
      setMessage(t('clipNoButton'));
      return;
    }
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          decodeFile(await item.getType(type), t('sourcePasted'));
          return;
        }
      }
      setMessage(t('clipNoImage'));
    } catch (err) {
      setMessage(
        err.name === 'NotAllowedError'
          ? t('clipBlocked')
          : t('clipError', { msg: err.message }),
      );
    }
  }

  return (
    <section className="card">
      <h2>{t('scanTitle')}</h2>

      {cameraOn && (
        <div className="video-wrap">
          <video ref={videoRef} muted playsInline />
          <div key={hit} className={`aim ${hit ? 'hit' : ''}`} />
        </div>
      )}

      {cameraOn && cam && (cam.zoom || cam.torch) && (
        <div className="cam-controls">
          {cam.zoom && (
            <label>
              <span className="with-icon">
                <ZoomIn size={14} /> Zoom {zoom?.toFixed(1)}×
              </span>
              <input
                type="range"
                min={cam.zoom.min}
                max={cam.zoom.max}
                step={cam.zoom.step}
                value={zoom ?? cam.zoom.value}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setZoom(v);
                  cam.setZoom(v);
                }}
              />
            </label>
          )}
          {cam.torch && (
            <button
              className={torchOn ? 'primary' : ''}
              onClick={() => {
                cam.setTorch(!torchOn);
                setTorchOn(!torchOn);
              }}
            >
              <Flashlight size={16} /> {torchOn ? t('torchOn') : t('torch')}
            </button>
          )}
        </div>
      )}

      <div className="actions">
        {cameraOn ? (
          <button onClick={() => setCameraOn(false)}>
            <CameraOff size={16} /> {t('stopCamera')}
          </button>
        ) : (
          <button className="primary" onClick={() => setCameraOn(true)}>
            <Camera size={16} /> {t('useCamera')}
          </button>
        )}
        <label className={`button ${busy ? 'disabled' : ''}`}>
          <ImageUp size={16} /> {t('uploadPhoto')}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={handleFile} />
        </label>
        <button disabled={busy} onClick={pasteFromButton}>
          <ClipboardPaste size={16} /> {t('pasteImage')}
        </button>
      </div>

      <div className="scan-options">
        <label className="switch">
          <input type="checkbox" checked={keepScanning} onChange={(e) => setKeepScanning(e.target.checked)} />
          <Repeat size={16} aria-hidden="true" /> {t('keepScanning')}
        </label>
        <label className="switch">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          <Volume2 size={16} aria-hidden="true" /> {t('sound')}
        </label>
      </div>
      {keepScanning && <p className="muted small">{t('keepScanningHint')}</p>}

      <p className="usb-ready">
        <ScanBarcode size={16} /> {t('usbReady')}
      </p>
      <p className="muted small">{t('pasteTip')}</p>
      {message && <p className="muted">{message}</p>}

      <details className="paste">
        <summary>{t('pasteText')}</summary>
        <textarea
          rows={3}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits (a USB scanner typing here ends with Enter); Shift+Enter = new line
            if (e.key === 'Enter' && !e.shiftKey && pasted.trim()) {
              e.preventDefault();
              onText(pasted);
              setPasted('');
            }
          }}
          placeholder="M1DOE/JOHN MR         EABC123 SGNKULMH 0759 322Y026D0010 100"
        />
        <button disabled={!pasted.trim()} onClick={() => onText(pasted)}>
          {t('readText')}
        </button>
      </details>
    </section>
  );
}
