/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 294: as etapas da parada que a API marca junto da baixa ou da chegada. */
export type StopEventStep = 'arrived' | 'departed'

export type FieldReportResponse = Readonly<{
  /** As etapas que a API marcou junto deste toque; vazio quando nada faltava. */
  recordedTogether: readonly StopEventStep[]
}>

function isStopEventStep(value: unknown): value is StopEventStep {
  return value === 'arrived' || value === 'departed'
}

/**
 * Lê o `data` da resposta de arrive/deliver/return. A API antiga não manda `recordedTogether`: vira
 * lista vazia, nunca erro — o toque já foi aceito e a resposta só enfeita a tela.
 */
export function parseFieldReportResponse(payload: unknown): FieldReportResponse | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const data = (payload as { readonly data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  const recordedTogether = Array.isArray(record.recordedTogether)
    ? record.recordedTogether.filter(isStopEventStep)
    : []
  return { recordedTogether }
}
