/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 (D7, D10–D13): a fila de revisão das notas que não couberam. A nota sai da viagem por
 * botão (D10), nunca sozinha; "sem medida" e o corte por prazo não soltam nada (D11). Sem I/O.
 */
import { UNPLACED_REASONS, type UnplacedBox } from '@adatechnology/cargo-placement'

import type {
  TripDocumentReviewReason,
  TripDocumentReviewStatus,
} from '../../database/trip-document-review.schema.js'
import {
  TripCargoLayoutOutdatedError,
  TripDocumentReviewTransitionError,
} from './trip-document-review.error.js'

export {
  SWAPPED_OUT_REASON,
  TRIP_DOCUMENT_REVIEW_REASONS,
  TRIP_DOCUMENT_REVIEW_STATUSES,
  type TripDocumentReviewReason,
  type TripDocumentReviewStatus,
} from '../../database/trip-document-review.schema.js'

/** O que prende a nota na viagem: o corte por prazo (planta incompleta) e a caixa sem medida (D11). */
const KEEPING_REASONS = new Set<string>(['time_budget', 'notMeasured'])

export type TripDocumentReviewTransition = 'apply' | 'unchanged'

/** Só `pending` sai, e sai uma vez; repetir a mesma saída é idempotente. */
export function checkTripDocumentReviewTransition(params: {
  readonly from: TripDocumentReviewStatus
  readonly to: TripDocumentReviewStatus
}): TripDocumentReviewTransition {
  if (params.to === 'pending') throw new TripDocumentReviewTransitionError(params)
  if (params.from === params.to) return 'unchanged'
  if (params.from === 'pending') return 'apply'
  throw new TripDocumentReviewTransitionError(params)
}

export type ReleasableDocument = {
  readonly boxCount: number
  readonly documentId: string
  readonly reason: TripDocumentReviewReason
}

export type KeptDocument = {
  readonly documentId: string
  readonly reason: 'notMeasured' | 'time_budget'
}

type DocumentTally = Map<string, Map<string, number>>

function tallyByDocument(unplaced: readonly UnplacedBox[]): DocumentTally {
  const tally: DocumentTally = new Map()
  for (const box of unplaced) {
    if (box.documentId === undefined || box.documentId === null) continue
    const reasons = tally.get(box.documentId) ?? new Map<string, number>()
    reasons.set(box.reason, (reasons.get(box.reason) ?? 0) + box.count)
    tally.set(box.documentId, reasons)
  }
  return tally
}

/** O motivo que mais caixas deixou de fora; empate pela ordem do pacote. */
function dominantReason(reasons: ReadonlyMap<string, number>): TripDocumentReviewReason {
  const ranked = UNPLACED_REASONS.filter((reason) => reasons.has(reason)).sort(
    (left, right) => (reasons.get(right) ?? 0) - (reasons.get(left) ?? 0),
  )
  const [first] = ranked
  if (first === undefined) throw new Error('TRIP_DOCUMENT_REVIEW_REASON_MISSING')
  return first
}

function keepingReason(reasons: ReadonlyMap<string, number>): KeptDocument['reason'] | null {
  if (reasons.has('time_budget')) return 'time_budget'
  if (reasons.has('notMeasured')) return 'notMeasured'
  return null
}

/**
 * D7: a nota inteira sai (1 nota = 1 caminhão). Linha sem nota é planta antiga: não solta nada.
 * Nota com qualquer caixa cortada pelo prazo ou sem medida fica na viagem, com o aviso.
 */
export function selectReleasableDocuments(unplaced: readonly UnplacedBox[]): {
  readonly kept: readonly KeptDocument[]
  readonly released: readonly ReleasableDocument[]
} {
  const kept: KeptDocument[] = []
  const released: ReleasableDocument[] = []
  for (const [documentId, reasons] of tallyByDocument(unplaced)) {
    const keeping = keepingReason(reasons)
    if (keeping !== null) {
      kept.push({ documentId, reason: keeping })
      continue
    }
    const boxCount = [...reasons.values()].reduce((total, count) => total + count, 0)
    released.push({ boxCount, documentId, reason: dominantReason(reasons) })
  }
  return { kept, released }
}

export function isKeepingUnplacedReason(reason: string): boolean {
  return KEEPING_REASONS.has(reason)
}

/** D10: a planta só decide sobre a carga de agora — outro hash é outra carga. */
export function assertCargoLayoutCurrent(params: {
  readonly currentInputHash: string | null
  readonly layoutInputHash: string
}): void {
  if (params.currentInputHash !== params.layoutInputHash) throw new TripCargoLayoutOutdatedError()
}

/** Duas mudanças opostas (A→B e B→A) travando na mesma ordem não formam ciclo: sem 40P01. */
export function orderTripLocks(tripIds: readonly string[]): readonly string[] {
  return [...new Set(tripIds)].sort()
}

export type SwapCandidate = {
  readonly nfeDocumentId: string
  readonly nfeNumber: string | null
  readonly tripDocumentId: string
  readonly volumeM3: number | null
  readonly weightKilograms: number | null
}

export type SwapSuggestion = SwapCandidate & {
  /** Negativo: o caminhão usa menos espaço com a troca. */
  readonly volumeDeltaPercent: number | null
  /** Negativo: o caminhão fica mais leve com a troca. */
  readonly weightDeltaPercent: number | null
}

type SwapLoad = {
  readonly volumeM3: number | null
  readonly weightKilograms: number | null
}

function deltaPercent(params: {
  readonly incoming: number | null
  readonly outgoing: number | null
  readonly total: number | null
}): number | null {
  const { incoming, outgoing, total } = params
  if (incoming === null || outgoing === null || total === null || total <= 0) return null
  return Math.round(((incoming - outgoing) / total) * 1000) / 10
}

/** Primeiro quem libera espaço bastante (a mais parecida antes); depois as menores; sem medida por último. */
function compareCandidates(incomingVolume: number | null) {
  return (left: SwapCandidate, right: SwapCandidate): number => {
    if (left.volumeM3 === null || right.volumeM3 === null) {
      return Number(left.volumeM3 === null) - Number(right.volumeM3 === null)
    }
    const needed = incomingVolume ?? 0
    const leftFits = left.volumeM3 >= needed
    const rightFits = right.volumeM3 >= needed
    if (leftFits !== rightFits) return leftFits ? -1 : 1
    return leftFits ? left.volumeM3 - right.volumeM3 : right.volumeM3 - left.volumeM3
  }
}

/** D10: peso da NF-e e volume das caixas, em porcentagem da carga atual do caminhão. */
export function buildSwapSuggestions(params: {
  readonly candidates: readonly SwapCandidate[]
  readonly incoming: SwapLoad
  readonly truck: SwapLoad
}): readonly SwapSuggestion[] {
  const { incoming, truck } = params
  return [...params.candidates].sort(compareCandidates(incoming.volumeM3)).map((candidate) => ({
    ...candidate,
    volumeDeltaPercent: deltaPercent({
      incoming: incoming.volumeM3,
      outgoing: candidate.volumeM3,
      total: truck.volumeM3,
    }),
    weightDeltaPercent: deltaPercent({
      incoming: incoming.weightKilograms,
      outgoing: candidate.weightKilograms,
      total: truck.weightKilograms,
    }),
  }))
}
