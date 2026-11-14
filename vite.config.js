import { defineConfig } from 'vite';
// base './' so the build works from GitHub Pages sub-paths and as a single file.
// netcheck.html: the connection check page (which step fails when two players can't find each other).
export default defineConfig({
  base: './',
  server: { host: true },
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') },
  build: { rollupOptions: { input: { main: 'index.html', netcheck: 'netcheck.html' } } },
});
