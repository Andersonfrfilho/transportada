/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TRIP_OCCURRENCE_UPLOAD_EXPIRE_DELETE_TIMEOUT_MS } from '../domain/trip-occurrence-upload-expire.constant.js'
import type {
  DeleteStoredObjectBytes,
  TripOccurrenceUploadExpireGateway,
} from './trip-occurrence-upload-expire-unit.port.js'

export class OccurrenceUploadStorageDeleteError extends Error {}

export type ExpireOccurrenceUploadUnitOutcome = {
  readonly result: 'expired' | 'missing' | 'failed'
}

/**
 * A unidade é o pedido de upload, nunca o lote (mesmo desenho de `purgeOccurrenceAttachmentUnit`):
 * apaga os bytes **antes** de marcar `expired` — uma falha de storage não pode deixar uma linha
 * `expired` cujo objeto continua no bucket, sem mais ninguém indo atrás dele.
 *
 * A exclusão em si é idempotente do lado do storage (S3/MinIO devolvem sucesso apagando uma chave
 * que já não existe — o motorista pode nunca ter chegado a subir o arquivo, ou uma execução anterior
 * já ter apagado e falhado antes do `markExpired`). Rodar a rotina de novo sobre a mesma linha nunca
 * falha por "objeto já removido": ela só reconfirma o que já tinha acontecido e completa o
 * `markExpired` que ficou pendente.
 */
export async function expireOccurrenceUploadUnit(input: {
  readonly before: Date
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: TripOccurrenceUploadExpireGateway
  readonly id: string
}): Promise<ExpireOccurrenceUploadUnitOutcome> {
  try {
    return await input.gateway.runInTransaction((gateway) => runUnit({ ...input, gateway }))
  } catch (error) {
    if (error instanceof OccurrenceUploadStorageDeleteError) return { result: 'failed' }
    throw error
  }
}

async function runUnit(input: {
  readonly before: Date
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: TripOccurrenceUploadExpireGateway
  readonly id: string
}): Promise<ExpireOccurrenceUploadUnitOutcome> {
  const candidate = await input.gateway.lockExpiredPendingUpload({
    before: input.before,
    id: input.id,
  })
  // Lock perdido, já confirmado por um `confirm` concorrente, ou já expirado por outro ciclo — os
  // três convergem: outra execução (ou o motorista) já decidiu o destino desta linha.
  if (candidate === undefined) return { result: 'missing' }

  await deleteWithTimeout(input.deleteObject, { bucket: candidate.bucket, key: candidate.key })
  await input.gateway.markExpired(candidate.id)
  return { result: 'expired' }
}

async function deleteWithTimeout(
  deleteObject: DeleteStoredObjectBytes,
  input: { readonly bucket: string; readonly key: string },
): Promise<void> {
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new OccurrenceUploadStorageDeleteError('object delete timed out')),
      TRIP_OCCURRENCE_UPLOAD_EXPIRE_DELETE_TIMEOUT_MS,
    )
  })
  try {
    await Promise.race([deleteObject(input), timeout])
  } catch (error) {
    if (error instanceof OccurrenceUploadStorageDeleteError) throw error
    throw new OccurrenceUploadStorageDeleteError(
      error instanceof Error ? error.message : 'object delete failed',
    )
  }
}
