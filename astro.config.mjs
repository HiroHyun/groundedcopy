import { defineConfig, fontProviders } from 'astro/config';

// Locally the page builds for https://hirohyun.github.io/groundedcopy/. The deploy workflow
// sets SITE_URL and BASE_PATH from the repository's Pages settings, custom domain included.
const base = process.env.BASE_PATH ?? '/groundedcopy';

export default defineConfig({
  site: process.env.SITE_URL || 'https://hirohyun.github.io',
  base: base || '/',
  trailingSlash: 'always',
  i18n: {
    locales: ['en', 'zh'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
  // Newsreader is declared in src/styles/global.css, which corrects its vertical metrics.
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Instrument Sans',
      cssVariable: '--font-text',
      fallbacks: ['system-ui', 'sans-serif'],
      options: { variants: [{ src: ['./src/assets/fonts/InstrumentSans-Variable.woff2'], weight: '400 700', style: 'normal' }] },
    },
    {
      provider: fontProviders.local(),
      name: 'IBM Plex Mono',
      cssVariable: '--font-code',
      fallbacks: ['ui-monospace', 'monospace'],
      options: { variants: [{ src: ['./src/assets/fonts/IBMPlexMono-Regular.woff2'], weight: '400', style: 'normal' }] },
    },
    {
      provider: fontProviders.local(),
      name: 'Noto Serif SC',
      cssVariable: '--font-display-zh',
      fallbacks: ['serif'],
      options: { variants: [{ src: ['./src/assets/fonts/NotoSerifSC-700-subset.woff2'], weight: '700', style: 'normal' }] },
    },
    {
      provider: fontProviders.local(),
      name: 'Noto Sans SC',
      cssVariable: '--font-text-zh',
      fallbacks: ['sans-serif'],
      options: { variants: [{ src: ['./src/assets/fonts/NotoSansSC-subset.woff2'], weight: '400 700', style: 'normal' }] },
    },
  ],
});
