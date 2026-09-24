/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type {
  TripDeliveryProofKind,
  TripDeliveryProofPunctuality,
  TripDocumentSeparationStatus,
  TripStatus,
  TripStopEventKind,
  TripStopOccurrenceKind,
} from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import type { FieldAuthorship, FieldTripTarget } from './field-trip-target.types.js'
import type { TripOccurrence } from './register-trip-occurrence.use-case.js'
import type { TripFieldOfficeAuditInput } from './trip-field-office-audit.port.js'

/** A posição que o aparelho conseguiu ler. `null` inteiro quando ele não conseguiu ler nenhuma. */
export type ReportedLocation = {
  readonly accuracyMeters: string | null
  readonly capturedAt: string
  readonly latitude: string
  readonly longitude: string
}

export type DriverStopReference = {
  readonly arrivedAt: Date | null
  /** Spec 109 D3: o que o plano dizia para **esta** parada — é dela que o atraso é medido. */
  readonly estimatedArrivalAt: Date | null
  readonly tripId: string
  readonly tripStatus: string
}

export type DriverDocumentReference = {
  readonly separationStatus: TripDocumentSeparationStatus
  readonly stopId: string | null
  readonly tripId: string
  readonly tripStatus: TripStatus
}

export type FieldReportClaim = {
  /**
   * ADR-0067 §5 (emenda 2026-09-18): quem reservou a chave. A mesma chave usada por outro ator é
   * erro do cliente, tanto quanto usá-la numa operação diferente — dois usuários do escritório não
   * compartilham confirmação um do outro.
   */
  readonly actorUserId: string
  /** `true` quando esta transação é a primeira a usar a chave — e portanto quem executa o efeito. */
  readonly claimed: boolean
  readonly operation: string
  readonly resultId: string | null
}

/**
 * Tudo aqui roda **dentro de uma transação**. É o que faz a idempotência valer: a reserva da chave é
 * um `insert` com unique, e o reenvio concorrente fica bloqueado nele até o primeiro confirmar — em
 * vez de os dois lerem "não existe" e executarem o efeito duas vezes.
 */
export type DriverFieldReportTransactionPort = {
  claim(input: {
    readonly actorUserId: string
    /** ADR-0067 §2: gravada mesmo na reserva da chave — a linha de idempotência também é registro de campo. */
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<FieldReportClaim>
  settle(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly resultId: string
  }): Promise<void>

  /**
   * Spec 156 T3: o nome ficou do tempo em que só o motorista chegava aqui. O alvo diz como achar a
   * viagem — pelo motorista logado ou pela viagem que o escritório resolveu.
   */
  findStopForDriver(input: {
    readonly companyId: string
    readonly stopId: string
    readonly target: FieldTripTarget
  }): Promise<DriverStopReference | null>
  findDocumentForDriver(input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  }): Promise<DriverDocumentReference | null>
  /**
   * Spec 156 T6, ADR-0067 §3: o início da janela da hora informada — o despacho congelado em
   * `trip_dispatch_snapshots`, e, sem ele (viagem legada), a criação da viagem (T15 M9). `null` só
   * quando a viagem não existe na empresa.
   */
  findInformedTimeWindowStart(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<Date | null>

  markStopArrived(input: {
    readonly at: Date
    readonly companyId: string
    readonly stopId: string
  }): Promise<void>
  /**
   * Spec 109 D3: desloca as paradas que **ainda não aconteceram** pelo atraso desta chegada.
   *
   * ⚠️ O recorte é `arrived_at is null`, não "sequência maior": o motorista pula parada e volta, e
   * pela sequência a parada saltada ficaria eternamente com a hora de antes do atraso.
   */
  shiftPendingStops(input: {
    readonly at: Date
    readonly companyId: string
    readonly shiftMilliseconds: number
    readonly tripId: string
  }): Promise<void>
  markTripInTransit(input: {
    readonly actorUserId: string
    /** ADR-0068 §"Consequências": o `trip_status_events` da chegada usa o mesmo `now` do `trip_stop_event`. */
    readonly at: Date
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean>
  markDocumentDelivered(input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
  }): Promise<void>
  markDocumentReturned(input: {
    readonly at: Date
    readonly companyId: string
    readonly documentId: string
    readonly reason: string
  }): Promise<void>
  /**
   * Fecha a parada quando nenhuma nota dela está mais pendente. Devolve se fechou. `completed_at` é
   * o maior `delivered_at`/`returned_at` das notas da parada (spec 156 T15 M3), com `at` como
   * reserva para nota antiga sem a hora gravada.
   */
  completeStopIfSettled(input: {
    readonly at: Date
    readonly companyId: string
    /**
     * Spec 156 T15 C1: o escritório dá baixa sem chegada registrada — o motorista não tocou em
     * "cheguei". A chegada vira a menor hora de entrega/devolução da parada, só se estiver vazia.
     */
    readonly fillMissingArrival: boolean
    readonly stopId: string
  }): Promise<boolean>
  /** Fecha a viagem quando a última parada fechou (spec 056 D1). Devolve se fechou. */
  completeTripIfSettled(input: {
    readonly actorUserId: string
    /** ADR-0068 §"Consequências": o `trip_status_events` da entrega usa o mesmo `now` do caso de uso. */
    readonly at: Date
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean>

  /**
   * ADR-0058 §3, spec 156 T15 M4: a nota que fecha adianta a viagem de quem esqueceu de tocar em
   * "iniciar trajeto" (`deriveTripStatus` → `on_delivery_route`), com o evento em
   * `trip_status_events`. Nunca conclui a viagem — quem conclui é `completeTripIfSettled`, pelas
   * paradas. Devolve se mudou.
   */
  advanceTripFromSettledDocuments(input: {
    readonly actorUserId: string
    readonly at: Date
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean>

  /** Spec 156 T15 M11: a trilha do escritório na mesma transação da ação (`audit_logs`). */
  recordOfficeAudit(input: TripFieldOfficeAuditInput): Promise<void>

  recordEvent(input: {
    readonly actorUserId: string
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly documentId: string | null
    readonly kind: TripStopEventKind
    readonly location: ReportedLocation | null
    /**
     * ADR-0067 §3: quando aconteceu. Ausente para o motorista (a coluna cai no `defaultNow()`, e as
     * duas horas coincidem); a baixa retroativa do escritório manda a hora informada.
     */
    readonly occurredAt?: Date
    /** ADR-0067 §3: quando o registro foi gravado. Ausente cai no `defaultNow()`. */
    readonly recordedAt?: Date
    /**
     * Spec 159 T11: o cadastro do motorista que reportou pelo app ou pelo WhatsApp — a nota lê
     * daqui, não do vínculo atual da conta. Ausente no escritório (ele usa `onBehalfOfDriverId`).
     */
    readonly reportedByDriverId?: string
    readonly stopId: string
  }): Promise<{ readonly id: string }>
  /**
   * Spec 156 T6: o comprovante da entrega **na mesma transação** da entrega — ao contrário do
   * motorista, cujo anexo é ação separada (`DeliveryProofPort.saveProof`, própria transação). Não
   * reabre o objeto no bucket: quem chama já subiu os bytes antes de entrar na transação.
   */
  saveDeliveryProofWithinTransaction(input: {
    /** ADR-0070 §4: `null` no canal `office` — spec 159 T5, o canhoto não classifica pontualidade. */
    readonly accuracyMeters: string | null
    readonly actorUserId: string
    readonly attachmentKey: string
    readonly authorship: FieldAuthorship
    readonly capturedAt: Date | null
    readonly companyId: string
    readonly eventId: string
    readonly id: string
    readonly kind: TripDeliveryProofKind
    readonly latitude: string | null
    readonly longitude: string | null
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    /** ADR-0070 §6: o canal `office` não entra na nota — grava sempre `not_required`. */
    readonly punctuality: TripDeliveryProofPunctuality
    readonly receiverDocumentEnvelope: SecretEnvelopeV1 | null
    readonly receiverDocumentMasked: string
    readonly receiverName: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<{ readonly id: string }>
  /** Reaproveita a leitura de dedupe do anexo (spec 082) dentro da mesma transação da entrega. */
  findProofIdByAttachmentKeyWithinTransaction(input: {
    readonly attachmentKey: string
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<string | null>
  /**
   * Spec 184 (RF4, D3): quantas fotos daquele `kind` o evento já tem — a foto de carga soma até o
   * teto, dentro da mesma transação que vai gravar a próxima. **Trava a linha do evento** antes de
   * contar: sem isso, dois envios simultâneos leem a mesma contagem e furam o teto juntos.
   */
  countProofsForEvent(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<number>
  /**
   * ADR-0070 §1, spec 159 RF1/RF2: se o evento de entrega já tem comprovante daquele tipo — usada
   * para `proofPending` na resposta e no snapshot compartilharem a mesma leitura.
   */
  findProofExistsForEvent(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<boolean>
  /**
   * Spec 156 T15 M2: o evento `delivered` mais recente da nota, alcançável pelo alvo, com a viagem
   * já despachada e a nota não liberada — o mesmo recorte de `DeliveryProofPort.findDeliveryEventId`,
   * dentro da transação do `field-proof`.
   */
  findDeliveryEventForProof(input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  }): Promise<{ readonly id: string } | null>
  /**
   * Spec 156 T15 M1: o comprovante já gravado daquele evento e tipo — o canal decide se o escritório
   * pode substituí-lo, e o objeto vai para a auditoria da substituição.
   */
  findProofForEvent(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<{ readonly channel: TripFieldChannel; readonly objectId: string } | null>
  recordOccurrence(input: {
    readonly actorUserId: string
    readonly attachmentObjectId: string | null
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly description: string
    /** ADR-0057 §3: `null` é não aferida — parada sem coordenada, ou posição que nunca fixou. */
    readonly distanceMeters: number | null
    readonly documentId: string | null
    readonly kind: TripStopOccurrenceKind
    readonly stopId: string
  }): Promise<{ readonly id: string }>
  findEventById(input: {
    readonly companyId: string
    readonly eventId: string
  }): Promise<{ readonly id: string } | null>
  /**
   * Spec 159 T11: o último evento daquele tipo da nota — o que o no-op idempotente devolve em vez de
   * gravar outro. `null` quando a nota foi resolvida sem evento (dado legado).
   */
  findLatestEventForDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly kind: TripStopEventKind
  }): Promise<{ readonly id: string } | null>
  findOccurrenceById(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<{ readonly id: string } | null>
  /**
   * Spec 179 T200: a ocorrência de **nota** (`trip_document_occurrences`) que o motorista registra
   * — espaço de id diferente de `recordOccurrence`/`findOccurrenceById`, que são a ocorrência de
   * **parada** (`trip_stop_occurrences`). `null` só quando a nota não é desta viagem nesta empresa
   * (a mesma condição de corrida que `saveTripOccurrence` já defende).
   */
  saveDocumentOccurrence(input: {
    readonly actorUserId: string
    readonly attachmentObjectId: string | null
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly stage: 'delivery'
    readonly tripId: string
    readonly typeName: string
  }): Promise<null | TripOccurrence>
  /** O reenvio da fila offline: a ocorrência de nota já gravada por esta chave. */
  findDocumentOccurrenceById(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | TripOccurrence>
}

export type DriverFieldReportUnitOfWork = {
  execute<TResult>(
    operation: (transaction: DriverFieldReportTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
