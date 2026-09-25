/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { DRIVER_WEB_MANIFEST } from '../src/modules/shared/webManifest.constant'

/**
 * Roda **depois** do `vite build`, como parte do próprio `build` (`vite build && bun test
 * test/dist.contract.test.ts`): o orçamento de precache é gate de build, não teste que alguém
 * lembra de rodar. Por isso este arquivo não está na lista de `test` — sem `dist/` ele não tem o
 * que ler.
 */

const DISTRIBUTION_DIRECTORY = new URL('../dist/', import.meta.url).pathname

/** 1,5 MiB. É o que o service worker baixa na primeira visita, no 3G do pátio (spec 189 RNF). */
const PRECACHE_BUDGET_BYTES = 1.5 * 1024 * 1024

/** Os pesos do painel que motivaram a separação (ADR-0075, Contexto 3). Nenhum chega aqui. */
const FORBIDDEN_ARTIFACT_PATTERN =
  /opencv|background-removal|canhoto-ocr|maplibre|tesseract|pdfjs/iu

/** `{url:"assets/index-abc.js",revision:null}` — o formato que o `injectManifest` inlina no `sw.js`. */
const PRECACHE_ENTRY_PATTERN = /url:"([^"]+)"/gu

async function listDistributionFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listDistributionFiles(path)))
      continue
    }
    files.push(relative(DISTRIBUTION_DIRECTORY, path))
  }

  return files
}

async function readPrecacheUrls(): Promise<readonly string[]> {
  const worker = await Bun.file(join(DISTRIBUTION_DIRECTORY, 'sw.js')).text()
  return [...new Set([...worker.matchAll(PRECACHE_ENTRY_PATTERN)].map(([, url]) => url ?? ''))]
}

describe('o bundle emitido da app do motorista', () => {
  test('o manifesto emitido tem os campos da ADR-0075 §5', async () => {
    const emitted: unknown = await Bun.file(
      join(DISTRIBUTION_DIRECTORY, 'manifest.webmanifest'),
    ).json()

    expect(emitted).toMatchObject({ ...DRIVER_WEB_MANIFEST })
    expect(Object.keys(emitted as object)).not.toContain('orientation')
  })

  /** Na raiz, fora de `/assets/`: o `server.ts` o serve com `no-cache`, nunca como imutável. */
  test('o sw.js nasce na raiz do dist, sem listener de sync', async () => {
    const worker = await Bun.file(join(DISTRIBUTION_DIRECTORY, 'sw.js')).text()

    expect(worker).toContain('SKIP_WAITING')
    expect(worker).not.toMatch(/addEventListener\(\s*["'](?:sync|periodicsync)["']/u)
  })

  test('a CSP foi emitida ao lado do bundle', async () => {
    const policy = await Bun.file(
      join(DISTRIBUTION_DIRECTORY, 'content-security-policy.txt'),
    ).text()

    expect(policy.trim()).not.toBe('')
  })

  test('o precache existe e cada entrada é um arquivo do dist', async () => {
    const urls = await readPrecacheUrls()
    const files = new Set(await listDistributionFiles(DISTRIBUTION_DIRECTORY))

    expect(urls).toContain('index.html')
    expect(urls.filter((url) => !files.has(url))).toEqual([])
  })

  test('o precache soma no máximo 1,5 MiB', async () => {
    const urls = await readPrecacheUrls()
    const sizes = await Promise.all(
      urls.map(async (url) => (await stat(join(DISTRIBUTION_DIRECTORY, url))).size),
    )
    const total = sizes.reduce((sum, size) => sum + size, 0)

    console.info(`precache: ${urls.length} arquivos, ${total} bytes`)
    expect(total).toBeLessThanOrEqual(PRECACHE_BUDGET_BYTES)
  })

  test('nada do peso do painel entra no dist nem no precache', async () => {
    const files = await listDistributionFiles(DISTRIBUTION_DIRECTORY)
    const urls = await readPrecacheUrls()

    expect(files.filter((file) => FORBIDDEN_ARTIFACT_PATTERN.test(file))).toEqual([])
    expect(urls.filter((url) => FORBIDDEN_ARTIFACT_PATTERN.test(url))).toEqual([])
  })
})
