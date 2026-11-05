/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF25/RF27: a tripulação segue a ordem da parada. Etapa fora dela só é gravada com a confirmação
 * explícita; o escritório corrige depois do fato e nunca é perguntado.
 */
import { findNextPendingStop } from './driver-stop-resolution.policy.js'
import type { WhatsAppStopCandidate } from './driver-stop-resolution.policy.js'
import type { TripFieldChannel } from './trip-field-channel.constant.js'

export type StopOrderViolation = {
  readonly currentSequence: number | null
  readonly currentStopId: string | null
  readonly nextSequence: number | null
  readonly nextStopId: string | null
  readonly requestedSequence: number
  readonly requestedStopId: string
}

export type StopOrderCheckInput = {
  readonly authorship: TripFieldChannel
  readonly requestedEvent: 'arrived' | 'delivered' | 'departed' | 'returned'
  readonly requestedStopId: string
  readonly stops: readonly WhatsAppStopCandidate[]
}

function isInProgress(stop: WhatsAppStopCandidate): boolean {
  return stop.completedAt === null && (stop.enRouteSince !== null || stop.arrivedAt !== null)
}

/** A parada em andamento: a que está a caminho vence a que só chegou e ainda não fechou. */
function findCurrentStop(
  stops: readonly WhatsAppStopCandidate[],
): WhatsAppStopCandidate | undefined {
  return (
    stops.find((stop) => stop.arrivedAt === null && isInProgress(stop)) ?? stops.find(isInProgress)
  )
}

export function resolveStopOrderViolation(input: StopOrderCheckInput): StopOrderViolation | null {
  const { authorship, requestedEvent, requestedStopId, stops } = input
  if (authorship === 'office') return null
  const requested = stops.find((stop) => stop.id === requestedStopId)
  if (requested === undefined || requested.completedAt !== null) return null
  if (isInProgress(requested)) return null

  const current = findCurrentStop(stops)
  const next = findNextPendingStop(stops)
  const isAwayFromCurrent = current !== undefined
  const isDepartureAwayFromNext =
    requestedEvent === 'departed' &&
    current === undefined &&
    next !== undefined &&
    next.id !== requested.id
  if (!isAwayFromCurrent && !isDepartureAwayFromNext) return null

  return {
    currentSequence: current?.sequence ?? null,
    currentStopId: current?.id ?? null,
    nextSequence: next?.sequence ?? null,
    nextStopId: next?.id ?? null,
    requestedSequence: requested.sequence,
    requestedStopId: requested.id,
  }
}
