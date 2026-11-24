// App icons for the installable app: `npx pwa-assets-generator` → public/*.png + favicon.ico
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Android "maskable" and iPhone icons get a solid navy background around the logo
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#1f3a5f' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#1f3a5f' } },
  },
  images: ['public/logo.svg'],
});
