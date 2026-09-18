/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (D7, aceite 10): o escritório registra a mesma ocorrência de rua em várias notas
 * da viagem, em nome do motorista. **Uma transação para o lote**: ou as N ocorrências gravam, ou
 * nenhuma — é uma requisição e um fato só ("cliente ausente" nesta parada), e o reenvio da mesma
 * chave é a única saída que a tela precisa explicar. Um aviso por nota criada, depois do commit.
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import {
  buildOccurrenceBatchAttachmentObjectKey,
  buildOccurrenceBatchItemKey,
  buildOccurrenceBatchOperation,
  OFFICE_OCCURRENCE_BATCH_ITEM_OPERATION,
  sha256Hex,
} from '../domain/occurrence-batch.policy.js'
import { OccurrenceTypeNotFieldError, TripDocumentNotReachableError } from '../domain/trip.error.js'
import type { DriverFieldReportTransactionPort } from './driver-field-report.port.js'
import {
  deriveFieldAuthorship,
  toFieldTripTarget,
  type FieldAuthorship,
  type FieldTripTarget,
  type ResolvedTripFieldTarget,
} from './field-trip-target.types.js'
import {
  notifyOccurrence,
  type OccurrenceNotifierPort,
  type OccurrenceTypeRecord,
  type TripOccurrence,
} from './register-trip-occurrence.use-case.js'
import { assertOfficeUploadAccepted } from './office-delivery-proof.service.js'
import {
  runWithStoredObjectCleanup,
  type RemovableObjectStoragePort,
} from './stored-object-cleanup.service.js'
import type { OfficeAuditRequest } from './trip-field-office-audit.port.js'
import { withFieldReport } from './trip-field-report.port.js'

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

/** Rótulo ausente vira lacuna no template: melhor aviso com buraco do que nenhum aviso. */
const EMPTY_OCCURRENCE_LABELS: OccurrenceLabels = { documentLabel: '', stopLabel: '' }

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

type BatchItemOutcome = OfficeOccurrenceBatchItem & {
  /** Ressalva A3: acesa só dentro do `perform` da nota — o `recall` nunca a acende. */
  readonly createdNow: boolean
}

type BatchContext = RegisterOfficeDocumentOccurrencesParams & {
  readonly authorship: FieldAuthorship
  /** A storage rastreada por `runWithStoredObjectCleanup` — o objeto some se o lote desfizer. */
  readonly storage: RemovableObjectStoragePort | undefined
  readonly transaction: OfficeOccurrenceBatchTransactionPort
}

type BatchOutcome = {
  readonly id: string
  readonly items: readonly BatchItemOutcome[]
  readonly occurrenceType: OccurrenceTypeRecord | null
}

export async function registerOfficeDocumentOccurrences(
  params: RegisterOfficeDocumentOccurrencesParams,
): Promise<RegisterOfficeDocumentOccurrencesResult> {
  const authorship = deriveFieldAuthorship({ target: params.target })
  const upload = params.attachment?.upload ?? null
  /**
   * D9: os mesmos limites do canhoto do escritório — a foto do lote não é um segundo contrato de
   * anexo. Validado **fora** de qualquer reserva: um arquivo recusado não gasta a chave do lote.
   */
  if (upload !== null) assertOfficeUploadAccepted(upload)

  const runBatch = (storage: RemovableObjectStoragePort | undefined) =>
    params.unitOfWork.execute((transaction) => {
      const context: BatchContext = { ...params, authorship, storage, transaction }
      return withFieldReport<BatchOutcome>(
        {
          actorUserId: params.actorUserId,
          authorship,
          companyId: params.companyId,
          idempotencyKey: params.idempotencyKey,
          operation: buildOccurrenceBatchOperation({
            attachmentSha256: upload === null ? null : sha256Hex(upload.bytes),
            documentIds: params.documentIds,
            note: params.note,
            occurrenceTypeId: params.occurrenceTypeId,
            onBehalfOfDriverId: params.target.onBehalfOfDriverId,
          }),
          transaction,
        },
        () => performBatch(context),
        () => recallBatch(context),
      )
    })
  /** Spec 156 T15: a foto sobe dentro da transação do lote; se ela desfizer, sai do bucket. */
  const attachmentStorage = params.attachment?.storage
  const outcome =
    upload === null || attachmentStorage === undefined
      ? await runBatch(undefined)
      : await runWithStoredObjectCleanup({ operation: runBatch, storage: attachmentStorage })

  await notifyCreated({ outcome, params })

  return { items: outcome.items.map(({ documentId, id }) => ({ documentId, id })) }
}

/**
 * Ressalva A3: a validação mora **dentro** do `perform` — o reenvio não a refaz.
 *
 * T7b: o upload só acontece **depois** de tipo e alcance validarem — um lote fadado a 409/422 não
 * gasta uma chamada de armazenamento. O objeto é gravado **uma vez**, antes do laço por nota, e
 * cada `saveDocumentOccurrence` recebe o mesmo `objectId` (D7 §3.5: um arquivo, N referências).
 */
async function performBatch(context: BatchContext): Promise<BatchOutcome> {
  const occurrenceType = await context.transaction.findOccurrenceType({
    companyId: context.companyId,
    occurrenceTypeId: context.occurrenceTypeId,
  })
  if (
    occurrenceType === null ||
    !occurrenceType.active ||
    occurrenceType.stage !== TRIP_OCCURRENCE_STAGE.delivery
  ) {
    throw new OccurrenceTypeNotFieldError()
  }

  const reachable = new Set(
    await context.transaction.findReachableDocumentIds({
      companyId: context.companyId,
      documentIds: context.documentIds,
      target: toFieldTripTarget({ target: context.target }),
    }),
  )
  const unreachable = context.documentIds.filter((documentId) => !reachable.has(documentId))
  if (unreachable.length > 0) {
    throw new TripDocumentNotReachableError({ unreachableDocumentIds: unreachable })
  }

  const attachmentObjectId = await persistBatchAttachment(context)
  const items = await recordItems({ attachmentObjectId, context, occurrenceType })
  await context.transaction.recordOfficeAudit({
    ...context.officeAudit,
    actorUserId: context.actorUserId,
    companyId: context.companyId,
    documentIds: context.documentIds,
    onBehalfOfDriverId: context.target.onBehalfOfDriverId,
    tripId: context.target.tripId,
  })
  return { id: firstItemId(items), items, occurrenceType }
}

/** `null` quando o lote não trouxe foto. Uma única escrita em `stored_objects`, para o lote inteiro. */
async function persistBatchAttachment(context: BatchContext): Promise<string | null> {
  const { attachment, storage } = context
  if (attachment === undefined || attachment.upload === null || storage === undefined) return null

  const objectId = attachment.newObjectId()
  const objectKey = buildOccurrenceBatchAttachmentObjectKey({
    companyId: context.companyId,
    objectId,
    tripId: context.target.tripId,
  })
  const stored = await storage.store({
    bytes: attachment.upload.bytes,
    companyId: context.companyId,
    mimeType: attachment.upload.mimeType,
    objectId,
    objectKey,
  })
  await context.transaction.saveAttachmentObject({
    companyId: context.companyId,
    mimeType: attachment.upload.mimeType,
    objectId,
    objectKey,
    sha256: stored.sha256,
    sizeBytes: attachment.upload.bytes.byteLength,
  })

  return objectId
}

/**
 * Ressalva A3: o lote já liquidado se reconstrói pelas reservas de cada nota, na ordem do pedido.
 * Nunca `null` — `null` faria `withFieldReport` executar o lote de novo.
 */
async function recallBatch(context: BatchContext): Promise<BatchOutcome> {
  const items = await recordItems({ attachmentObjectId: null, context, occurrenceType: null })
  return { id: firstItemId(items), items, occurrenceType: null }
}

/**
 * Em série, e de propósito (ressalva B3): a transação é uma conexão só, e consulta concorrente nela
 * pode nunca voltar. O lote tem no máximo `MAX_BATCH_DOCUMENTS` notas.
 */
async function recordItems(input: {
  readonly attachmentObjectId: string | null
  readonly context: BatchContext
  readonly occurrenceType: OccurrenceTypeRecord | null
}): Promise<readonly BatchItemOutcome[]> {
  const items: BatchItemOutcome[] = []
  for (const documentId of input.context.documentIds) {
    items.push(await recordItem({ ...input, documentId }))
  }
  return items
}

async function recordItem(input: {
  readonly attachmentObjectId: string | null
  readonly context: BatchContext
  readonly documentId: string
  readonly occurrenceType: OccurrenceTypeRecord | null
}): Promise<BatchItemOutcome> {
  const { attachmentObjectId, context, documentId, occurrenceType } = input
  let createdNow = false
  const saved = await withFieldReport<{ readonly id: string }>(
    {
      actorUserId: context.actorUserId,
      authorship: context.authorship,
      companyId: context.companyId,
      idempotencyKey: buildOccurrenceBatchItemKey({
        documentId,
        idempotencyKey: context.idempotencyKey,
      }),
      operation: OFFICE_OCCURRENCE_BATCH_ITEM_OPERATION,
      transaction: context.transaction,
    },
    async () => {
      if (occurrenceType === null) throw new TripDocumentNotReachableError()
      const occurrence = await context.transaction.saveDocumentOccurrence({
        actorUserId: context.actorUserId,
        attachmentObjectId,
        authorship: context.authorship,
        companyId: context.companyId,
        documentId,
        note: context.note,
        occurrenceTypeId: occurrenceType.id,
        productCode: '',
        stage: TRIP_OCCURRENCE_STAGE.delivery,
        tripId: context.target.tripId,
        typeName: occurrenceType.name,
      })
      if (occurrence === null) throw new TripDocumentNotReachableError()
      createdNow = true
      return { id: occurrence.id }
    },
    async (resultId) => {
      const recalled = await context.transaction.findDocumentOccurrence({
        companyId: context.companyId,
        occurrenceId: resultId,
      })
      return recalled === null ? null : { id: recalled.id }
    },
  )
  return { createdNow, documentId, id: saved.id }
}

function firstItemId(items: readonly BatchItemOutcome[]): string {
  const [first] = items
  if (first === undefined) throw new TripDocumentNotReachableError()
  return first.id
}

/**
 * Um aviso por nota **criada nesta chamada**, depois do commit e fora da transação. A regra (tipo
 * com aviso ligado, destinatário, falha do envio engolida) é a de `notifyOccurrence`, sem cópia. Os
 * avisos vão para quem despachou a viagem (ressalva M4).
 *
 * Spec 156 T15 M10: os rótulos saem de uma leitura só, e a falha dela (ou de qualquer passo daqui)
 * não vira 500 — as ocorrências já estão gravadas, e o reenvio da mesma chave não avisaria de novo.
 */
async function notifyCreated(input: {
  readonly outcome: BatchOutcome
  readonly params: RegisterOfficeDocumentOccurrencesParams
}): Promise<void> {
  const { occurrenceType } = input.outcome
  if (occurrenceType === null) return

  const { params } = input
  const created = input.outcome.items.filter((item) => item.createdNow)
  if (created.length === 0) return

  try {
    const labels = await params.notifications.readLabels({
      companyId: params.companyId,
      documentIds: created.map((item) => item.documentId),
      tripId: params.target.tripId,
    })
    await Promise.all(
      created.map((item) =>
        notifyOccurrence({
          companyId: params.companyId,
          notificationParameters: {
            ...(labels.get(item.documentId) ?? EMPTY_OCCURRENCE_LABELS),
            documentId: item.documentId,
            occurrenceType: '',
            tripId: params.target.tripId,
          },
          notifier: params.notifications.notifier,
          occurrenceType,
        }),
      ),
    )
  } catch (error) {
    params.notifications.logger.warn('trip_office_occurrences_notification_failed', {
      companyId: params.companyId,
      reason: error instanceof Error ? error.message : 'unknown',
      tripId: params.target.tripId,
    })
  }
}
