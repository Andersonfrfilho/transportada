/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  MAPLIBRE_SHARED_FILE_NAME,
  MAPLIBRE_WORKER_FILE_NAME,
  MAPLIBRE_WORKER_URL_DEFINE,
  buildMaplibreWorkerAssets,
} from '../../src/modules/shared/maplibreWorkerAssets.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const RELATIVE_IMPORT_PATTERN = /from\s*"\.\/([^"]+)"/gu

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readMaplibreDistribution(fileName: string): Promise<string> {
  return Bun.file(Bun.resolveSync(`maplibre-gl/dist/${fileName}`, import.meta.dir)).text()
}

function directoryOf(fileName: string): string {
  return fileName.slice(0, fileName.lastIndexOf('/'))
}

/**
 * Staging e produção, 15/09/2026: o mapa da montagem não subia. O worker do MapLibre importa
 * `./maplibre-gl-shared.mjs`, o `?url` copiava só o worker, e o shared caía no `index.html` — o
 * navegador recusava "MIME text/html". Os smokes não pegavam: rodam com o mapa de rua ausente.
 */
describe('o worker do MapLibre chega inteiro ao build', () => {
  test('todo import relativo do worker real é um arquivo gravado na mesma pasta', async () => {
    const workerSource = await readMaplibreDistribution(MAPLIBRE_WORKER_FILE_NAME)
    const sharedSource = await readMaplibreDistribution(MAPLIBRE_SHARED_FILE_NAME)
    const assets = buildMaplibreWorkerAssets({ sharedSource, workerSource })
    const relativeImports = [...workerSource.matchAll(RELATIVE_IMPORT_PATTERN)].map(
      (match) => match[1],
    )

    expect(relativeImports.length).toBeGreaterThan(0)
    for (const importedFile of relativeImports) {
      expect(assets.files.map((file) => file.fileName)).toContain(
        `${assets.directory}/${importedFile}`,
      )
    }
    expect(new Set(assets.files.map((file) => directoryOf(file.fileName)))).toEqual(
      new Set([assets.directory]),
    )
    expect(assets.workerUrl).toBe(`/${assets.directory}/${MAPLIBRE_WORKER_FILE_NAME}`)
  })

  /** `/assets/` é imutável por um ano: o nome da pasta tem de mudar junto com o conteúdo. */
  test('a pasta muda quando o worker ou o shared muda', () => {
    const base = buildMaplibreWorkerAssets({ sharedSource: 'shared', workerSource: 'worker' })

    expect(
      buildMaplibreWorkerAssets({ sharedSource: 'shared', workerSource: 'worker 2' }).directory,
    ).not.toBe(base.directory)
    expect(
      buildMaplibreWorkerAssets({ sharedSource: 'shared 2', workerSource: 'worker' }).directory,
    ).not.toBe(base.directory)
    expect(
      buildMaplibreWorkerAssets({ sharedSource: 'shared', workerSource: 'worker' }).directory,
    ).toBe(base.directory)
  })

  test('não publica referência a source map que não vai junto', () => {
    const assets = buildMaplibreWorkerAssets({
      sharedSource: 'shared\n//# sourceMappingURL=maplibre-gl-shared.mjs.map',
      workerSource: 'worker\n//# sourceMappingURL=maplibre-gl-worker.mjs.map\n',
    })

    for (const file of assets.files) expect(file.source).not.toContain('sourceMappingURL')
  })

  test('o build grava os dois arquivos e o mapa lê o endereço injetado', async () => {
    const viteConfig = await readApplicationFile('vite.config.ts')
    const basemap = await readApplicationFile('src/modules/shared/vectorBasemap.service.ts')

    expect(viteConfig).toContain("name: 'transportada-maplibre-worker-assets'")
    expect(viteConfig).toContain('maplibreWorkerAssetsPlugin(),')
    expect(viteConfig).toContain('[MAPLIBRE_WORKER_URL_DEFINE]')
    expect(basemap).toContain(`typeof ${MAPLIBRE_WORKER_URL_DEFINE} === 'string'`)
  })

  /** O fallback do SPA com 200 foi o que transformou um 404 em "MIME text/html" sem pista nenhuma. */
  test('o servidor responde 404 a asset que não existe, antes de cair no index', async () => {
    const server = await readApplicationFile('server.ts')
    const assetGuard = server.indexOf('url.pathname.startsWith(IMMUTABLE_ASSET_PREFIX)')
    const spaFallback = server.indexOf('resolveAsset(`/${INDEX_PATH}`)')

    expect(assetGuard).toBeGreaterThan(-1)
    expect(spaFallback).toBeGreaterThan(assetGuard)
    expect(server.slice(assetGuard, spaFallback)).toContain('status: 404')
  })
})
