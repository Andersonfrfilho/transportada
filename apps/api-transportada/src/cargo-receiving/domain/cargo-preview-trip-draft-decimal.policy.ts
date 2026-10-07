/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: a soma dos totais de um roteiro. Decimal é aritmética inteira (`bigint`) — o valor e o
 * peso vêm do banco como texto, e somar em ponto flutuante daria centavos que não fecham.
 */
const DECIMAL = /^(\d+)(?:\.(\d+))?$/u

export type SumDecimalsParams = {
  /** As casas mínimas do resultado: a soma de nada é `0.00`, não `0`. */
  readonly minimumScale: number
  readonly values: readonly (string | null)[]
}

type ParsedDecimal = { readonly digits: bigint; readonly scale: number }

function parseDecimal(value: string | null): ParsedDecimal | null {
  if (value === null) return null
  const match = DECIMAL.exec(value.trim())
  if (match === null) return null
  const [, integer = '', fraction = ''] = match
  return { digits: BigInt(`${integer}${fraction}`), scale: fraction.length }
}

function formatScaled(scaled: bigint, scale: number): string {
  if (scale === 0) return scaled.toString()
  const text = scaled.toString().padStart(scale + 1, '0')
  return `${text.slice(0, -scale)}.${text.slice(-scale)}`
}

/** Valores nulos ou ilegíveis não somam; o resultado guarda a maior escala vista (ou a mínima). */
export function sumDecimals({ minimumScale, values }: SumDecimalsParams): string {
  const parsed = values.flatMap((value) => {
    const decimal = parseDecimal(value)
    return decimal === null ? [] : [decimal]
  })
  const scale = Math.max(minimumScale, ...parsed.map((decimal) => decimal.scale))
  const total = parsed.reduce(
    (sum, decimal) => sum + decimal.digits * 10n ** BigInt(scale - decimal.scale),
    0n,
  )
  return formatScaled(total, scale)
}

/** `null` quando nenhum valor chegou: "a planilha não traz volume" não é "volume zero". */
export function sumDecimalsOrNull(params: SumDecimalsParams): string | null {
  return params.values.some((value) => parseDecimal(value) !== null) ? sumDecimals(params) : null
}
