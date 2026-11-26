import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode 'demo': um único HTML com dados fictícios, sem PWA (npm run build:demo).
export default defineConfig(({ mode }) => mode === 'demo' ? {
  base: './',
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist-demo', target: 'es2022' },
} : {
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
      manifest: {
        name: 'BankMaR',
        short_name: 'BankMaR',
        description: 'Finanças pessoais do Mário',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#080808',
        theme_color: '#080808',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
