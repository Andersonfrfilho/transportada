/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
/** Campos que carregam documento de pessoa: é onde um número real entra sem ninguém reparar. */
const TAX_ID_FIELD = /(?:owner)?[Tt]ax_?Id\w*['"]?\s*:\s*['"](\d{11})['"]/gu

function hasValidCheckDigits(taxId: string): boolean {
  const digit = (slice: string): number => {
    const total = [...slice].reduce(
      (sum, character, index) => sum + Number(character) * (slice.length + 1 - index),
      0,
    )
    const remainder = 11 - (total % 11)
    return remainder > 9 ? 0 : remainder
  }

  return (
    digit(taxId.slice(0, 9)) === Number(taxId[9]) && digit(taxId.slice(0, 10)) === Number(taxId[10])
  )
}

/**
 * O CPF de teste **nunca** passa nos dígitos verificadores. Não é capricho: número válido pode ser
 * de alguém, e commitar documento de terceiro contraria o §1 do baseline de segurança.
 *
 * A regra nasceu de um caso real — duas fixtures carregavam nome, CPF e RNTRC do proprietário de um
 * CRLV de verdade, e o CPF era o **único** válido em toda a base de teste, ao lado de seis do seed
 * que são todos inválidos de propósito.
 */
/**
 * Exceções declaradas: CPFs canônicos de documentação, os que aparecem em todo validador e tutorial
 * brasileiro. Eles passam nos dígitos porque **precisam** passar — é o que os torna exemplo —, e
 * ninguém os colheu de documento de terceiro. A lista é fechada de propósito: número válido novo
 * reprova aqui até alguém dizer, por escrito, de onde ele veio.
 */
const CANONICAL_EXAMPLES = new Set(['11144477735', '12345678909', '39053344705'])

describe('synthetic tax ids', () => {
  test('no test fixture carries a tax id that could belong to a real person', async () => {
    const offenders: string[] = []
    const glob = new Bun.Glob('test/**/*.ts')

    for await (const relativePath of glob.scan({ cwd: new URL('.', APPLICATION_ROOT).pathname })) {
      const source = await Bun.file(new URL(relativePath, APPLICATION_ROOT)).text()
      for (const match of source.matchAll(TAX_ID_FIELD)) {
        const taxId = match[1] ?? ''
        if (hasValidCheckDigits(taxId) && !CANONICAL_EXAMPLES.has(taxId)) {
          offenders.push(`${relativePath}: ${taxId}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('recognises the difference it is guarding', () => {
    /** O que foi retirado das fixtures em 07/09/2026: válido, e por isso plausivelmente de alguém. */
    expect(hasValidCheckDigits('44423659891')).toBe(true)
    /** O que entrou no lugar, e os do seed local: inválidos por construção. */
    expect(hasValidCheckDigits('52914068731')).toBe(false)
    expect(hasValidCheckDigits('31820947016')).toBe(false)
    /** O que separa um do outro não é o número, é a procedência — e ela se declara. */
    expect(CANONICAL_EXAMPLES.has('44423659891')).toBe(false)
  })
})
