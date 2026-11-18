// Barcode reading for boarding passes (PDF417, plus Aztec/QR used by mobile passes).
// Main engine: zxing-wasm (zxing-cpp compiled to WebAssembly) — far more robust
// on phone photos than the pure-JS port. ZXing-js is kept as a last fallback.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

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

/**
 * Start the back camera and call onText(text) once a barcode is read.
 * Returns { stop() }.
 */
export async function startCamera(videoEl, onText) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let timer;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    videoEl.srcObject = null;
  };

  const tick = async () => {
    if (stopped) return;
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    if (w && h) {
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(videoEl, 0, 0, w, h);
      try {
        const text = await readText(ctx.getImageData(0, 0, w, h), { tryInvert: false });
        if (text && !stopped) {
          stop();
          onText(text);
          return;
        }
      } catch {
        // keep trying
      }
    }
    timer = setTimeout(tick, 150);
  };
  tick();

  return { stop };
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
      `This image is too small to read (${width}×${height} px) — it looks like a thumbnail. ` +
        'Open the image full size before copying, or upload the original photo.',
    );
  }
  throw new Error(
    'No barcode found in this photo. Try a closer, sharper, well-lit photo of the barcode (fill the frame, avoid glare).',
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
