/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3/T7b (D7): os passos do lote de ocorrências dentro da transação — conferir tipo e
 * alcance, gravar a foto uma vez, uma ocorrência por nota com a própria reserva, e a trilha.
 */
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import {
  buildOccurrenceBatchAttachmentObjectKey,
  buildOccurrenceBatchItemKey,
  OFFICE_OCCURRENCE_BATCH_ITEM_OPERATION,
} from '../domain/occurrence-batch.policy.js'
import { OccurrenceTypeNotFieldError, TripDocumentNotReachableError } from '../domain/trip.error.js'
import { toFieldTripTarget } from './field-trip-target.types.js'
import type {
  BatchContext,
  BatchItemOutcome,
  BatchOutcome,
} from './office-occurrence-batch.types.js'
import type { OccurrenceTypeRecord } from './register-trip-occurrence.use-case.js'
import { withFieldReport } from './trip-field-report.port.js'

/**
 * Ressalva A3: a validação mora **dentro** do `perform` — o reenvio não a refaz.
 *
 * T7b: o upload só acontece **depois** de tipo e alcance validarem — um lote fadado a 409/422 não
 * gasta uma chamada de armazenamento. O objeto é gravado **uma vez**, antes do laço por nota, e
 * cada `saveDocumentOccurrence` recebe o mesmo `objectId` (D7 §3.5: um arquivo, N referências).
 */
export async function performBatch(context: BatchContext): Promise<BatchOutcome> {
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
export async function recallBatch(context: BatchContext): Promise<BatchOutcome> {
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
  const saved = await withFieldReport<{ readonly id: string }>({
    guard: {
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
    perform: async () => {
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
        ...(occurrenceType.redeliveryPolicy === undefined
          ? {}
          : { redeliveryPolicy: occurrenceType.redeliveryPolicy }),
        stage: TRIP_OCCURRENCE_STAGE.delivery,
        tripId: context.target.tripId,
        typeName: occurrenceType.name,
      })
      if (occurrence === null) throw new TripDocumentNotReachableError()
      createdNow = true
      return { id: occurrence.id }
    },
    recall: async (resultId) => {
      const recalled = await context.transaction.findDocumentOccurrence({
        companyId: context.companyId,
        occurrenceId: resultId,
      })
      return recalled === null ? null : { id: recalled.id }
    },
  })
  return { createdNow, documentId, id: saved.id }
}

function firstItemId(items: readonly BatchItemOutcome[]): string {
  const [first] = items
  if (first === undefined) throw new TripDocumentNotReachableError()
  return first.id
}
