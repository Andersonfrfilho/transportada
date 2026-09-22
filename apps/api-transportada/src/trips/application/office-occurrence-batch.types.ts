/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (D7, aceite 10): o contrato do lote de ocorrências do escritório — as portas, o
 * pedido, a resposta e o que corre entre os passos do lote.
 */
import type { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type { DriverFieldReportTransactionPort } from './driver-field-report.port.js'
import type {
  FieldAuthorship,
  FieldTripTarget,
  ResolvedTripFieldTarget,
} from './field-trip-target.types.js'
import type {
  OccurrenceNotifierPort,
  OccurrenceTypeRecord,
  TripOccurrence,
} from './register-trip-occurrence.use-case.js'
import type { RemovableObjectStoragePort } from './stored-object-cleanup.service.js'
import type { OfficeAuditRequest } from './trip-field-office-audit.port.js'

export type OfficeOccurrenceBatchTransactionPort = Pick<
  DriverFieldReportTransactionPort,
  'claim' | 'recordOfficeAudit' | 'settle'
> & {
  findOccurrenceType(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<null | OccurrenceTypeRecord>
  /** As notas pedidas que estão na viagem do alvo, vivas, com a viagem despachada. */
  findReachableDocumentIds(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly target: FieldTripTarget
  }): Promise<readonly string[]>
  saveDocumentOccurrence(input: {
    readonly actorUserId: string
    readonly attachmentObjectId?: string | null
    readonly authorship: FieldAuthorship
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly stage: typeof TRIP_OCCURRENCE_STAGE.delivery
    readonly tripId: string
    readonly typeName: string
  }): Promise<null | TripOccurrence>
  /** O `recall` da reserva por nota: a ocorrência que ela já gravou. */
  findDocumentOccurrence(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | { readonly documentId: string; readonly id: string }>
  /** T7b (D7 §3.5): grava o objeto único da foto do lote — chamado no máximo uma vez por lote. */
  saveAttachmentObject(input: {
    readonly companyId: string
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<void>
}

export type OfficeOccurrenceBatchUnitOfWork = {
  execute<TResult>(
    operation: (transaction: OfficeOccurrenceBatchTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export type OccurrenceLabels = { readonly documentLabel: string; readonly stopLabel: string }

export type OfficeOccurrenceNotificationsPort = {
  /** Spec 156 T15 M10: a falha depois do commit vira aviso no log — só ids opacos, nunca rótulo. */
  readonly logger: { warn(event: string, meta?: Record<string, unknown>): void }
  readonly notifier: OccurrenceNotifierPort | undefined
  /** Spec 156 T15 M10: os rótulos do lote numa leitura só. Nota sem linha fica fora do mapa. */
  readLabels(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly tripId: string
  }): Promise<ReadonlyMap<string, OccurrenceLabels>>
}

/** T7b, D9: mesmo teto e mesmos tipos aceitos do canhoto do escritório (`delivery-proof.policy.ts`). */
export type OfficeOccurrenceAttachmentUpload = {
  readonly bytes: Uint8Array
  readonly mimeType: string
}

export type OfficeOccurrenceAttachment = {
  readonly newObjectId: () => string
  readonly storage: RemovableObjectStoragePort
  readonly upload: OfficeOccurrenceAttachmentUpload | null
}

export type RegisterOfficeDocumentOccurrencesParams = {
  readonly actorUserId: string
  /** Ausente/`upload: null` é o lote sem foto — o caso comum, e o único que a T7 já cobria. */
  readonly attachment?: OfficeOccurrenceAttachment
  readonly companyId: string
  readonly documentIds: readonly string[]
  readonly idempotencyKey: string
  readonly note: string
  readonly notifications: OfficeOccurrenceNotificationsPort
  readonly occurrenceTypeId: string
  /** Spec 156 T15 M11: a trilha do lote nasce na transação do lote; o reenvio não grava de novo. */
  readonly officeAudit: OfficeAuditRequest
  readonly target: ResolvedTripFieldTarget
  readonly unitOfWork: OfficeOccurrenceBatchUnitOfWork
}

export type OfficeOccurrenceBatchItem = {
  readonly documentId: string
  readonly id: string
}

export type RegisterOfficeDocumentOccurrencesResult = {
  readonly items: readonly OfficeOccurrenceBatchItem[]
}

export type BatchItemOutcome = OfficeOccurrenceBatchItem & {
  /** Ressalva A3: acesa só dentro do `perform` da nota — o `recall` nunca a acende. */
  readonly createdNow: boolean
}

export type BatchContext = RegisterOfficeDocumentOccurrencesParams & {
  readonly authorship: FieldAuthorship
  /** A storage rastreada por `runWithStoredObjectCleanup` — o objeto some se o lote desfizer. */
  readonly storage: RemovableObjectStoragePort | undefined
  readonly transaction: OfficeOccurrenceBatchTransactionPort
}

export type BatchOutcome = {
  readonly id: string
  readonly items: readonly BatchItemOutcome[]
  readonly occurrenceType: OccurrenceTypeRecord | null
}
