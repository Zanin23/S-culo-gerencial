import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The preview proxies the dev server from a sandbox host, so host checking is
// disabled for the app itself. Bind on all interfaces for the live preview.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
