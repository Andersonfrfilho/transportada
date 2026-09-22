/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../../', import.meta.url)
const SOURCE_GLOB = 'src/**/*.ts'
const MONEY_CONSTANT_FILE = 'src/shared/money.constant.ts'
const DECLARATION_NEEDLE = 'const MONEY_DECIMAL ='

/**
 * ⚠️ A sétima cópia foi a que denunciou as seis anteriores. Regex de dinheiro repetida por módulo
 * não diverge de uma vez: um deles ganha mais uma casa, ou aceita negativo, e a fronteira que
 * recusava passa a aceitar — sem ninguém editar o arquivo que parecia ser a regra.
 */
async function listSourceFiles(): Promise<readonly string[]> {
  const files: string[] = []
  const glob = new Bun.Glob(SOURCE_GLOB)
  for await (const file of glob.scan({ cwd: APPLICATION_ROOT.pathname })) files.push(file)

  return files.sort()
}

describe('money decimal pattern', () => {
  test('is declared once, in the shared constant', async () => {
    const files = await listSourceFiles()
    expect(files.length).toBeGreaterThan(0)

    const declaring: string[] = []
    for (const file of files) {
      const source = await Bun.file(new URL(file, APPLICATION_ROOT)).text()
      if (source.includes(DECLARATION_NEEDLE)) declaring.push(file)
    }

    expect(declaring).toEqual([MONEY_CONSTANT_FILE])
  })

  /** A escala é a do banco: `numeric(19,4)`. Quatro casas exatas, nunca duas nem cinco. */
  test('accepts the four-decimal money the database stores, and nothing else', async () => {
    const { MONEY_DECIMAL } = await import('../../src/shared/money.constant.js')

    for (const accepted of ['0.0000', '250.0000', '200.3350', '999999999999999.9999'])
      expect(MONEY_DECIMAL.test(accepted)).toBe(true)

    for (const rejected of ['250', '250.00', '250.00000', '-250.0000', '0250.0000', ''])
      expect(MONEY_DECIMAL.test(rejected)).toBe(false)
  })
})
