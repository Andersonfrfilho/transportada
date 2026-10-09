/* Copyright (c) 2026 Ada Technology. MIT License. */
import { compareScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type {
  CapacityUnknownReason,
  TripAmounts,
  TripListVolumeOccupancy,
  TripListWeightOccupancy,
  TripOccupancySummary,
} from './trip.types'

const PERCENT_SCALE = 100
const ZERO_AMOUNT = '0'

export type OccupancyMark = 'estimated' | 'partial' | null

/** O percentual do painel de detalhe (`TripCargoPanel`): razão da API × 100, arredondado. */
export function toOccupancyPercent(ratio: string): number {
  return Math.round(Number.parseFloat(ratio) * PERCENT_SCALE)
}

/**
 * ⚠️ A marca nunca sai do lado do número: estimativa lida como declarada, ou soma que ignorou notas
 * sem medida, faz o operador decidir carga com um número mais firme do que ele é.
 */
export function resolveOccupancyMark(input: {
  readonly documentsWithoutMeasure: number
  readonly source: TripListVolumeOccupancy['source'] | TripListWeightOccupancy['source']
}): OccupancyMark {
  if (input.source === 'estimated') return 'estimated'
  if (input.source === 'partial' || input.documentsWithoutMeasure > 0) return 'partial'

  return null
}

export type OccupancyMeasureView =
  | Readonly<{ kind: 'bar'; mark: OccupancyMark; percent: number; ratio: number }>
  | Readonly<{ kind: 'missing'; reason: CapacityUnknownReason | null }>

export type OccupancyView =
  | Readonly<{ kind: 'noVehicle' }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'measures'; volume: OccupancyMeasureView; weight: OccupancyMeasureView }>

function weightMeasure(weight: TripListWeightOccupancy | null): OccupancyMeasureView {
  if (weight === null || weight.payloadRatio === null) return { kind: 'missing', reason: null }

  return {
    kind: 'bar',
    mark: resolveOccupancyMark({
      documentsWithoutMeasure: weight.documentsWithoutWeight,
      source: weight.source,
    }),
    percent: toOccupancyPercent(weight.payloadRatio),
    ratio: Number.parseFloat(weight.payloadRatio),
  }
}

function volumeMeasure(
  volume: TripListVolumeOccupancy | null,
  reason: CapacityUnknownReason | null,
): OccupancyMeasureView {
  if (volume === null) return { kind: 'missing', reason }

  return {
    kind: 'bar',
    mark: resolveOccupancyMark({
      documentsWithoutMeasure: volume.documentsWithoutVolume,
      source: volume.source,
    }),
    percent: toOccupancyPercent(volume.occupancyRatio),
    ratio: Number.parseFloat(volume.occupancyRatio),
  }
}

/**
 * ⚠️ Ausência é dita, **nunca 0% nem 100%**: sem veículo, sem teto ou sem cubagem não há porcentagem,
 * e um número inventado faz alguém parar de carregar, ou continuar.
 */
export function resolveOccupancyView(input: {
  readonly hasVehicle: boolean
  readonly occupancy: TripOccupancySummary | null | undefined
}): OccupancyView {
  if (!input.hasVehicle) return { kind: 'noVehicle' }
  if (input.occupancy === null || input.occupancy === undefined) return { kind: 'unknown' }

  return {
    kind: 'measures',
    volume: volumeMeasure(input.occupancy.volume, input.occupancy.capacityUnknownReason),
    weight: weightMeasure(input.occupancy.weight),
  }
}

export type ResultMark = 'forecast' | 'noRule' | 'partial'

export type ResultView =
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{
      kind: 'result'
      cost: string | null
      isLoss: boolean
      margin: string | null
      marginPercentage: string | null
      marks: readonly ResultMark[]
    }>

/**
 * Sem os campos novos (API anterior, ou sem `trip.financials`) não há resultado a mostrar — "—", não
 * zero. A previsão e a lacuna vêm marcadas junto do número: lucro de receita estimada lido como
 * realizado é o erro que só aparece na conciliação do mês.
 */
export function resolveResultView(amounts: TripAmounts | null | undefined): ResultView {
  if (amounts === null || amounts === undefined) return { kind: 'unknown' }
  const cost = amounts.costTotal ?? null
  const margin = amounts.marginTotal ?? null
  if (cost === null && margin === null) return { kind: 'unknown' }

  const marks: ResultMark[] = []
  if (amounts.revenueSource === 'missing') marks.push('noRule')
  else if (amounts.revenueSource !== 'measured') marks.push('forecast')
  if (amounts.hasGaps === true) marks.push('partial')

  return {
    kind: 'result',
    cost,
    isLoss: margin !== null && compareScaledAmounts(margin, ZERO_AMOUNT) < 0,
    margin,
    marginPercentage: amounts.marginPercentage ?? null,
    marks,
  }
}
