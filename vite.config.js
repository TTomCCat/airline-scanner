import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
    ],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    // Relative paths so the site works under any GitHub Pages URL (/<repo-name>/)
    base: './',
  };
});
