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
