/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A lista de arquivos de teste é explícita no `package.json`, e é uma linha só com mais de cento e
 * quarenta caminhos. Quem a reescreve a partir de uma cópia anterior derruba entradas sem perceber —
 * aconteceu três vezes em um único dia, com testes de specs diferentes.
 *
 * Os dois modos de falha são silenciosos, que é o que os torna caros:
 *
 * - arquivo no disco fora da lista **não roda**, e o gate fica verde por não estar olhando;
 * - caminho declarado que não existe é **ignorado sem aviso** pelo `bun test`, então um teste
 *   renomeado ou removido continua declarado para sempre.
 *
 * Nenhum dos dois quebra nada visível. Este contrato os transforma em falha barulhenta.
 */
import { existsSync, readdirSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const PACKAGE_PATH = new URL('../../package.json', import.meta.url)
const TEST_DIRECTORY = new URL('../', import.meta.url)

const DECLARED_PATH_PATTERN = /\.\/test\/[A-Za-z0-9._/-]+\.ts/g

async function readTestScript(): Promise<string> {
  const manifest = (await Bun.file(PACKAGE_PATH).json()) as {
    scripts: Readonly<Record<string, string>>
  }
  const script = manifest.scripts.test
  if (script === undefined) throw new Error('package.json sem script `test`')

  return script
}

function declaredPaths(script: string): readonly string[] {
  return [...script.matchAll(DECLARED_PATH_PATTERN)].map((match) => match[0])
}

function contractEntrypointsOnDisk(): readonly string[] {
  return readdirSync(TEST_DIRECTORY)
    .filter((entry) => entry.endsWith('.contract.test.ts'))
    .map((entry) => `./test/${entry}`)
    .sort()
}

describe('registro de arquivos de teste', () => {
  test('todo contrato no disco está declarado no script de teste', async () => {
    const declared = new Set(declaredPaths(await readTestScript()))

    const undeclared = contractEntrypointsOnDisk().filter((path) => !declared.has(path))

    expect(undeclared).toEqual([])
  })

  /** Caminho que não existe é ignorado em silêncio: some do gate sem nunca falhar. */
  test('todo caminho declarado existe no disco', async () => {
    const missing = declaredPaths(await readTestScript()).filter(
      (path) => !existsSync(new URL(path.replace('./test/', ''), TEST_DIRECTORY)),
    )

    expect(missing).toEqual([])
  })

  /** Entrada repetida esconde remoção: tirar uma cópia deixa a outra dando falsa segurança. */
  test('nenhum caminho é declarado duas vezes', async () => {
    const declared = declaredPaths(await readTestScript())

    expect(declared.length).toBe(new Set(declared).size)
  })
})
