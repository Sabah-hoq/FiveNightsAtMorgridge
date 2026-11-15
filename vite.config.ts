import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build so the demo runs from one index.html (demo laptop, artifact, or Vercel).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { assetsInlineLimit: 1_000_000 },
});
