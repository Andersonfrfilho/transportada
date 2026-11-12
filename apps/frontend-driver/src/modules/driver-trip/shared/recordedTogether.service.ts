/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { StopEventStep } from './fieldReportResponse.service'

/** O que o motorista pede na parada: a chegada só marca a saída junto; a baixa marca as duas. */
export type RequestedStopEvent = 'arrived' | 'delivered' | 'returned'

/**
 * Spec 294 RF3: as etapas que a API marcaria junto agora. Espelha `resolveStopEventSequence` da API
 * (a API decide; isto só avisa antes do toque). Parada concluída não marca nada, e a API antiga
 * (sem rastreio de "a caminho") não sabe da saída: só a chegada entra no aviso.
 */
export function listStepsToRecordTogether(input: {
  readonly isArrived: boolean
  readonly isCompleted: boolean
  readonly isEnRoute: boolean
  readonly isLegacyEnRouteTracking?: boolean
  readonly requestedEvent: RequestedStopEvent
}): readonly StopEventStep[] {
  const { isArrived, isCompleted, isEnRoute, requestedEvent } = input
  if (isCompleted) return []
  const steps: StopEventStep[] = []
  if (!isEnRoute && !isArrived && input.isLegacyEnRouteTracking !== true) steps.push('departed')
  if (requestedEvent !== 'arrived' && !isArrived) steps.push('arrived')
  return steps
}

export type RecordedTogetherTextKey = 'arrived' | 'departed' | 'departedAndArrived'

/** A chave de texto da frase: "Cheguei", "Iniciar rota" ou as duas; `undefined` sem etapa junto. */
export function toRecordedTogetherTextKey(
  steps: readonly StopEventStep[],
): RecordedTogetherTextKey | undefined {
  const hasDeparted = steps.includes('departed')
  const hasArrived = steps.includes('arrived')
  if (hasDeparted && hasArrived) return 'departedAndArrived'
  if (hasArrived) return 'arrived'
  return hasDeparted ? 'departed' : undefined
}
