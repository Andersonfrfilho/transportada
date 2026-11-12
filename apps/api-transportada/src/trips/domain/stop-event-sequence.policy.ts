/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (RF1–RF4, RF7): a ordem da parada é saída, chegada, baixa. Quem pede uma etapa à frente marca
 * junto as anteriores que faltam; o escritório corrige depois do fato e nunca marca junto.
 */
import type { TripFieldChannel } from './trip-field-channel.constant.js'

export type StopEventStep = 'arrived' | 'departed'

export type StopEventSequenceInput = {
  readonly authorship: TripFieldChannel
  readonly requestedEvent: 'arrived' | 'delivered' | 'departed' | 'returned'
  readonly stop: {
    readonly arrivedAt: Date | string | null
    readonly completedAt: Date | string | null
    readonly enRouteSince: Date | string | null
  }
}

export function resolveStopEventSequence(input: StopEventSequenceInput): readonly StopEventStep[] {
  const { authorship, requestedEvent, stop } = input
  if (authorship === 'office') return []
  if (stop.completedAt !== null) return []
  if (requestedEvent === 'departed') return []

  const isArrived = stop.arrivedAt !== null
  const isEnRoute = stop.enRouteSince !== null
  const steps: StopEventStep[] = []

  if (!isEnRoute && !isArrived) steps.push('departed')
  if (requestedEvent !== 'arrived' && !isArrived) steps.push('arrived')

  return steps
}
