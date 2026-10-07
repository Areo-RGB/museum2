import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      output: {
        // three.js changes rarely; keep it in its own long-cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
    // three + RectAreaLight LTC tables (cinema screen glow) land around 770 kB.
    chunkSizeWarningLimit: 800,
  },
});
