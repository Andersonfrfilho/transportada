/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isZeroAmount, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { TripFinancialResult } from './tripFinancials.types'
import type { TripValuationSummary } from './tripValuation.service'

export const EXPECTED_VERSUS_CLOSED_LINES = ['revenue', 'cost', 'result'] as const
export type ExpectedVersusClosedLine = (typeof EXPECTED_VERSUS_CLOSED_LINES)[number]

export type ExpectedVersusClosedRow = Readonly<{
  closed: string
  /** Fechado menos previsto: positivo quer dizer que a viagem fechou com mais do que se previu. */
  difference: string
  expected: string
  isDifferenceZero: boolean
  line: ExpectedVersusClosedLine
}>

type BuildExpectedVersusClosedParams = Readonly<{
  closed: TripFinancialResult
  expected: TripValuationSummary
}>

function negateAmount(value: string): string {
  if (isZeroAmount(value)) return value

  return value.startsWith('-') ? value.slice(1) : `-${value}`
}

function buildRow(line: ExpectedVersusClosedLine, expected: string, closed: string) {
  const difference = sumScaledAmounts([closed, negateAmount(expected)])

  return { closed, difference, expected, isDifferenceZero: isZeroAmount(difference), line }
}

/**
 * A avaliação prevista soma imposto dentro do custo (`totalCost`); o congelado guarda imposto e
 * custo em totais separados. Para comparar o mesmo com o mesmo, o custo fechado é a soma dos dois.
 */
export function buildExpectedVersusClosed(
  params: BuildExpectedVersusClosedParams,
): readonly ExpectedVersusClosedRow[] {
  const { closed, expected } = params

  return [
    buildRow('revenue', expected.revenue, closed.revenueAmount),
    buildRow('cost', expected.cost, sumScaledAmounts([closed.taxTotal, closed.costTotal])),
    buildRow('result', expected.margin, closed.netAmount),
  ]
}
