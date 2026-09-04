/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve em `/me/trips/current` — o bundle não carrega código de lá. */
export type DriverTripDocument = Readonly<{
  accessKey: string
  deliveredAt: string | null
  /**
   * Spec 082 (revisão): a configuração do comprovante é do **documento** — a exceção por CNPJ do
   * destinatário muda nota a nota. `null` quando o snapshot ainda não traz o campo — o app cai no
   * `deliveryProof` da parada e, na ausência dos dois, no padrão.
   */
  deliveryProof: DriverDeliveryProofSettings | null
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

/**
 * Spec 060 D3: a hora marcada e o protocolo. O porteiro pede o número, e um agendamento que o
 * sistema conhece e o motorista não é um agendamento que não existe.
 */
export type DriverStopSchedule = Readonly<{
  protocol: string
  scheduledAt: string | null
  status: string
}>

/** Spec 082 D4: o painel decide o que o comprovante colhe — por empresa, com exceção por CNPJ. */
export type ProofFieldRequirement = 'off' | 'optional' | 'required'

export type DriverDeliveryProofSettings = Readonly<{
  photo: ProofFieldRequirement
  receiverDocument: ProofFieldRequirement
  receiverName: ProofFieldRequirement
  signature: ProofFieldRequirement
}>

export type DriverTripStop = Readonly<{
  arrivedAt: string | null
  completedAt: string | null
  /** `null` quando o snapshot ainda não traz configuração — o app aplica o padrão. */
  deliveryProof: DriverDeliveryProofSettings | null
  deliveryWindowEnd: string | null
  deliveryWindowStart: string | null
  documents: readonly DriverTripDocument[]
  id: string
  label: string
  latitude: string | null
  longitude: string | null
  /** `null` quando a parada não exige agendamento — o caso da maioria. */
  schedule: DriverStopSchedule | null
  sequence: number
}>

/** `null` até o MDF-e autorizar — e nesse intervalo o que o motorista tem na mão é o romaneio. */
export type DriverTripManifest = Readonly<{
  accessKey: string
  authorizedAt: string | null
  id: string
  protocol: string
}>

export type DriverTrip = Readonly<{
  id: string
  manifest: DriverTripManifest | null
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

/**
 * ⚠️ Cópia por valor de `TRIP_STOP_OCCURRENCE_KINDS`.
 *
 * **Só o que é da parada.** Três valores saíram em 2026-09-03 — `damaged_goods` e
 * `address_not_found` são da nota e já são motivo de devolução; `customer_closed` era
 * `establishment_closed` com outro nome. Eram duas portas para o mesmo fato na mesma tela.
 */
export const DRIVER_OCCURRENCE_KINDS = [
  'unexpected_charge',
  'long_wait',
  'dock_closed',
  'appointment_required',
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

/**
 * Spec 079: o tipo de ocorrência que a empresa cadastrou, como o motorista o vê.
 *
 * ⚠️ A lista **vem do servidor**: ela deixou de ser cópia por valor quando os tipos viraram
 * cadastro. O motorista só enxerga os de `delivery` ativos — o galpão não é dele.
 */
export type DriverOccurrenceType = Readonly<{
  active: boolean
  id: string
  name: string
  stage: 'delivery' | 'separation'
}>

/** O que a tela dele oferece: rua, ativo, e nada mais. */
export function driverSelectableOccurrenceTypes(
  types: readonly DriverOccurrenceType[],
): readonly DriverOccurrenceType[] {
  return types.filter((type) => type.active && type.stage === 'delivery')
}
