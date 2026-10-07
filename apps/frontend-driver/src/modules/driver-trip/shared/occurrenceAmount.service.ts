/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 247 (T5.3): o ESPELHO, no aparelho, de `apps/api-transportada/src/trips/domain/occurrence-amount.policy.ts`
 * — nenhuma app importa código de outra. A soma da linha e a soma geral saem com a mesma regra do
 * servidor (inteiro, meio para cima por linha, soma das linhas já arredondadas, valor pago digitado
 * vence); `test/driver-trip/occurrence-amount.contract.ts` roda os mesmos casos do contrato de lá.
 *
 * ⚠️ Tudo em `bigint`, nunca `number`: o binário erra o centavo em casos comuns (`1,005`, `8,345`).
 * O texto do `numeric` entra como string e sai como centavos exatos.
 */

const DECIMAL_PATTERN = /^([0-9]+)(?:\.([0-9]{1,4}))?$/u

const SCALE_DIGITS = 4
const SCALE_FACTOR = 10_000n
const CENTS_DIVISOR = 100n
const HALF_CENT = 50n
const PRODUCT_CENTS_DIVISOR = 1_000_000n
const PRODUCT_HALF_CENT = 500_000n
const THOUSANDS_BOUNDARY = /\B(?=(\d{3})+(?!\d))/gu
const TRAILING_ZEROS = /0+$/u

/** A mensagem não leva o valor: ele é dado de cliente, e não vai para log. */
const INVALID_DECIMAL_MESSAGE = 'INVALID_DECIMAL_AMOUNT'

export type OccurrenceAmountLine = {
  /** O valor pago digitado na linha; `null` é não digitado, e `'0.0000'` é a loja não ter pago. */
  readonly declaredAmount: null | string
  /** A quantidade devolvida; `null` é a linha inteira da nota, que vale o `vProd`. */
  readonly quantity: null | string
  readonly totalValue: string
  readonly unitValue: string
}

export type OccurrenceAmountLineResult = {
  /** O valor pago da linha, senão a soma da linha. */
  readonly itemAmountCents: bigint
  /** Quantidade × valor unitário, arredondado a centavos, meio para cima. */
  readonly lineAmountCents: bigint
}

export type OccurrenceAmountSummary = {
  /** O valor pago da ocorrência, senão a soma dos valores das linhas; `null` sem nada a somar. */
  readonly declaredAmountCents: bigint | null
  /** A soma das linhas já arredondadas; `null` sem linha. */
  readonly itemsSumCents: bigint | null
  readonly lines: readonly OccurrenceAmountLineResult[]
}

/** O texto do `numeric` (até 4 casas) em décimos de milésimo, exato. */
export function parseScaledDecimal(value: string): bigint {
  const match = DECIMAL_PATTERN.exec(value)
  if (match === null) throw new RangeError(INVALID_DECIMAL_MESSAGE)

  const fraction = (match[2] ?? '').padEnd(SCALE_DIGITS, '0')
  return BigInt(match[1] ?? '0') * SCALE_FACTOR + BigInt(fraction)
}

/** O `numeric` (até 4 casas) em centavos, meio para cima. */
export function parseAmountToCents(value: string): bigint {
  return (parseScaledDecimal(value) + HALF_CENT) / CENTS_DIVISOR
}

export function calculateItemLineAmount(input: {
  readonly quantity: null | string
  readonly totalValue: string
  readonly unitValue: string
}): bigint {
  if (input.quantity === null) return parseAmountToCents(input.totalValue)

  const product = parseScaledDecimal(input.quantity) * parseScaledDecimal(input.unitValue)
  return (product + PRODUCT_HALF_CENT) / PRODUCT_CENTS_DIVISOR
}

function sumCents(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n)
}

export function resolveOccurrenceAmounts(input: {
  readonly declaredAmount: null | string
  readonly lines: readonly OccurrenceAmountLine[]
}): OccurrenceAmountSummary {
  const lines = input.lines.map((line) => {
    const lineAmountCents = calculateItemLineAmount(line)
    const itemAmountCents =
      line.declaredAmount === null ? lineAmountCents : parseAmountToCents(line.declaredAmount)
    return { itemAmountCents, lineAmountCents }
  })

  const itemsSumCents = lines.length === 0 ? null : sumCents(lines.map((l) => l.lineAmountCents))
  const declaredAmountCents =
    input.declaredAmount !== null
      ? parseAmountToCents(input.declaredAmount)
      : lines.length === 0
        ? null
        : sumCents(lines.map((line) => line.itemAmountCents))

  return { declaredAmountCents, itemsSumCents, lines }
}

function groupThousands(digits: string): string {
  return digits.replace(THOUSANDS_BOUNDARY, '.')
}

/** `784064n` → `7.840,64`, sem símbolo: quem imprime escreve o `R$`. */
export function formatBrazilianAmount(cents: bigint): string {
  const integer = (cents / CENTS_DIVISOR).toString()
  const fraction = (cents % CENTS_DIVISOR).toString().padStart(2, '0')
  return `${groupThousands(integer)},${fraction}`
}

/** `'2.500'` → `2,5`, `'1.000'` → `1`: sem zeros à direita. */
export function formatBrazilianQuantity(value: string): string {
  const match = DECIMAL_PATTERN.exec(value)
  if (match === null) throw new RangeError(INVALID_DECIMAL_MESSAGE)

  const integer = groupThousands(BigInt(match[1] ?? '0').toString())
  const fraction = (match[2] ?? '').replace(TRAILING_ZEROS, '')
  return fraction === '' ? integer : `${integer},${fraction}`
}
