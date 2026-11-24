// Barcode reading for boarding passes (PDF417, plus Aztec/QR used by mobile passes).
// Main engine: zxing-wasm (zxing-cpp compiled to WebAssembly) — far more robust
// on phone photos than the pure-JS port. ZXing-js is kept as a last fallback.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { t } from './i18n.js';

// Serve the .wasm file from our own build instead of a CDN
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
});

const FORMATS = ['PDF417', 'Aztec', 'QRCode', 'DataMatrix'];

const BASE_OPTIONS = {
  formats: FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 4, // tickets often have 2 barcodes (main + stub)
};

// Shape of the mandatory BCBP fields. Blurry photos can produce "valid" but
// garbled reads, so only accept text that really looks like a boarding pass.
const BCBP_SHAPE =
  /^M[1-4].{20}[ E].{7}[A-Z]{3}[A-Z]{3}[A-Z0-9 ]{3}[0-9][0-9A-Z ]{4}[0-9 ]{3}[A-Z ][0-9A-Z ]{4}[0-9A-Z ]{5}/;

export function looksLikeBoardingPass(text) {
  return BCBP_SHAPE.test(text);
}

let lastSeen = null; // best non-boarding-pass text, shown if nothing better is found

async function readText(input, extra = {}) {
  const results = await readBarcodes(input, { ...BASE_OPTIONS, ...extra });
  const texts = results.filter((r) => r.isValid && r.text).map((r) => r.text);
  const good = texts.find(looksLikeBoardingPass);
  if (good) return good;
  if (texts.length && !lastSeen) lastSeen = texts[0];
  return null;
}

// ---------- Camera ----------

// Centre "aim box" — must match .aim in index.css (inset: 30% 8%)
const AIM = { x: 0.08, y: 0.3, w: 0.84, h: 0.4 };

async function openCamera() {
  const base = { facingMode: { ideal: 'environment' } };
  // Ask for 4K first (more pixels per barcode bar), fall back to 1080p / anything
  for (const size of [
    { width: { ideal: 3840 }, height: { ideal: 2160 } },
    { width: { ideal: 1920 }, height: { ideal: 1080 } },
    {},
  ]) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, ...size } });
    } catch (e) {
      if (e.name === 'NotAllowedError') throw e;
    }
  }
  throw new Error(t('noCamera'));
}

/**
 * Start the back camera and call onText(text) once a boarding pass barcode is read.
 * onStatus(msg) gets live hints. Returns { stop, zoom, torch, setZoom, setTorch }.
 * With `continuous`, the camera keeps running after a read: the same pass is ignored
 * until another pass is read or REPEAT_MS has passed, and reading pauses briefly after each hit.
 */
const REPEAT_MS = 4000;
const PAUSE_AFTER_HIT_MS = 1200;

export async function startCamera(videoEl, onText, onStatus = () => {}, { continuous = false } = {}) {
  const stream = await openCamera();
  const track = stream.getVideoTracks()[0];
  videoEl.srcObject = stream;
  await videoEl.play();

  // ---- Auto-adjust camera: continuous focus, a bit of zoom ----
  const caps = track.getCapabilities?.() || {};
  const advanced = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
  let zoom = null;
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    const value = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 2));
    zoom = { min: caps.zoom.min, max: Math.min(caps.zoom.max, 8), step: caps.zoom.step || 0.1, value };
    advanced.push({ zoom: value });
  }
  for (const c of advanced) {
    try {
      await track.applyConstraints({ advanced: [c] });
    } catch {
      // not supported on this device — ignore
    }
  }

  const setZoom = async (value) => {
    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] });
    } catch {
      // ignore
    }
  };
  const torch = Boolean(caps.torch);
  const setTorch = async (on) => {
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
    } catch {
      // ignore
    }
  };

  // ---- Decode loop ----
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let timer;
  let frame = 0;
  let lastHint = '';
  let lastText = '';
  let lastAt = 0;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    videoEl.srcObject = null;
  };

  const hint = (msg) => {
    if (msg !== lastHint) onStatus((lastHint = msg));
  };

  const tick = async () => {
    if (stopped) return;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    if (vw && vh) {
      // Alternate: centre box at full resolution, then the whole frame
      const r = frame++ % 2 === 0 ? AIM : { x: 0, y: 0, w: 1, h: 1 };
      const sx = Math.round(r.x * vw);
      const sy = Math.round(r.y * vh);
      const sw = Math.round(r.w * vw);
      const sh = Math.round(r.h * vh);
      canvas.width = sw;
      canvas.height = sh;
      ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, sw, sh);
      try {
        const results = await readBarcodes(ctx.getImageData(0, 0, sw, sh), {
          ...BASE_OPTIONS,
          tryInvert: false,
          returnErrors: true,
        });
        const good = results.find((x) => x.isValid && looksLikeBoardingPass(x.text));
        if (good && !stopped) {
          if (!continuous) {
            stop();
            onText(good.text);
            return;
          }
          const now = Date.now();
          if (good.text !== lastText || now - lastAt > REPEAT_MS) {
            lastText = good.text;
            lastAt = now;
            onText(good.text);
            timer = setTimeout(tick, PAUSE_AFTER_HIT_MS);
            return;
          }
          lastAt = now; // same pass still in view — keep ignoring it
        }
        if (results.some((x) => x.isValid)) hint(t('hintNotBoarding'));
        else if (results.length) hint(t('hintSeen'));
        else hint(t('hintPoint'));
      } catch {
        // keep trying
      }
    }
    timer = setTimeout(tick, 100);
  };
  tick();

  return { stop, zoom, torch, setZoom, setTorch };
}

// ---------- Photo ----------

async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

function toImageData(bitmap, maxDim, crop) {
  const sx = crop ? crop.x * bitmap.width : 0;
  const sy = crop ? crop.y * bitmap.height : 0;
  const sw = crop ? crop.w * bitmap.width : bitmap.width;
  const sh = crop ? crop.h * bitmap.height : bitmap.height;
  // Shrink huge photos; enlarge small ones (up to 2.5×) so thin bars get more pixels
  const scale = Math.min(2.5, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Overlapping halves / thirds — helps when the barcode is small in a big photo
const CROPS = [
  { x: 0, y: 0, w: 1, h: 0.5 },
  { x: 0, y: 0.5, w: 1, h: 0.5 },
  { x: 0, y: 0, w: 0.5, h: 1 },
  { x: 0.5, y: 0, w: 0.5, h: 1 },
  { x: 0, y: 0, w: 1, h: 0.4 },
  { x: 0, y: 0.3, w: 1, h: 0.4 },
  { x: 0, y: 0.6, w: 1, h: 0.4 },
];

/** Decode a barcode from a photo, trying progressively harder strategies. */
export async function decodeImageFile(file) {
  lastSeen = null;
  // 1. Whole file as-is
  try {
    const text = await readText(file);
    if (text) return text;
  } catch {
    // fall through
  }

  const bitmap = await loadBitmap(file);
  const { width, height } = bitmap;
  try {
    // 2. Resized versions with different binarizers
    for (const size of [2000, 3000, 1400, 1000]) {
      for (const binarizer of ['LocalAverage', 'GlobalHistogram']) {
        const text = await readText(toImageData(bitmap, size), { binarizer });
        if (text) return text;
      }
    }
    // 3. Crops, so a small barcode fills more of the image
    for (const crop of CROPS) {
      const text = await readText(toImageData(bitmap, 2000, crop));
      if (text) return text;
    }
  } finally {
    bitmap.close?.();
  }

  // 4. Last resort: the pure-JS reader
  const fallback = await decodeWithZxingJs(file);
  if (fallback && looksLikeBoardingPass(fallback)) return fallback;

  // Found some barcode, but not a boarding pass — let the app show its text
  if (lastSeen || fallback) return lastSeen || fallback;

  if (Math.max(width, height) < 500) {
    throw new Error(
      t('imageTooSmall', { w: width, h: height }),
    );
  }
  throw new Error(
    t('noBarcode'),
  );
}

async function decodeWithZxingJs(file) {
  try {
    const [{ BrowserPDF417Reader }] = await Promise.all([import('@zxing/browser')]);
    const reader = new BrowserPDF417Reader();
    const url = URL.createObjectURL(file);
    try {
      return (await reader.decodeFromImageUrl(url)).getText();
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
