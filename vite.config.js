import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

function gitCommit() {
  // GitHub Actions provides the commit; locally ask git
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ command }) => {
  const version = {
    version: pkg.version,
    commit: gitCommit(),
    builtAt: new Date().toISOString(),
    dev: command === 'serve',
  };

  return {
    plugins: [
      react(),
      {
        // Publish version.json next to the site so the live version can be checked
        name: 'version-json',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(version, null, 2) });
        },
      },
      // Installable app that works offline: manifest + service worker that saves the whole app on the device.
      // 'prompt' = a new version waits until the user taps Reload (never swaps mid-boarding) — see UpdateBar.jsx
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeManifestIcons: false, // icons are already picked up by globPatterns below
        manifest: {
          name: 'Boarding Pass Reader',
          short_name: 'Boarding Pass',
          description: 'Scan and save airline boarding passes — works offline.',
          lang: 'vi',
          theme_color: '#1f3a5f',
          background_color: '#1f3a5f',
          display: 'standalone',
          start_url: './',
          scope: './',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Everything the app needs offline, including the ~950 KB barcode decoder (.wasm) and the Excel library
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          // Take control of the page on the very first visit, so it works offline without a reload.
          // (Updates still wait for the user's Reload tap — no skipWaiting.)
          clientsClaim: true,
        },
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    // Relative paths so the site works under any GitHub Pages URL (/<repo-name>/)
    base: './',
  };
});
