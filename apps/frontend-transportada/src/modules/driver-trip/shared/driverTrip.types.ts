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
  /** Spec 157 RF1/RF2: foto obrigatória (`deliveryProof.photo === 'required'`) que ainda não chegou. */
  proofPending: boolean
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

/**
 * Spec 157 (T11, revisão): a foto pendente **na raiz** do snapshot — sai daqui mesmo sem viagem
 * ativa, porque a nota entregue pode ser de uma viagem já `completed`. É esta lista, não mais o
 * percurso por `trips`, que alimenta a tela "Fotos pendentes" e o contador do workspace.
 */
export type PendingProofDocument = Readonly<{
  deliveredAt: string | null
  deliveryProof: DriverDeliveryProofSettings | null
  documentId: string
  documentNumber: string
  documentSeries: string
  recipientName: string
  tripId: string
  tripStatus: string
}>

export type DriverTripSnapshot = Readonly<{
  isRegisteredDriver: boolean
  /** Spec 157 (T11): toda nota entregue com foto obrigatória ainda sem foto, de qualquer viagem. */
  pendingProofs: readonly PendingProofDocument[]
  /** Spec 157 RF2/RF9, ADR-0068 §5: a nota do próprio motorista — `null` sem histórico em 90 dias. */
  score: number | null
  trips: readonly DriverTrip[]
}>

/**
 * ⚠️ Cópia por valor de `ProofPunctuality` (`delivery-proof-punctuality.policy.ts`, ADR-0068 §3-4).
 * `not_required` nunca aparece na resposta de `/proof` para foto obrigatória; ela existe do lado da
 * API para nota sem exigência — o app não recebe esse valor nesta rota.
 */
export const PROOF_PUNCTUALITY_VALUES = [
  'not_required',
  'on_time',
  'late',
  'away',
  'late_and_away',
] as const
export type ProofPunctuality = (typeof PROOF_PUNCTUALITY_VALUES)[number]

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
 * cadastro. O motorista só enxerga os de `delivery` ativos — o galpão não é dele —, e o filtro é
 * do servidor (spec 157): a rota `/me/trips/current/occurrence-types` devolve só `id` e `name`.
 */
export type DriverOccurrenceType = Readonly<{
  id: string
  name: string
}>

/**
 * Spec 157 (RF5): falha de rede/servidor e lista vazia de verdade são fatos diferentes — a
 * primeira é "não sabemos", a segunda é "a empresa não cadastrou". `loading` só existe do lado da
 * tela, antes da primeira resposta; o cliente HTTP nunca a devolve.
 */
export type DriverOccurrenceTypesResult =
  | Readonly<{ status: 'failed' }>
  | Readonly<{ status: 'loaded'; types: readonly DriverOccurrenceType[] }>

export type DriverOccurrenceTypesState =
  | Readonly<{ status: 'loading' }>
  | DriverOccurrenceTypesResult
