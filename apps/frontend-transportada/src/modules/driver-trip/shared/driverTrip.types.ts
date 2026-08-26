/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve em `/me/trips/current` — o bundle não carrega código de lá. */
export type DriverTripDocument = Readonly<{
  accessKey: string
  deliveredAt: string | null
  grossWeight: string
  id: string
  number: string
  recipientName: string
  returnReason: string | null
  separationStatus: string
  series: string
  totalAmount: string
  volumeCount: string
}>

export type DriverTripStop = Readonly<{
  arrivedAt: string | null
  completedAt: string | null
  deliveryWindowEnd: string | null
  deliveryWindowStart: string | null
  documents: readonly DriverTripDocument[]
  id: string
  label: string
  latitude: string | null
  longitude: string | null
  sequence: number
}>

export type DriverTrip = Readonly<{
  id: string
  status: string
  stops: readonly DriverTripStop[]
  vehiclePlate: string
}>

export type DriverTripSnapshot = Readonly<{
  isRegisteredDriver: boolean
  trips: readonly DriverTrip[]
}>

/** ⚠️ Cópia por valor de `driver-return-reason.policy.ts`; a paridade é assertada por contrato. */
export const DRIVER_RETURN_REASONS = [
  'recipient_absent',
  'recipient_refused',
  'address_not_found',
  'damaged_goods',
  'establishment_closed',
] as const
export type DriverReturnReason = (typeof DRIVER_RETURN_REASONS)[number]

/** ⚠️ Cópia por valor de `TRIP_STOP_OCCURRENCE_KINDS`. */
export const DRIVER_OCCURRENCE_KINDS = [
  'unexpected_charge',
  'long_wait',
  'dock_closed',
  'appointment_required',
  'damaged_goods',
  'address_not_found',
  'customer_closed',
  'other',
] as const
export type DriverOccurrenceKind = (typeof DRIVER_OCCURRENCE_KINDS)[number]

export type DriverReportedLocation = Readonly<{
  accuracyMeters?: number
  capturedAt: string
  latitude: number
  longitude: number
}>

/**
 * O que o aparelho enfileira. Cada item carrega a **chave gerada no cliente**: é ela que o servidor
 * usa para não duplicar quando a fila drena (ADR-0045 §5).
 */
export type DriverFieldReport =
  | Readonly<{
      idempotencyKey: string
      kind: 'arrive'
      location: DriverReportedLocation | null
      stopId: string
    }>
  | Readonly<{
      documentId: string
      idempotencyKey: string
      kind: 'deliver'
      location: DriverReportedLocation | null
    }>
  | Readonly<{
      documentId: string
      idempotencyKey: string
      kind: 'return'
      location: DriverReportedLocation | null
      reason: DriverReturnReason
    }>
  | Readonly<{
      description: string
      documentId: string | null
      idempotencyKey: string
      kind: 'occurrence'
      occurrenceKind: DriverOccurrenceKind
      stopId: string
    }>
