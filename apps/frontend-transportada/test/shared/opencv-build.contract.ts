/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { buildContentSecurityPolicy } from '../../src/modules/shared/contentSecurityPolicy.service.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const ARTIFACT_URL = new URL('vendor/opencv/opencv.js', APPLICATION_ROOT)
/** O sha256 do artefato gerado por `deploy/opencv-build/build.sh` (ADR-0065). */
const ARTIFACT_SHA256 = '0299ef7bd89155591f8d8fb100354100030a8af916e5221b4e172da30d824d5d'
/** O único arquivo que pode importar o OpenCV: o worker de medida da T8 (ADR-0065 §3). */
const ALLOWED_IMPORTERS = ['components/ui/boxDimension.worker.ts'] as const

const artifact = new Uint8Array(await Bun.file(ARTIFACT_URL).arrayBuffer())
const artifactText = new TextDecoder().decode(artifact)
const buildScript = await Bun.file(new URL('deploy/opencv-build/build.sh', REPOSITORY_ROOT)).text()
const manifest = (await Bun.file(new URL('package.json', APPLICATION_ROOT)).json()) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}
const viteConfig = await Bun.file(new URL('vite.config.ts', APPLICATION_ROOT)).text()

function directiveOf(policy: string, name: string): string {
  const directive = policy.split('; ').find((entry) => entry.startsWith(`${name} `))
  if (directive === undefined) throw new Error(`CONTENT_SECURITY_POLICY_MISSING_DIRECTIVE_${name}`)
  return directive
}

async function collectOpenCvImporters(): Promise<readonly string[]> {
  const importers: string[] = []
  const glob = new Bun.Glob('**/*.{ts,tsx}')
  const sourceDirectory = fileURLToPath(new URL('src', APPLICATION_ROOT))

  for await (const relativePath of glob.scan({ cwd: sourceDirectory })) {
    // `vite-env.d.ts` só declara o módulo ambiente (T8, sem `.d.ts` o artefato não tem tipo) — não
    // importa nada, então não conta como importador.
    if (relativePath.endsWith('.d.ts')) continue
    const content = await Bun.file(`${sourceDirectory}/${relativePath}`).text()
    if (/vendor\/opencv|@techstark\/opencv-js/u.test(content)) importers.push(relativePath)
  }

  return importers.sort()
}

/**
 * O pacote `@techstark/opencv-js` morre sob a nossa CSP: o embind do Emscripten monta funções por
 * `new Function`, e `script-src` não tem `'unsafe-eval'` (sonda da T1, `EvalError`). O OpenCV entra
 * por build próprio, com `DYNAMIC_EXECUTION=0`, e a CSP fica como está.
 */
describe('o OpenCV da medida pela câmera (ADR-0065)', () => {
  test('é o artefato do build próprio, conferido por sha256', () => {
    expect(createHash('sha256').update(artifact).digest('hex')).toBe(ARTIFACT_SHA256)
  })

  /** Pega `new Function(`, `Function(` e `eval(` com espaço, sem casar `myFunction(` nem `x.eval(`. */
  test('não executa código montado em string', () => {
    expect(artifactText).not.toMatch(
      /(?<![A-Za-z0-9_$.])(new\s+)?Function\s*\(|(?<![A-Za-z0-9_$.])eval\s*\(/u,
    )
  })

  /** Caminho absoluto no binário vaza a máquina de quem compilou e impede reproduzir o sha256. */
  test('não carrega caminho da máquina que compilou', () => {
    expect(artifactText).not.toMatch(/\/Users\/|\/private\/|\/home\/runner\/|scratchpad/u)
  })

  /** Apache-2.0 §4: licença, aviso, modificações e licenças de terceiros ao lado do artefato. */
  test('é redistribuído com licença, NOTICE e licenças de terceiros', async () => {
    const vendorFiles = [
      'LICENSE',
      'COPYRIGHT',
      'NOTICE',
      'third-party-licenses/zlib-LICENSE',
      'third-party-licenses/emscripten-LICENSE',
    ]
    const existing = await Promise.all(
      vendorFiles.map((path) =>
        Bun.file(new URL(`vendor/opencv/${path}`, APPLICATION_ROOT)).exists(),
      ),
    )
    expect(existing.every(Boolean)).toBe(true)
  })

  /** Sem o ajuste, o wrapper UMD escreve em `this`, que é `undefined` num worker ESM. */
  test('traz o wrapper UMD ajustado para worker ESM', () => {
    expect(artifactText).toContain('}(globalThis, function () {')
    expect(artifactText).toContain('var Module = {};')
  })

  test('o build é reproduzível: versões fixadas e sem execução dinâmica', () => {
    expect(buildScript).toContain("EMSCRIPTEN_VERSION='4.0.20'")
    expect(buildScript).toContain("OPENCV_COMMIT='40738fb16ceddb5fb3fea747585f7ce6abb0605b'")
    expect(buildScript).toMatch(/EMSDK_COMMIT='[0-9a-f]{40}'/u)
    expect(buildScript).toContain('-s DYNAMIC_EXECUTION=0')
  })

  test('o pacote npm que exige eval não é dependência', () => {
    expect(manifest.dependencies['@techstark/opencv-js']).toBeUndefined()
    expect(manifest.devDependencies['@techstark/opencv-js']).toBeUndefined()
  })

  /** T8: o worker de medida existe e é quem de fato importa — lista exata, não subconjunto. */
  test('o worker de medida importa o OpenCV, e é o único', async () => {
    const importers = await collectOpenCvImporters()
    expect(importers).toEqual([...ALLOWED_IMPORTERS])
  })

  /**
   * `public/` é copiado para o `dist` e varrido pelo precache do Workbox: 2,6 MB na primeira
   * visita. T8: o chunk que o Vite emite a partir do artefato entra em `globIgnores` e ganha
   * `CacheFirst` próprio (`transportada-opencv`) — fora do precache, mas cacheado no primeiro uso.
   */
  test('fica fora de public/ e fora do precache; o chunk ganha CacheFirst próprio (T8)', () => {
    expect(fileURLToPath(ARTIFACT_URL)).not.toContain('/public/')
    expect(viteConfig).toMatch(/globIgnores:\s*\[[^\]]*OPENCV_CHUNK_GLOB/)
    expect(viteConfig).toContain("const OPENCV_CACHE_NAME = 'transportada-opencv'")
    expect(viteConfig).toContain("handler: 'CacheFirst'")
    expect(viteConfig).toContain('cacheName: OPENCV_CACHE_NAME')
  })

  test('a CSP não ganha diretiva: nem eval, nem blob no worker', () => {
    const policy = buildContentSecurityPolicy({
      allowsInlineScript: false,
      apiBaseUrl: 'https://api.exemplo.com.br',
      keycloakUrl: 'https://identidade.exemplo.com.br/auth',
      mapTilesUrl: undefined,
    })

    expect(directiveOf(policy, 'script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'")
    expect(directiveOf(policy, 'worker-src')).toBe("worker-src 'self'")
    expect(policy).not.toContain("'unsafe-eval'")
  })
})
