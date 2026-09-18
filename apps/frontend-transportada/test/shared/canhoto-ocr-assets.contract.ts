import { describe, expect, test } from 'bun:test'

const script = await Bun.file(new URL('../../scripts/fetch-canhoto-ocr.ts', import.meta.url)).text()
const manifest = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string>
}
const rootIgnore = await Bun.file(new URL('../../../../.gitignore', import.meta.url)).text()
const viteConfig = await Bun.file(new URL('../../vite.config.ts', import.meta.url)).text()
const serverSource = await Bun.file(new URL('../../server.ts', import.meta.url)).text()
const tesseractCorePackage = (await Bun.file(
  new URL('../../node_modules/tesseract.js-core/package.json', import.meta.url),
).json()) as { version: string }

/**
 * Spec 156 T14, ADR-0069 §2: o motor de OCR do canhoto (worker, core WASM, modelo de língua) é
 * dependência npm com versão exata, posta em `public/canhoto-ocr/<versão>/` pelo script de
 * preparo — nada vem de URL externa (R1, R3, R7).
 */
describe('os artefatos do OCR do canhoto (ADR-0069 §2)', () => {
  test('ficam fora do Git', () => {
    expect(rootIgnore).toContain('apps/frontend-transportada/public/canhoto-ocr/')
  })

  test('são postos antes do build e antes do servidor de dev', () => {
    expect(manifest.scripts.prebuild).toContain('assets:canhoto-ocr')
    expect(manifest.scripts.predev).toContain('assets:canhoto-ocr')
  })

  /** As três dependências entram com versão exata — conferidas pelo lockfile, nunca por range. */
  test('tesseract.js, tesseract.js-core e @tesseract.js-data/eng são versão exata', () => {
    expect(manifest.dependencies['tesseract.js']).toBe('7.0.0')
    expect(manifest.devDependencies['tesseract.js-core']).toBe('7.0.0')
    expect(manifest.devDependencies['@tesseract.js-data/eng']).toBe('1.0.0')
  })

  /** R1 — o caminho é a versão instalada, nunca digitada; nem no script, nem no serviço do app. */
  test('R1: a versão do caminho vem do package.json instalado, não de literal', () => {
    expect(script).toContain("resolvePackageDirectory('tesseract.js-core/package.json')")
    expect(script).not.toMatch(/canhoto-ocr\/7\.0\.0/u)
  })

  test('R1: o caminho servido pelo app bate com a versão instalada do tesseract.js-core', async () => {
    const constant = await Bun.file(
      new URL('../../src/modules/trip/shared/canhotoOcrVersion.constant.ts', import.meta.url),
    ).text()
    expect(constant).toContain("from 'tesseract.js-core/package.json'")
    expect(tesseractCorePackage.version).toBe('7.0.0')
  })

  test('R3: o script gera .br/.gz de cada variante de core e do worker', () => {
    expect(script).toContain('ensureCompressedSiblings')
    expect(script).toContain('brotliCompressSync')
    expect(script).toContain('gzipSync')
  })

  test('R3: server.ts serve o pré-comprimido sob /canhoto-ocr/ com cache imutável', () => {
    expect(serverSource).toContain("CANHOTO_OCR_PREFIX = '/canhoto-ocr/'")
    expect(serverSource).toContain('url.pathname.startsWith(CANHOTO_OCR_PREFIX)')
    expect(serverSource).toMatch(
      /if \(pathname\.startsWith\(CANHOTO_OCR_PREFIX\)\) return IMMUTABLE_CACHE_CONTROL/u,
    )
  })

  /**
   * Medido: `tesseract.js` é CommonJS, e sem `manualChunks` o Rollup funde `createWorker` inteiro
   * no chunk de `TripDetail.page` (quem só abre uma viagem baixaria o motor de OCR de graça).
   */
  test('tesseract.js ganha manualChunks — nunca funde no chunk de quem chama import()', () => {
    expect(viteConfig).toContain("id.includes('/node_modules/tesseract.js/')")
    expect(viteConfig).toContain("'tesseract-ocr'")
  })

  test('fica fora do precache do Workbox e ganha CacheFirst próprio', () => {
    expect(viteConfig).toContain("'**/canhoto-ocr/**'")
    expect(viteConfig).toContain("const CANHOTO_OCR_CACHE_NAME = 'transportada-canhoto-ocr'")
    expect(viteConfig).toContain('cacheName: CANHOTO_OCR_CACHE_NAME')
  })

  /** R7 — licenças e avisos de terceiros seguem junto; sem trustedDependencies (o postinstall do
   * tesseract.js chama `opencollective-postinstall`, e o Bun não deve rodá-lo). */
  test('R7: só as variantes *.wasm.js entram; licenças e avisos são copiados', () => {
    expect(script).toContain('LICENSE-tesseract.js.md')
    expect(script).toContain('LICENSE-tesseract.js-core.txt')
    expect(script).toContain('THIRD-PARTY-NOTICES-worker.txt')
    expect(script).toContain('NOTICE-tesseract.js-data-eng.txt')
    expect(script).toContain("endsWith('.wasm.js')")
  })

  test('R7: sem trustedDependencies para o tesseract.js', async () => {
    const rootManifest = (await Bun.file(
      new URL('../../../../package.json', import.meta.url),
    ).json()) as { trustedDependencies?: readonly string[] }
    expect(rootManifest.trustedDependencies ?? []).not.toContain('tesseract.js')
  })
})
