import { defineConfig } from 'vitest/config';

export default defineConfig({
  // relative paths: the built app runs from any folder, also from GitHub Pages under /noise-floor/
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  // the listener tests push minutes of synthesized audio through real signal processing
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 60000 },
});
