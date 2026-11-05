/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 294: as etapas da parada que a API marca junto da baixa ou da chegada. */
export type StopEventStep = 'arrived' | 'departed'

export type AddressCorrectionOutcome = 'applied' | 'failed' | 'ignored' | 'suggested'

/** Spec 294 RF8/RF11: a próxima parada pendente, oferecida quando a baixa fecha a parada. */
export type NextStopOffer = Readonly<{
  address: string
  documentNumbers: readonly string[]
  id: string
  isAddressReliable: boolean
  recipientName: string
  sequence: number
  totalStops: number
}>

export type FieldReportResponse = Readonly<{
  /** Spec 294 RF14: o que a chegada com ponto fez pelo endereço; ausente sem ponto e na API antiga. */
  addressCorrection?: AddressCorrectionOutcome
  /** Spec 294 RF8: só quando a baixa fechou a parada e a viagem segue. */
  nextStop?: NextStopOffer
  /** As etapas que a API marcou junto deste toque; vazio quando nada faltava. */
  recordedTogether: readonly StopEventStep[]
}>

function isStopEventStep(value: unknown): value is StopEventStep {
  return value === 'arrived' || value === 'departed'
}

const ADDRESS_CORRECTION_OUTCOMES: readonly AddressCorrectionOutcome[] = [
  'applied',
  'failed',
  'ignored',
  'suggested',
]

function toNextStopOffer(value: unknown): NextStopOffer | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const stop = value as Record<string, unknown>
  if (
    typeof stop.id !== 'string' ||
    typeof stop.sequence !== 'number' ||
    typeof stop.totalStops !== 'number'
  ) {
    return undefined
  }
  const documents = Array.isArray(stop.documents) ? stop.documents : []
  return {
    address: typeof stop.address === 'string' ? stop.address : '',
    documentNumbers: documents.flatMap((document: unknown) =>
      typeof document === 'object' &&
      document !== null &&
      typeof (document as { number?: unknown }).number === 'string'
        ? [(document as { number: string }).number]
        : [],
    ),
    id: stop.id,
    // Sem o campo, não há o que avisar: só `false` explícito acende o aviso.
    isAddressReliable: stop.isAddressReliable !== false,
    recipientName: typeof stop.recipientName === 'string' ? stop.recipientName : '',
    sequence: stop.sequence,
    totalStops: stop.totalStops,
  }
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
  const addressCorrection = ADDRESS_CORRECTION_OUTCOMES.find(
    (outcome) => outcome === record.addressCorrection,
  )
  const nextStop = toNextStopOffer(record.nextStop)
  return {
    ...(addressCorrection === undefined ? {} : { addressCorrection }),
    ...(nextStop === undefined ? {} : { nextStop }),
    recordedTogether,
  }
}
