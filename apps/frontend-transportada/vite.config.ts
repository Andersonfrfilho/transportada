import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

const PWA_ICON_PATH = '/icons/icon-192.png'
const PWA_LARGE_ICON_PATH = '/icons/icon-512.png'
const PWA_THEME_COLOR = '#0B1F2A'
const API_PROXY = {
  '/api': {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
    target: 'http://localhost:53001',
  },
}

export default defineConfig({
  envDir: resolve(import.meta.dirname, '../..'),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: ['icons/icon.svg', 'icons/icon-work-in-progress.svg', 'offline.html'],
      manifest: {
        name: 'TransportAdA',
        short_name: 'TransportAdA',
        description: 'Fundação operacional para gestão de transportadoras.',
        start_url: '/',
        display: 'standalone',
        background_color: PWA_THEME_COLOR,
        theme_color: PWA_THEME_COLOR,
        icons: [
          { src: PWA_ICON_PATH, sizes: '192x192', type: 'image/png' },
          { src: PWA_LARGE_ICON_PATH, sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/health\/.*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'health-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: API_PROXY,
  },
  // O smoke autenticado roda sobre `vite preview`, que não herda o proxy do servidor de dev
  preview: {
    proxy: API_PROXY,
  },
})
