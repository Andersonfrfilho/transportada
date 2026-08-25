import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'

import {
  CONTENT_SECURITY_POLICY_FILE_NAME,
  buildContentSecurityPolicy,
} from './src/modules/shared/contentSecurityPolicy.service'

const CONTENT_SECURITY_POLICY_HEADER = 'Content-Security-Policy'
const PWA_ICON_PATH = '/icons/icon-192.png'
const PWA_LARGE_ICON_PATH = '/icons/icon-512.png'
const PWA_THEME_COLOR = '#10222C'
const API_PROXY = {
  '/api': {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
    target: 'http://localhost:53001',
  },
}

/**
 * A CSP nasce aqui porque é aqui que a origem existe: `VITE_API_URL` é inlinada no bundle e não
 * chega ao contêiner que serve o `dist`. O arquivo emitido é o contrato entre o build e o
 * `server.ts`, que se recusa a subir sem ele — mesmo padrão do `frontend-transportada`.
 */
function contentSecurityPolicyPlugin(): Plugin {
  let servedPolicy = ''
  let developmentPolicy = ''

  return {
    name: 'landing-content-security-policy',
    configResolved(config) {
      const readEnvironment = (name: string): string | undefined => {
        const value: unknown = config.env[name]
        return typeof value === 'string' ? value : undefined
      }
      const apiBaseUrl = readEnvironment('VITE_API_URL')
      servedPolicy = buildContentSecurityPolicy({ allowsInlineScript: false, apiBaseUrl })
      developmentPolicy = buildContentSecurityPolicy({ allowsInlineScript: true, apiBaseUrl })
    },
    configureServer(server) {
      server.middlewares.use((_request, response, next) => {
        response.setHeader(CONTENT_SECURITY_POLICY_HEADER, developmentPolicy)
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_request, response, next) => {
        response.setHeader(CONTENT_SECURITY_POLICY_HEADER, servedPolicy)
        next()
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: CONTENT_SECURITY_POLICY_FILE_NAME,
        source: servedPolicy,
      })
    },
  }
}

export default defineConfig({
  envDir: resolve(import.meta.dirname, '../..'),
  plugins: [
    react(),
    contentSecurityPolicyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      includeAssets: ['icons/icon.svg', 'icons/icon-work-in-progress.svg', 'offline.html'],
      manifest: {
        name: 'TransportAdA',
        short_name: 'TransportAdA',
        description: 'Pré-cadastro de agregados e informações institucionais da transportadora.',
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
  preview: {
    proxy: API_PROXY,
  },
})
