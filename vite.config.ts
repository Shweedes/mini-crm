import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Относительные пути: сайт работает и в корне домена, и в подпапке (GitHub Pages: /mini-crm/).
  base: './',
});
