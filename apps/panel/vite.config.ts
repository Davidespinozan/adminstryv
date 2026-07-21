import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base '/nuevo/': el panel nuevo convive con el de siempre (index.html en la
// raíz) mientras se migra. Sin esto los assets apuntan a / y la página carga
// en blanco, sin ningún error visible.
export default defineConfig({
  plugins: [react()],
  base: '/nuevo/',
  build: { outDir: '../../nuevo', emptyOutDir: true }
});
