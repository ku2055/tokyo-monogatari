import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages and inside a Capacitor iOS shell
export default defineConfig({
  base: './',
  worker: { format: 'es' },
});
