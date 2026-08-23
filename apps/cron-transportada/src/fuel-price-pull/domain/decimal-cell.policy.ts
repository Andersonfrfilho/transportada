/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A célula nativa da planilha guarda o preço com o ruído do float que a gerou (`4.38999...97`).
 * Reler esse texto com `Number` seria carregar o ruído para dentro do banco; aqui ele é digito, e a
 * redução para a escala 4 é meio-para-cima em `bigint`. É a mesma escala do `numeric(19,4)` da API.
 */
const CELL_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/
const PRICE_SCALE = 4n
const TEN = 10n

function rescaleHalfUp(input: {
  readonly fromScale: bigint
  readonly toScale: bigint
  readonly value: bigint
}): bigint {
  if (input.fromScale <= input.toScale) {
    return input.value * TEN ** (input.toScale - input.fromScale)
  }

  const divisor = TEN ** (input.fromScale - input.toScale)
  const quotient = input.value / divisor
  const remainder = input.value % divisor

  return remainder * 2n >= divisor ? quotient + 1n : quotient
}

function formatScaled(input: { readonly scale: number; readonly value: bigint }): string {
  const digits = input.value.toString().padStart(input.scale + 1, '0')
  const separator = digits.length - input.scale

  return `${digits.slice(0, separator)}.${digits.slice(separator)}`
}

export function readCellDecimal(input: { readonly text: string }): string {
  const match = CELL_DECIMAL_PATTERN.exec(input.text.trim())

  if (!match) {
    throw new Error('ANP_INVALID_PRICE')
  }

  const [, whole = '0', fraction = ''] = match
  const scaled = rescaleHalfUp({
    fromScale: BigInt(fraction.length),
    toScale: PRICE_SCALE,
    value: BigInt(`${whole}${fraction}`),
  })

  return formatScaled({ scale: Number(PRICE_SCALE), value: scaled })
}

/**
 * A ANEEL publica o valor como texto em pt-BR, e há forma com a parte inteira ausente (`,38`), que
 * o `0` da frente devolve ao vocabulário da célula da planilha. É o mesmo arredondamento e a mesma
 * escala — o preço da energia e o preço do litro entram no banco pela mesma régua.
 */
const COMMA_DECIMAL_PATTERN = /^([0-9]*),([0-9]+)$/

export function readCommaDecimal(input: { readonly text: string }): string {
  const match = COMMA_DECIMAL_PATTERN.exec(input.text.trim())

  if (!match) {
    throw new Error('ANEEL_INVALID_TARIFF')
  }

  const [, whole = '', fraction = ''] = match

  return readCellDecimal({ text: `${whole === '' ? '0' : whole}.${fraction}` })
}
