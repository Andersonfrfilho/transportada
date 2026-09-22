/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (D7, aceite 10): o escritório registra a mesma ocorrência de rua em várias notas
 * da viagem, em nome do motorista. **Uma transação para o lote**: ou as N ocorrências gravam, ou
 * nenhuma — é uma requisição e um fato só ("cliente ausente" nesta parada), e o reenvio da mesma
 * chave é a única saída que a tela precisa explicar. Um aviso por nota criada, depois do commit.
 */
import { buildOccurrenceBatchOperation, sha256Hex } from '../domain/occurrence-batch.policy.js'
import { deriveFieldAuthorship } from './field-trip-target.types.js'
import { assertOfficeUploadAccepted } from './office-delivery-proof.service.js'
import { performBatch, recallBatch } from './office-occurrence-batch.service.js'
import type {
  BatchContext,
  BatchOutcome,
  RegisterOfficeDocumentOccurrencesParams,
  RegisterOfficeDocumentOccurrencesResult,
} from './office-occurrence-batch.types.js'
import { notifyCreated } from './office-occurrence-notification.service.js'
import {
  runWithStoredObjectCleanup,
  type RemovableObjectStoragePort,
} from './stored-object-cleanup.service.js'
import { withFieldReport } from './trip-field-report.port.js'

export type {
  OccurrenceLabels,
  OfficeOccurrenceAttachment,
  OfficeOccurrenceAttachmentUpload,
  OfficeOccurrenceBatchItem,
  OfficeOccurrenceBatchTransactionPort,
  OfficeOccurrenceBatchUnitOfWork,
  OfficeOccurrenceNotificationsPort,
  RegisterOfficeDocumentOccurrencesParams,
  RegisterOfficeDocumentOccurrencesResult,
} from './office-occurrence-batch.types.js'

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
      return withFieldReport<BatchOutcome>({
        guard: {
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
        perform: () => performBatch(context),
        recall: () => recallBatch(context),
      })
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
