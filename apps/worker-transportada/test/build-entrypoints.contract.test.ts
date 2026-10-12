/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'

const SOURCE_DIRECTORY = new URL('../src/', import.meta.url)
const RUNTIME_ENTRYPOINT = './src/main.ts'

async function listMainModules(directory: URL, prefix: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const found: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      found.push(
        ...(await listMainModules(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`)),
      )
      continue
    }
    /**
     * `*.worker.ts` entra pela mesma razão que `*.main.ts`: `new Worker(url)` é caminho de arquivo
     * de verdade, e uma thread cujo módulo não foi empacotado morre no contêiner — em produção, com
     * o anexo já gravado esperando leitura.
     */
    if (
      entry.name === 'main.ts' ||
      entry.name.endsWith('.main.ts') ||
      entry.name.endsWith('.worker.ts')
    ) {
      found.push(`${prefix}${entry.name}`)
    }
  }

  return found.sort()
}

describe('worker build entrypoints contract', () => {
  /**
   * A imagem publicada só carrega `dist/`: um `*.main.ts` fora do build não existe no contêiner, e
   * o backfill vira algo que só roda na máquina de quem escreveu. Foi assim que a coluna nova ficou
   * sem preencher em staging — o comando estava no package.json, o arquivo não estava na imagem.
   */
  test('bundles every executable entrypoint and worker thread that ships in the image', async () => {
    const packageManifest = (await Bun.file(
      new URL('../package.json', import.meta.url),
    ).json()) as {
      readonly scripts?: Readonly<Record<string, string>>
    }
    const buildScript = packageManifest.scripts?.build ?? ''
    const mainModules = await listMainModules(SOURCE_DIRECTORY, './src/')

    expect(mainModules).toContain(RUNTIME_ENTRYPOINT)
    for (const module of mainModules) {
      expect(buildScript).toContain(module)
    }
  })

  /**
   * Staging, 15/09/2026: toda planta de carga virava `failed` em milissegundos. A thread estava no
   * `dist/`, mas o gateway a procurava ao lado de `dist/main.js` — `new URL('./x.worker.js',
   * import.meta.url)` resolve contra o bundle, não contra a pasta de origem. Entrar no build não
   * basta: o caminho que o código empacotado pede tem de ser o que o `--root ./src` grava.
   */
  test('every worker thread is requested at the path the bundled main.js resolves', async () => {
    const packageManifest = (await Bun.file(
      new URL('../package.json', import.meta.url),
    ).json()) as { readonly scripts?: Readonly<Record<string, string>> }
    expect(packageManifest.scripts?.build ?? '').toContain('--root ./src')

    const workerModules = (await listMainModules(SOURCE_DIRECTORY, './')).filter((module) =>
      module.endsWith('.worker.ts'),
    )
    const sources = await Promise.all(
      (await listSourceFiles(SOURCE_DIRECTORY)).map((file) => Bun.file(file).text()),
    )

    expect(workerModules.length).toBeGreaterThan(0)
    for (const module of workerModules) {
      const bundledPath = module.replace(/\.ts$/u, '.js')
      expect(sources.some((source) => source.includes(`'${bundledPath}'`))).toBe(true)
    }
  })
})

const WHISPER_TAG = 'v1.9.4'
const WHISPER_COMMIT = '927cfce34f31707e17f2bff35c349632fb9e2c3a'
const MODEL_FILE = 'ggml-small-q5_1.bin'
const MODEL_SHA256 = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'
const BUILD_TOOLS = /\b(cmake|g\+\+|gcc|make|git|build-base|curl)\b/u

type DockerStage = { readonly name: string; readonly body: string }

async function readDockerStages(): Promise<readonly DockerStage[]> {
  const dockerfile = await Bun.file(new URL('../Dockerfile', import.meta.url)).text()
  const withoutComments = dockerfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  return withoutComments
    .split(/^FROM /mu)
    .slice(1)
    .map((chunk) => ({
      name: /\sAS\s+(\S+)/u.exec(chunk.split('\n')[0] ?? '')?.[1] ?? '',
      body: chunk,
    }))
}

describe('worker image audio transcription contract', () => {
  test('builds whisper-cli in its own stage from the pinned tag and commit', async () => {
    const stage = (await readDockerStages()).find((candidate) => candidate.name === 'whisper-build')

    expect(stage).toBeDefined()
    expect(stage?.body).toContain(`WHISPER_TAG=${WHISPER_TAG}`)
    expect(stage?.body).toContain(`WHISPER_COMMIT=${WHISPER_COMMIT}`)
    expect(stage?.body).toContain('rev-parse HEAD')
    expect(stage?.body).toContain('-DGGML_NATIVE=OFF')
    expect(stage?.body).toContain('--target whisper-cli')
  })

  test('downloads the model in its own stage and fails the build when the sha256 diverges', async () => {
    const stage = (await readDockerStages()).find((candidate) => candidate.name === 'models')

    expect(stage).toBeDefined()
    expect(stage?.body).toContain('https://huggingface.co/ggerganov/whisper.cpp/resolve/')
    expect(stage?.body).toContain(`${MODEL_SHA256}  ${MODEL_FILE}`)
    expect(stage?.body).toContain('sha256sum -c')
  })

  test('the runtime stage carries binary, model and ffmpeg but no build tool', async () => {
    const stages = await readDockerStages()
    const runtime = stages.at(-1)

    expect(runtime?.name).toBe('runtime')
    expect(runtime?.body).toContain('COPY --from=whisper-build /usr/local/bin/whisper-cli')
    expect(runtime?.body).toContain('COPY --from=models')
    expect(runtime?.body).toContain(`/models/${MODEL_FILE}`)
    expect(runtime?.body).toMatch(/apk add[^\n]*\bffmpeg\b/u)
    expect(runtime?.body).toMatch(/apk add[^\n]*\blibstdc\+\+(?=\s)/u)
    expect(runtime?.body).not.toMatch(BUILD_TOOLS)
  })

  test('the runtime stage tells the worker where the model lives and stays non-root', async () => {
    const runtime = (await readDockerStages()).at(-1)

    expect(runtime?.body).toContain(`AUDIO_TRANSCRIPTION_MODEL_PATH=/models/${MODEL_FILE}`)
    expect(runtime?.body).toMatch(/^USER transportada$/mu)
    expect(runtime?.body.indexOf('USER transportada')).toBeGreaterThan(
      runtime?.body.indexOf('/models/') ?? Number.MAX_SAFE_INTEGER,
    )
  })
})

async function listSourceFiles(directory: URL): Promise<readonly URL[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? listSourceFiles(new URL(`${entry.name}/`, directory))
        : Promise.resolve(entry.name.endsWith('.ts') ? [new URL(entry.name, directory)] : []),
    ),
  )
  return nested.flat()
}
