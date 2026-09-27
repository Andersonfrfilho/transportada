/* Cópia por valor de apps/frontend-client/vite.config.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'

import {
  CONTENT_SECURITY_POLICY_FILE_NAME,
  buildContentSecurityPolicy,
} from './src/modules/shared/contentSecurityPolicy.service'
import { DRIVER_WEB_MANIFEST } from './src/modules/shared/webManifest.constant'

const CONTENT_SECURITY_POLICY_HEADER = 'Content-Security-Policy'
const API_PROXY = {
  '/api': {
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
    target: 'http://localhost:53001',
  },
}

/**
 * A CSP nasce aqui porque é aqui que as origens existem — o mesmo desenho do painel e do portal:
 * `VITE_*` é inlinado no bundle e não chega ao contêiner que serve o `dist`.
 */
function contentSecurityPolicyPlugin(): Plugin {
  let servedPolicy = ''
  let developmentPolicy = ''

  return {
    name: 'transportada-driver-content-security-policy',
    configResolved(config) {
      const readEnvironment = (name: string): string | undefined => {
        const value: unknown = config.env[name]
        return typeof value === 'string' ? value : undefined
      }
      const origins = {
        apiBaseUrl: readEnvironment('VITE_API_URL'),
        keycloakUrl: readEnvironment('VITE_KEYCLOAK_URL'),
        // Spec 179: a foto da ocorrência sobe direto ao bucket (`PUT` na URL assinada).
        objectStorageUrl: readEnvironment('VITE_OBJECT_STORAGE_URL'),
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
      /**
       * ADR-0075 §5: `injectManifest`, porque o `push` da spec 147 mora neste `sw.ts`, e `prompt`,
       * porque recarregar sozinho no meio de uma assinatura ou de uma foto perde a captura.
       */
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      devOptions: { enabled: true, type: 'module' },
      // `offline.html` e `offline.css` já entram pelo glob padrão (`js`, `css`, `html`).
      includeAssets: [
        'icons/apple-touch-icon-180.png',
        'icons/icon.svg',
        'icons/icon-work-in-progress.svg',
      ],
      manifest: DRIVER_WEB_MANIFEST,
    }),
  ],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, './src') },
  },
  server: { proxy: API_PROXY },
  preview: { proxy: API_PROXY },
})
