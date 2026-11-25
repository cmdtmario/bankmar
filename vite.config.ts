import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
      manifest: {
        name: 'BanKMar',
        short_name: 'BanKMar',
        description: 'Finanças pessoais do Mário',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#1f5eff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
