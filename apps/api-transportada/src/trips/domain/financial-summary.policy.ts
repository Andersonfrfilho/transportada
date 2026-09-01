/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { divideHalfUp, formatScaledDecimal, MONEY_SCALE } from '../../shared/decimal.service.js'

const ZERO = '0.0000'
const PERCENT = 100n

export const FINANCIAL_SUMMARY_GROUPS = ['period', 'vehicle', 'driver'] as const
export type FinancialSummaryGroup = (typeof FINANCIAL_SUMMARY_GROUPS)[number]

export type FinancialSummaryRow = {
  readonly costTotal: string
  readonly groupId: string
  readonly groupLabel: string
  /** Falso quando alguma viagem do grupo tinha parcela desconhecida ou CT-e faltando. */
  readonly isComplete: boolean
  readonly netAmount: string
  readonly revenueAmount: string
  readonly taxTotal: string
  readonly tripCount: number
}

export type FinancialSummaryInput = {
  readonly rows: readonly FinancialSummaryRow[]
  /**
   * ADR-0049 §3: a folha do período. Ela **não** está nas viagens — o salário do motorista da casa é
   * custo do período, e é aqui que ele desce. `null` quando não há assalariado na frota.
   */
  readonly payrollAmount: null | string
}

export type FinancialSummary = {
  readonly costTotal: string
  readonly groups: readonly FinancialSummaryRow[]
  readonly isComplete: boolean
  /** Líquido **depois** da folha: é o número que responde "o mês fechou no azul?". */
  readonly netAmount: string
  readonly payrollAmount: null | string
  readonly revenueAmount: string
  readonly taxTotal: string
  readonly tripCount: number
  readonly marginRate: null | string
}

/**
 * Spec 061 D5: **somar é tão importante quanto calcular.** Uma viagem isolada não decide nada; o que
 * decide é o acumulado — aquele caminhão se paga, quanto custa cada agregado por real faturado.
 *
 * A folha entra **uma vez**, no total, e nunca dentro dos grupos: ratear salário por viagem é
 * exatamente o que a ADR-0049 §3 recusa, e ratear por veículo seria a mesma invenção com outro nome.
 */
export function buildFinancialSummary(input: FinancialSummaryInput): FinancialSummary {
  const revenue = sum(input.rows.map((row) => row.revenueAmount))
  const tax = sum(input.rows.map((row) => row.taxTotal))
  const cost = sum(input.rows.map((row) => row.costTotal)) + toScaled(input.payrollAmount ?? ZERO)
  const net = revenue - tax - cost

  return {
    costTotal: format(cost),
    groups: input.rows,
    /**
     * O acumulado é completo só quando **toda** viagem dele é. Uma incompleta no meio já torna o
     * total uma aproximação, e chamá-lo de fechado seria a mentira que a ADR-0049 §2 existe para
     * impedir.
     */
    isComplete: input.rows.every((row) => row.isComplete) && input.payrollAmount !== null,
    /** Mesma conta da viagem: percentual com quatro casas, meio para cima, sem ponto flutuante. */
    marginRate:
      revenue === 0n
        ? null
        : formatScaledDecimal(
            divideHalfUp(net * PERCENT * 10n ** MONEY_SCALE, revenue),
            MONEY_SCALE,
          ),
    netAmount: format(net),
    payrollAmount: input.payrollAmount,
    revenueAmount: format(revenue),
    taxTotal: format(tax),
    tripCount: input.rows.reduce((total, row) => total + row.tripCount, 0),
  }
}

function sum(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + toScaled(value), 0n)
}

function toScaled(value: string): bigint {
  const [integer = '0', fraction = ''] = value.split('.')
  const negative = integer.startsWith('-')

  return (
    (negative ? -1n : 1n) * BigInt(`${integer.replace('-', '')}${`${fraction}0000`.slice(0, 4)}`)
  )
}

function format(value: bigint): string {
  return formatScaledDecimal(value, MONEY_SCALE)
}
