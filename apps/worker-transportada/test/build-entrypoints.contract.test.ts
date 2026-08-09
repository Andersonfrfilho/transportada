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
    if (entry.name === 'main.ts' || entry.name.endsWith('.main.ts')) {
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
  test('bundles every executable entrypoint that ships in the image', async () => {
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
})
