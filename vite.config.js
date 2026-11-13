import { defineConfig } from 'vite';
// base './' so the build works from GitHub Pages sub-paths and as a single file.
export default defineConfig({ base: './', server: { host: true } });
