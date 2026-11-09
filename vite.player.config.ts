import { defineConfig, type Plugin } from 'vite';

/** Puts the player's CSS inside the JS file, so the exported page needs one script and nothing else. */
function inlineCss(): Plugin {
  return {
    name: 'uslides-inline-css',
    enforce: 'post',
    apply: 'build',
    generateBundle(_options, bundle) {
      let css = '';
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'asset' && name.endsWith('.css')) {
          css += String(file.source);
          delete bundle[name];
        }
      }
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          file.code =
            `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();\n` +
            file.code;
        }
      }
    },
  };
}

// Builds public/player/player.js, which the app fetches when it makes a single-file .html export.
export default defineConfig({
  publicDir: false,
  plugins: [inlineCss()],
  build: {
    outDir: 'public/player',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/player/main.ts', name: 'uslidesPlayer', formats: ['iife'], fileName: () => 'player.js' },
  },
});
