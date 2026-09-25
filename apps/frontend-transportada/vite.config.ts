import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'

import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'

import { assertDriverAppUrlBuildsClean } from './src/modules/identity/shared/identityEnvironment.config'
import {
  CONTENT_SECURITY_POLICY_FILE_NAME,
  buildContentSecurityPolicy,
} from './src/modules/shared/contentSecurityPolicy.service'
import {
  MAPLIBRE_SHARED_FILE_NAME,
  MAPLIBRE_WORKER_FILE_NAME,
  MAPLIBRE_WORKER_URL_DEFINE,
  buildMaplibreWorkerAssets,
} from './src/modules/shared/maplibreWorkerAssets.service'

const CONTENT_SECURITY_POLICY_HEADER = 'Content-Security-Policy'
/**
 * O chunk do OpenCV (ADR-0065, T8): nome fixo para o `globIgnores`/`runtimeCaching` do Workbox e
 * para o `chunkFileNames` abaixo saberem qual chunk é o build próprio, sem abrir o bundle para
 * achar. O padrão nunca casa com `vendor/opencv/opencv.js` em si — só com o chunk que o Vite emite
 * a partir dele.
 */
const OPENCV_CHUNK_PREFIX = 'assets/opencv-'
const OPENCV_CHUNK_GLOB = `${OPENCV_CHUNK_PREFIX}*.js`
const OPENCV_CACHE_NAME = 'transportada-opencv'
/**
 * Spec 156 T14, ADR-0069 §2: o motor de OCR do canhoto — nome de cache próprio, `CacheFirst`, fora
 * do precache. Só quem liga o interruptor (`canhotoOcrEnabled`) chega a baixar os ~4,5 MB.
 */
const CANHOTO_OCR_CACHE_NAME = 'transportada-canhoto-ocr'
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
        mapTilesUrl: readEnvironment('VITE_MAP_TILES_URL'),
        objectStorageUrl: readEnvironment('VITE_OBJECT_STORAGE_URL'),
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

/**
 * ADR-0075 §6, revisão M1: `VITE_DRIVER_APP_URL` inválida, ou igual a `VITE_APP_URL` (laço de
 * redirect consigo mesmo), só falhava em runtime, dentro do navegador do motorista —
 * `readDriverAppUrl()` lança, mas só quando alguém carrega o painel. Falhar o build devolve o erro
 * para quem fez o deploy, antes do bundle existir.
 */
function driverAppUrlValidationPlugin(): Plugin {
  return {
    name: 'transportada-driver-app-url-validation',
    configResolved(config) {
      const readEnvironment = (name: string): string | undefined => {
        const value: unknown = config.env[name]
        return typeof value === 'string' ? value : undefined
      }
      assertDriverAppUrlBuildsClean({
        appUrl: readEnvironment('VITE_APP_URL'),
        driverAppUrl: readEnvironment('VITE_DRIVER_APP_URL'),
      })
    },
  }
}

/**
 * O worker do MapLibre importa o shared pelo caminho relativo, e o `?url` copia só o worker: o
 * shared nunca chegava ao `dist` e o mapa não subia fora do `vite dev`. Aqui os dois saem juntos, e
 * o bundle recebe o endereço do worker por `define`. Só no build — em dev o `node_modules` já serve
 * os dois lado a lado.
 */
function maplibreWorkerAssetsPlugin(): Plugin {
  const requireFromConfig = createRequire(import.meta.url)
  const readDistribution = (fileName: string): string =>
    readFileSync(requireFromConfig.resolve(`maplibre-gl/dist/${fileName}`), 'utf8')
  const assets = buildMaplibreWorkerAssets({
    sharedSource: readDistribution(MAPLIBRE_SHARED_FILE_NAME),
    workerSource: readDistribution(MAPLIBRE_WORKER_FILE_NAME),
  })

  return {
    name: 'transportada-maplibre-worker-assets',
    apply: 'build',
    config: () => ({ define: { [MAPLIBRE_WORKER_URL_DEFINE]: JSON.stringify(assets.workerUrl) } }),
    generateBundle() {
      for (const file of assets.files) {
        this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source })
      }
    },
  }
}

/**
 * Pré-comprime só o chunk do OpenCV (3,05 MB brutos) no build: `server.ts` não comprime nada hoje
 * (ADR-0065 §4), e afrouxar isso para todo o bundle é escopo maior do que esta task pede. `.gz` e
 * `.br` ficam ao lado do chunk; o servidor escolhe pelo `Accept-Encoding` do pedido.
 */
function openCvCompressionPlugin(): Plugin {
  function isOpenCvChunk(fileName: string): boolean {
    return fileName.startsWith(OPENCV_CHUNK_PREFIX) && fileName.endsWith('.js')
  }

  return {
    name: 'transportada-opencv-compression',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if (!isOpenCvChunk(fileName)) continue
        const source =
          file.type === 'chunk' ? Buffer.from(file.code, 'utf8') : Buffer.from(file.source)
        this.emitFile({
          type: 'asset',
          fileName: `${fileName}.gz`,
          source: gzipSync(source, { level: 9 }),
        })
        this.emitFile({
          type: 'asset',
          fileName: `${fileName}.br`,
          source: brotliCompressSync(source, {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY },
          }),
        })
      }
    },
  }
}

export default defineConfig({
  envDir: resolve(import.meta.dirname, '../..'),
  plugins: [
    react(),
    contentSecurityPolicyPlugin(),
    driverAppUrlValidationPlugin(),
    maplibreWorkerAssetsPlugin(),
    openCvCompressionPlugin(),
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
        /**
         * O OpenCV do worker de medida (ADR-0065 §4, T8) sai pelo mesmo motivo do recorte de
         * fundo: 3 MB que a maioria de quem abre o app nunca vai baixar (a função nasce desligada,
         * D14). Diferente do recorte, ele é servido do próprio domínio (`vendor/opencv/`), então
         * ganha `CacheFirst` próprio — o worker o busca uma vez e o Service Worker guarda.
         */
        globIgnores: ['**/background-removal/**', '**/canhoto-ocr/**', OPENCV_CHUNK_GLOB],
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
          {
            urlPattern: new RegExp(`/${OPENCV_CHUNK_PREFIX}.*\\.js$`, 'u'),
            handler: 'CacheFirst',
            options: {
              cacheName: OPENCV_CACHE_NAME,
              expiration: { maxEntries: 2 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            /** Worker, 6 variantes de core e o modelo — a biblioteca escolhe uma variante por aparelho. */
            urlPattern: /\/canhoto-ocr\/.*$/u,
            handler: 'CacheFirst',
            options: {
              cacheName: CANHOTO_OCR_CACHE_NAME,
              expiration: { maxEntries: 12 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, './src') },
  },
  // O worker de medida é `type: 'module'` e faz `import()` do OpenCV — sem isto o Vite empacota o
  // worker em IIFE, que não tem `import()` dinâmico (T8, ADR-0065 §4).
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Nome fixo só para o chunk do OpenCV: os demais seguem o padrão do Vite sem mudança.
        chunkFileNames: (chunkInfo) =>
          chunkInfo.moduleIds.some((id) => id.includes('vendor/opencv/opencv.js'))
            ? `${OPENCV_CHUNK_PREFIX}[hash].js`
            : 'assets/[name]-[hash].js',
        /**
         * Spec 156 T14, ADR-0069 §2: `tesseract.js` é CommonJS (`"type": "commonjs"`), e o Rollup
         * funde módulo CJS só alcançado por `import()` dinâmico no chunk de quem chama, em vez de
         * separar (medido: sem isto, `createWorker` inteiro ia parar em `TripDetail.page`, e todo
         * mundo que abre uma viagem baixava o Tesseract). `manualChunks` força o pacote inteiro
         * para um chunk próprio, que só é buscado quando `canhotoOcrEngine.service.ts` chama
         * `import('tesseract.js')` — nunca no bundle inicial nem no de `TripDetail`.
         */
        manualChunks: (id) =>
          id.includes('/node_modules/tesseract.js/') ? 'tesseract-ocr' : undefined,
      },
    },
  },
  server: {
    proxy: API_PROXY,
  },
  // O smoke autenticado roda sobre `vite preview`, que não herda o proxy do servidor de dev
  preview: {
    proxy: API_PROXY,
  },
})
