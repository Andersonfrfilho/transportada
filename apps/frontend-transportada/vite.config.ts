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
 * A CSP nasce aqui porque é aqui que as origens existem: `VITE_API_URL` e `VITE_KEYCLOAK_URL` são
 * inlinadas no bundle e não chegam ao contêiner que serve o `dist`. O arquivo emitido é o contrato
 * entre o build e o `server.ts`, que se recusa a subir sem ele.
 */
function contentSecurityPolicyPlugin(): Plugin {
  let servedPolicy = ''
  let developmentPolicy = ''

  return {
    name: 'transportada-content-security-policy',
    configResolved(config) {
      // `config.env` é `Record<string, any>`: a leitura passa por aqui para a origem chegar tipada
      // ao construtor, e não como `any` que atravessa a fronteira sem ninguém olhar.
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
    // Diretiva que só existe em produção quebra em produção. Dev e preview servem a mesma, e é por
    // isso que um destino esquecido no `connect-src` aparece no `make dev`, não no cliente.
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
        /**
         * O modelo e o runtime do recorte de fundo ficam **fora** do precache: são 16 MB que o
         * service worker baixaria na primeira visita de toda pessoa — inclusive a que nunca vai
         * recortar foto nenhuma, e inclusive no celular do motorista, no 3G do pátio. Eles são
         * buscados no clique, e o cabeçalho de cache do servidor é quem os guarda depois disso.
         */
        globIgnores: ['**/background-removal/**'],
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
