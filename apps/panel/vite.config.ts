import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Se sirve en /nuevo/ mientras convive con el panel viejo. Sin esto, el HTML
  // compilado pide sus archivos a /assets/... (raíz del sitio, donde vive el
  // panel viejo) y el nuevo carga en blanco sin ningún error visible.
  base: '/nuevo/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // Los tests de `ops/` son lógica pura: sin red, sin navegador. Si alguno
    // necesitara un fetch, está mal ubicado y va a otra capa.
    include: ['src/**/*.test.ts']
  }
});
