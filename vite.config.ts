import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/** Publishes the agent skill file at /SKILL.md, so agents can fetch it from the site. */
function skillFile(): Plugin {
  return {
    name: 'uslides-skill-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'SKILL.md', source: readFileSync('skill/uslides/SKILL.md', 'utf8') });
    },
  };
}

export default defineConfig({
  base: '/',
  // Shown in the About menu. Tests build twice with different ids to check the update prompt.
  define: { __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? Date.now().toString()) },
  plugins: [
    react(),
    skillFile(),
    VitePWA({
      // The app asks before switching to a new version, so an edit in progress is never interrupted.
      registerType: 'prompt',
      manifest: {
        name: 'uslides',
        short_name: 'uslides',
        description: 'Write slides in Markdown. Works offline.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#1c1917',
        theme_color: '#1c1917',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // player/player.js (used by .html export), SKILL.md and llms.txt are cached so they work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,md,txt}'],
        // Only page navigations fall back to index.html. Scripts and text files are never rewritten.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/player\//, /\.(?:md|txt)$/],
        runtimeCaching: [
          {
            // Images from other sites that a deck uses: kept after the first view so they show offline.
            urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin,
            handler: 'CacheFirst',
            options: {
              cacheName: 'uslides-images',
              expiration: { maxEntries: 200 },
              // 0 is a cross-origin image loaded without CORS, which the browser hides the status of.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // The editor chunk (CodeMirror, about 305 kB) loads lazily and only on wide screens. The main chunk is about 650 kB, so the limit sits just above it.
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
