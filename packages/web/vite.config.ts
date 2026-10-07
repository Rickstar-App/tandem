import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@tandem/engine': fileURLToPath(new URL('../engine/src/index.ts', import.meta.url)),
      '@tandem/server': fileURLToPath(new URL('../server/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787', '/ws': { target: 'ws://localhost:8787', ws: true } } },
  build: { target: 'es2022', sourcemap: true },
});
