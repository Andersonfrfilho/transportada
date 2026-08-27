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
const PWA_THEME_COLOR = '#0B1F2A'
const API_PROXY = {
  '/api': {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
    target: 'http://localhost:53001',
  },
}

/**
 * A CSP nasce aqui porque é aqui que as origens existem — o mesmo desenho do painel, e pela mesma
 * razão: `VITE_*` é inlinado no bundle e não chega ao contêiner que serve o `dist`.
 */
function contentSecurityPolicyPlugin(): Plugin {
  let servedPolicy = ''
  let developmentPolicy = ''

  return {
    name: 'transportada-client-content-security-policy',
    configResolved(config) {
      const readEnvironment = (name: string): string | undefined => {
        const value: unknown = config.env[name]
        return typeof value === 'string' ? value : undefined
      }
      const origins = {
        apiBaseUrl: readEnvironment('VITE_API_URL'),
        keycloakUrl: readEnvironment('VITE_KEYCLOAK_URL'),
      }
      servedPolicy = buildContentSecurityPolicy({ ...origins, allowsInlineScript: false })
      developmentPolicy = buildContentSecurityPolicy({ ...origins, allowsInlineScript: true })
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
        name: 'Minhas entregas',
        short_name: 'Entregas',
        description: 'Acompanhamento de entregas para o contratante do frete.',
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
        /**
         * Nada de `runtimeCaching` para a API: entrega é estado que muda, e um cache aqui mostraria
         * "saiu para entrega" a quem já recebeu. O offline do portal é a casca, não o dado.
         */
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, './src') },
  },
  server: { proxy: API_PROXY },
  preview: { proxy: API_PROXY },
})
