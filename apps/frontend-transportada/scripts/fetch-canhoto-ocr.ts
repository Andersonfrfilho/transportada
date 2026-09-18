/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T14, ADR-0069 §2: põe o motor de OCR do canhoto (worker, core WASM e modelo de língua)
 * em `public/canhoto-ocr/<versão>/`. Molde de `fetch-background-removal.ts`: nada vem de URL
 * externa — os três pacotes (`tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng`) são
 * dependências npm com versão exata, conferidas pelo lockfile; este script só copia de
 * `node_modules`, e o Bun não roda o `postinstall` deles (sem `trustedDependencies`).
 *
 * **R1 — o diretório é versionado.** `<versão>` sai do `package.json` **instalado** do
 * `tesseract.js-core`, nunca digitada: atualizar o pacote sem mudar o caminho serviria o core
 * velho para sempre a quem já baixou (o service worker guarda por URL, `CacheFirst`). O contrato
 * (`static-canhoto-ocr-path.contract.ts`) confere que o caminho usado pelo app bate com a versão
 * instalada.
 *
 * O core **não é rebuild próprio** (diferente do OpenCV, ADR-0065 §2): o pacote publicado já roda
 * sob a nossa CSP sem mudança nenhuma (sonda da ADR-0069). Só as variantes `*.wasm.js` entram — são
 * as que instanciam o WASM a partir de bytes embutidos, cobertas por `'wasm-unsafe-eval'`; a
 * biblioteca escolhe entre elas por aparelho, e a documentação exige o diretório inteiro.
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib'

function resolvePackageDirectory(specifier: string): URL {
  const manifest = Bun.resolveSync(specifier, import.meta.dir)
  return new URL('./', Bun.pathToFileURL(manifest))
}

async function readPackageVersion(directory: URL): Promise<string> {
  const manifest: unknown = await Bun.file(new URL('package.json', directory)).json()
  const version =
    manifest !== null && typeof manifest === 'object' && 'version' in manifest
      ? manifest.version
      : undefined
  if (typeof version !== 'string') {
    throw new Error(`package.json sem "version" em ${directory.toString()}`)
  }
  return version
}

async function copyIfChanged(input: {
  readonly source: URL
  readonly target: URL
}): Promise<boolean> {
  const source = Bun.file(input.source)
  if (!(await source.exists())) {
    throw new Error(`Fonte ausente: ${input.source.toString()} — rode a instalação.`)
  }
  const target = Bun.file(input.target)
  if (await target.exists()) {
    const [sourceBytes, targetBytes] = await Promise.all([source.bytes(), target.bytes()])
    if (Buffer.compare(sourceBytes, targetBytes) === 0) return false
  }
  await Bun.write(input.target, source)
  return true
}

const TESSERACT_JS_DIRECTORY = resolvePackageDirectory('tesseract.js/package.json')
const TESSERACT_CORE_DIRECTORY = resolvePackageDirectory('tesseract.js-core/package.json')
const TESSERACT_ENG_DIRECTORY = resolvePackageDirectory('@tesseract.js-data/eng/package.json')

/** `4.0.0_best_int`: melhor leitura na sonda, 3,5× menor e carga 2,5× mais rápida que `4.0.0` (ADR-0069 §1). */
const MODEL_VARIANT = '4.0.0_best_int'
const MODEL_FILE = 'eng.traineddata.gz'

const licenseFiles = [
  { source: new URL('LICENSE.md', TESSERACT_JS_DIRECTORY), target: 'LICENSE-tesseract.js.md' },
  { source: new URL('LICENSE', TESSERACT_CORE_DIRECTORY), target: 'LICENSE-tesseract.js-core.txt' },
  {
    source: new URL('dist/worker.min.js.LICENSE.txt', TESSERACT_JS_DIRECTORY),
    target: 'THIRD-PARTY-NOTICES-worker.txt',
  },
] as const

/**
 * R3 — o script de preparo gera `.br`/`.gz` de cada `.wasm.js` e do `worker.min.js`; `server.ts`
 * escolhe entre eles pelo `Accept-Encoding` (mesma função do `openCvCompressionPlugin`, mas aqui
 * roda uma vez neste script, porque o arquivo já sai pronto de `public/` — não passa pelo Rollup).
 * Idempotente por conteúdo: recomprimir o mesmo arquivo é no-op.
 */
async function ensureCompressedSiblings(target: URL): Promise<boolean> {
  const original = new Uint8Array(await Bun.file(target).arrayBuffer())
  const gz = gzipSync(original, { level: 9 })
  const br = brotliCompressSync(original, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY },
  })
  const [gzChanged, brChanged] = await Promise.all([
    copyBufferIfChanged({ buffer: gz, target: new URL(`${target.toString()}.gz`) }),
    copyBufferIfChanged({ buffer: br, target: new URL(`${target.toString()}.br`) }),
  ])
  return gzChanged || brChanged
}

async function copyBufferIfChanged(input: {
  readonly buffer: Uint8Array
  readonly target: URL
}): Promise<boolean> {
  const target = Bun.file(input.target)
  if (await target.exists()) {
    const existing = await target.bytes()
    if (Buffer.compare(existing, input.buffer) === 0) return false
  }
  await Bun.write(input.target, input.buffer)
  return true
}

async function ensureCoreWasmVariants(targetDirectory: URL): Promise<number> {
  const entries = await readdir(TESSERACT_CORE_DIRECTORY)
  const variants = entries.filter(
    (name) => name.startsWith('tesseract-core') && name.endsWith('.wasm.js'),
  )
  if (variants.length === 0) {
    throw new Error('tesseract.js-core sem nenhuma variante *.wasm.js — instalação incompleta.')
  }
  const changes = await Promise.all(
    variants.map(async (name) => {
      const target = new URL(name, targetDirectory)
      const copied = await copyIfChanged({
        source: new URL(name, TESSERACT_CORE_DIRECTORY),
        target,
      })
      const compressed = await ensureCompressedSiblings(target)
      return copied || compressed
    }),
  )
  return changes.filter(Boolean).length
}

/**
 * `@tesseract.js-data/eng` não empacota `LICENSE` nem `NOTICE` — só o `package.json` (MIT) e o
 * modelo. R7: o texto abaixo registra as duas licenças envolvidas (o pacote e o `tessdata` do
 * Tesseract, Apache-2.0), no lugar de um arquivo que o pacote não traz.
 */
async function writeEngDataNotice(targetDirectory: URL): Promise<boolean> {
  const version = await readPackageVersion(TESSERACT_ENG_DIRECTORY)
  const text = `@tesseract.js-data/eng@${version}

O pacote (empacotamento do modelo) é MIT (https://github.com/naptha/tessdata).
O modelo em si (${MODEL_VARIANT}/${MODEL_FILE}) e o formato .traineddata são do projeto Tesseract
OCR (Apache-2.0, https://github.com/tesseract-ocr/tesseract), mantido pelo Google.
`
  const target = new URL('NOTICE-tesseract.js-data-eng.txt', targetDirectory)
  const existing = await Bun.file(target)
    .text()
    .catch(() => null)
  if (existing === text) return false
  await writeFile(target, text, 'utf8')
  return true
}

async function main(): Promise<void> {
  const version = await readPackageVersion(TESSERACT_CORE_DIRECTORY)
  const targetDirectory = new URL(`../public/canhoto-ocr/${version}/`, import.meta.url)
  await mkdir(targetDirectory, { recursive: true })

  const workerTarget = new URL('worker.min.js', targetDirectory)
  const changes = await Promise.all([
    copyIfChanged({
      source: new URL('dist/worker.min.js', TESSERACT_JS_DIRECTORY),
      target: workerTarget,
    }).then(async (copied) => (await ensureCompressedSiblings(workerTarget)) || copied),
    ensureCoreWasmVariants(targetDirectory).then((count) => count > 0),
    copyIfChanged({
      source: new URL(`${MODEL_VARIANT}/${MODEL_FILE}`, TESSERACT_ENG_DIRECTORY),
      target: new URL(MODEL_FILE, targetDirectory),
    }),
    ...licenseFiles.map((entry) =>
      copyIfChanged({ source: entry.source, target: new URL(entry.target, targetDirectory) }),
    ),
    writeEngDataNotice(targetDirectory),
  ])

  if (changes.some(Boolean)) {
    console.info(`[canhoto-ocr] public/canhoto-ocr/${version}/ em dia.`)
  }
}

await main()
