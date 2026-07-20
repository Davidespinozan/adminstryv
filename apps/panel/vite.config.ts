import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // Los tests de `ops/` son lógica pura: sin red, sin navegador. Si alguno
    // necesitara un fetch, está mal ubicado y va a otra capa.
    include: ['src/**/*.test.ts']
  }
});
