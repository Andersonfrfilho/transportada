/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const SCANNER_PATH = 'src/components/ui/box-dimension-scanner.tsx'
const HOOK_PATH = 'src/components/ui/useBoxDimensionScanner.hook.ts'
const WORKER_PATH = 'src/components/ui/boxDimension.worker.ts'
const VITE_CONFIG_PATH = 'vite.config.ts'

/**
 * `box-dimension-scanner` (spec 152 T8, ADR-0065) só existe em `src/components/ui/` — a mesma
 * regra do leitor de etiqueta (`apps/frontend-transportada/CLAUDE.md`). Sem renderer/jsdom nesta
 * base, a garantia é estrutural sobre o código-fonte, no mesmo estilo de
 * `barcode-scanner.contract.ts` e `camera-stream.contract.ts`.
 */
describe('o primitivo de medida de caixa pela câmera (spec 152 T8, ADR-0065)', () => {
  it('cria o worker por new URL, nunca por blob:', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain(
      "new Worker(new URL('./boxDimension.worker.ts', import.meta.url), {\n      type: 'module',\n    })",
    )
    expect(hook).not.toContain('blob:')
    expect(await readApplicationFile(SCANNER_PATH)).not.toContain('blob:')
    expect(await readApplicationFile(WORKER_PATH)).not.toContain('blob:')
  })

  it('só o worker importa o OpenCV — o hook e o componente não', async () => {
    const worker = await readApplicationFile(WORKER_PATH)
    expect(worker).toMatch(/import\(\s*'\.\.\/\.\.\/\.\.\/vendor\/opencv\/opencv\.js'\s*\)/u)
    const hook = await readApplicationFile(HOOK_PATH)
    const scanner = await readApplicationFile(SCANNER_PATH)
    expect(hook).not.toContain('vendor/opencv')
    expect(scanner).not.toContain('vendor/opencv')
  })

  it('o chunk do OpenCV fica fora do precache e ganha CacheFirst próprio (T8)', async () => {
    const viteConfig = await readApplicationFile(VITE_CONFIG_PATH)
    expect(viteConfig).toContain('OPENCV_CHUNK_GLOB')
    expect(viteConfig).toMatch(/globIgnores:\s*\[[^\]]*OPENCV_CHUNK_GLOB/)
    expect(viteConfig).toContain('cacheName: OPENCV_CACHE_NAME')
    expect(viteConfig).toContain("handler: 'CacheFirst'")
    expect(viteConfig).toContain("const OPENCV_CACHE_NAME = 'transportada-opencv'")
  })

  it('o worker sai em ES module — sem isso o import() dinâmico não empacota (T8)', async () => {
    const viteConfig = await readApplicationFile(VITE_CONFIG_PATH)
    expect(viteConfig).toMatch(/worker:\s*\{\s*format:\s*'es',?\s*\}/)
  })

  it('o chunk do OpenCV é pré-comprimido no build (gzip e brotli), fora da CSP e do bundle inicial', async () => {
    const viteConfig = await readApplicationFile(VITE_CONFIG_PATH)
    expect(viteConfig).toContain('openCvCompressionPlugin')
    expect(viteConfig).toContain('gzipSync')
    expect(viteConfig).toContain('brotliCompressSync')
    expect(viteConfig).not.toContain("'unsafe-eval'")
  })

  it('o servidor serve o chunk pré-comprimido pelo Accept-Encoding, nunca a CSP nem os headers', async () => {
    const server = await readApplicationFile('server.ts')
    expect(server).toContain('OPENCV_CHUNK_PATTERN')
    expect(server).toContain('precompressedResponse')
    expect(server).toContain("'Content-Encoding'")
    expect(server).toContain("'Vary'")
    expect(server).not.toContain("'unsafe-eval'")
  })

  it('apaga o vídeo e encerra o worker ao desativar ou desmontar', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain('video.srcObject = null')
    expect(hook).toContain('worker.terminate()')
  })

  it('nunca manda a imagem para a rede — nem o hook, nem o componente, nem o worker chamam fetch', async () => {
    for (const path of [SCANNER_PATH, HOOK_PATH, WORKER_PATH]) {
      const source = await readApplicationFile(path)
      expect(source).not.toMatch(/\bfetch\s*\(/u)
    }
  })

  it('cai no digitado quando o WebAssembly não existe, o motor falha ou o quadro é lento demais', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain("typeof WebAssembly === 'undefined'")
    expect(hook).toContain("onUnsupportedRef.current('noWasm')")
    expect(hook).toContain("fail('engineFailed')")
    expect(hook).toContain("fail('tooSlow')")
    expect(hook).toContain('ENGINE_LOAD_TIMEOUT_MS = 15_000')
  })

  it('as props de texto são obrigatórias — o primitivo não traduz nada sozinho', async () => {
    const scanner = await readApplicationFile(SCANNER_PATH)
    const propsBlock = scanner.split('export type BoxDimensionScannerProps')[1]?.split('}>')[0]
    expect(propsBlock).toBeDefined()
    for (const prop of [
      'captureLabel: string',
      'confirmLabel: string',
      'instructionLabel: string',
      'loadingLabel: string',
      'retryLabel: string',
      'title: string',
    ]) {
      expect(propsBlock).toContain(prop)
    }
  })

  it('a regra está documentada e referenciada no CLAUDE.md da app', async () => {
    const doc = await Bun.file(
      new URL('../../../../docs/frontend/box-dimension-scanner.md', import.meta.url),
    ).text()
    expect(doc).toContain('boxDimension.worker.ts')
    expect(doc).toContain('ADR-0065')
    const claudeMd = await readApplicationFile('CLAUDE.md')
    expect(claudeMd).toContain('docs/frontend/box-dimension-scanner.md')
  })

  it('usa o motor puro da T6 — pose e margem continuam fora do worker (ADR-0065 §1)', async () => {
    const hook = await readApplicationFile(HOOK_PATH)
    expect(hook).toContain("from './boxDimension.service'")
    expect(hook).toContain('measureBox(')
    expect(hook).toContain('estimateMargins(')
    expect(hook).toContain('classifyMeasurement(')
    const worker = await readApplicationFile(WORKER_PATH)
    expect(worker).not.toContain('measureBox')
    expect(worker).not.toContain('solvePnP')
  })
})
