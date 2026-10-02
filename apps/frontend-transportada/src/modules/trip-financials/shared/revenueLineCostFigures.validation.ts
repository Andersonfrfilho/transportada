/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  COST_BASES,
  COST_BASIS,
  type CostBasis,
  TIME_BASES,
  type TimeBasis,
} from './tripValuation.constant'
import type { TripValuationRevenueLineCostFigures } from './tripValuation.service'

const COST_FIGURE_KEYS = [
  'costAmount',
  'costBasis',
  'legCostAmount',
  'marginAmount',
  'marginPercentage',
  'taxAmount',
  'timeBasis',
  'tripShareCostAmount',
] as const

/** Mesmo formato que `formatAmount` aceita: fora dele ele lança, e a tela da viagem cairia junto. */
const DECIMAL_AMOUNT_PATTERN = /^-?\d+(?:\.\d{1,4})?$/

export type RevenueLineCostFiguresReading =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'malformed' }>
  | Readonly<{ figures: TripValuationRevenueLineCostFigures; kind: 'present' }>

const ABSENT: RevenueLineCostFiguresReading = { kind: 'absent' }
const MALFORMED: RevenueLineCostFiguresReading = { kind: 'malformed' }

function isCostBasis(value: unknown): value is CostBasis {
  return COST_BASES.some((basis) => basis === value)
}

function isTimeBasis(value: unknown): value is TimeBasis {
  return TIME_BASES.some((basis) => basis === value)
}

function isDecimalOrNull(value: unknown): value is null | string {
  return value === null || (typeof value === 'string' && DECIMAL_AMOUNT_PATTERN.test(value))
}

/**
 * `unavailable` não tem número nenhum de gasto, lucro ou margem; `leg` tem gasto, as duas partes e
 * lucro (a margem percentual pode faltar: frete zero). Combinação fora disso é corpo que a API não
 * produz — lê-la como zero seria inventar resposta.
 */
function isCoherent(figures: TripValuationRevenueLineCostFigures): boolean {
  if (figures.costBasis === COST_BASIS.UNAVAILABLE) {
    return [
      figures.costAmount,
      figures.legCostAmount,
      figures.tripShareCostAmount,
      figures.marginAmount,
      figures.marginPercentage,
    ].every((value) => value === null)
  }

  return [
    figures.costAmount,
    figures.legCostAmount,
    figures.tripShareCostAmount,
    figures.marginAmount,
  ].every((value) => value !== null)
}

/**
 * Spec 225: os oito campos saem **juntos ou nenhum sai**. Nenhum é a prévia e a sugestão, e é
 * legítimo; parte deles, ou um com tipo errado, é corpo malformado — e a leitura diz isso em vez de
 * aceitar o que parece certo e seguir.
 */
export function readRevenueLineCostFigures(
  line: Readonly<Record<string, unknown>>,
): RevenueLineCostFiguresReading {
  const presentCount = COST_FIGURE_KEYS.filter((key) => line[key] !== undefined).length
  if (presentCount === 0) return ABSENT
  if (presentCount !== COST_FIGURE_KEYS.length) return MALFORMED

  const { costBasis, timeBasis } = line
  if (!isCostBasis(costBasis) || !isTimeBasis(timeBasis)) return MALFORMED

  const { costAmount, legCostAmount, marginAmount, marginPercentage, taxAmount } = line
  const { tripShareCostAmount } = line
  if (!isDecimalOrNull(costAmount)) return MALFORMED
  if (!isDecimalOrNull(legCostAmount)) return MALFORMED
  if (!isDecimalOrNull(marginAmount)) return MALFORMED
  if (!isDecimalOrNull(marginPercentage)) return MALFORMED
  if (!isDecimalOrNull(taxAmount)) return MALFORMED
  if (!isDecimalOrNull(tripShareCostAmount)) return MALFORMED

  const figures: TripValuationRevenueLineCostFigures = {
    costAmount,
    costBasis,
    legCostAmount,
    marginAmount,
    marginPercentage,
    taxAmount,
    timeBasis,
    tripShareCostAmount,
  }

  return isCoherent(figures) ? { figures, kind: 'present' } : MALFORMED
}
