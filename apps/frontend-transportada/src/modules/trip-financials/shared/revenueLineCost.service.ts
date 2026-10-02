/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { formatMargin, isNegative } from './financialView.service'
import type { Translate } from './tripCostParcelDetail.service'
import {
  COST_BASIS,
  TIME_BASIS,
  type TimeBasis,
  UNAVAILABLE_COST_GAP,
} from './tripValuation.constant'
import type { TripValuationRevenueLine } from './tripValuation.service'

/** Rótulo e valor já formatados: o componente só imprime. */
export type RevenueLineCostFigure = Readonly<{ amount: string; label: string }>

export type RevenueLineCostView =
  | Readonly<{
      /** O texto que a tela já usa para roteiro não calculado — gasto, lucro e margem não existem. */
      reason: string
      status: 'unavailable'
      tax: null | RevenueLineCostFigure
    }>
  | Readonly<{
      cost: RevenueLineCostFigure
      /** Lucro negativo aparece negativo e em destaque — a tela decide a cor por este indicador. */
      isLoss: boolean
      /** `null` quando o frete é zero: margem sobre zero não é informação. */
      margin: null | RevenueLineCostFigure
      /** "do trecho" e "rateio da viagem", nesta ordem — as duas partes que somam o gasto. */
      parts: readonly [RevenueLineCostFigure, RevenueLineCostFigure]
      profit: RevenueLineCostFigure
      status: 'available'
      tax: null | RevenueLineCostFigure
      /** `null` quando o tempo está completo; senão, o que faltou nele. */
      timeNotice: null | string
    }>

function describeTimeNotice(timeBasis: TimeBasis, t: Translate): null | string {
  if (timeBasis === TIME_BASIS.COMPLETE) return null

  return t(`documentCost.timeBasis.${timeBasis}`)
}

function toFigure(input: {
  readonly amount: string
  readonly key: string
  readonly t: Translate
}): RevenueLineCostFigure {
  return { amount: formatAmount(input.amount), label: input.t(`documentCost.${input.key}`) }
}

function toOptionalFigure(input: {
  readonly amount: null | string | undefined
  readonly key: string
  readonly t: Translate
}): null | RevenueLineCostFigure {
  if (input.amount === null || input.amount === undefined) return null

  return toFigure({ amount: input.amount, key: input.key, t: input.t })
}

function toMarginFigure(input: {
  readonly percentage: null | string | undefined
  readonly t: Translate
}): null | RevenueLineCostFigure {
  if (input.percentage === null || input.percentage === undefined) return null
  const amount = formatMargin(input.percentage)

  return amount === null ? null : { amount, label: input.t('documentCost.margin') }
}

/**
 * Spec 225 RF4/RF9: a linha da nota diz o que rendeu e o que gastou, com o gasto em duas partes —
 * "do trecho" (o que a nota causou andando e esperando) e "rateio da viagem" (retorno e avulso,
 * repartidos igualmente). `null` quando a linha veio sem os campos: a prévia e a sugestão não os têm.
 *
 * ⚠️ Dinheiro é string decimal até `formatAmount`; nenhuma conta aqui passa por `Number`.
 */
export function describeRevenueLineCost(input: {
  readonly line: TripValuationRevenueLine
  readonly t: Translate
}): null | RevenueLineCostView {
  const { line, t } = input
  if (line.costBasis === undefined || line.timeBasis === undefined) return null

  const tax = toOptionalFigure({ amount: line.taxAmount, key: 'tax', t })
  const margin = toMarginFigure({ percentage: line.marginPercentage, t })

  const { costAmount, legCostAmount, marginAmount, tripShareCostAmount } = line
  if (
    line.costBasis === COST_BASIS.UNAVAILABLE ||
    costAmount === null ||
    costAmount === undefined ||
    legCostAmount === null ||
    legCostAmount === undefined ||
    marginAmount === null ||
    marginAmount === undefined ||
    tripShareCostAmount === null ||
    tripShareCostAmount === undefined
  ) {
    return { reason: t(`gap.${UNAVAILABLE_COST_GAP}`), status: 'unavailable', tax }
  }

  return {
    cost: toFigure({ amount: costAmount, key: 'cost', t }),
    isLoss: isNegative(marginAmount),
    margin,
    parts: [
      toFigure({ amount: legCostAmount, key: 'legCost', t }),
      toFigure({ amount: tripShareCostAmount, key: 'tripShareCost', t }),
    ],
    profit: toFigure({ amount: marginAmount, key: 'profit', t }),
    status: 'available',
    tax,
    timeNotice: describeTimeNotice(line.timeBasis, t),
  }
}
