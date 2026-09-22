/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TRIP_OCCURRENCE_ATTACHMENT_PURGE_DELETE_TIMEOUT_MS } from '../domain/trip-occurrence-attachment-purge.constant.js'
import type {
  DeleteStoredObjectBytes,
  OccurrenceAttachmentPurgeGateway,
} from './trip-occurrence-attachment-purge-unit.port.js'

export class OccurrenceAttachmentStorageDeleteError extends Error {}

export type PurgeOccurrenceAttachmentUnitOutcome = {
  readonly result: 'deleted' | 'missing' | 'failed'
}

/**
 * A unidade de trabalho é o anexo (CA13, ajuste 4): resolve a linha por `stored_object_id OR
 * thumbnail_object_id`, e os dois objetos saem juntos. Sem linha (ajuste 6), o objeto órfão sai
 * sozinho. Ordem invariante em código, não no banco (ajuste 2 — `RESTRICT` só morde `DELETE` da
 * linha pai, e a RF23 já proíbe apagar a ocorrência; um `UPDATE status='deleted'` do objeto com o
 * anexo ainda apontando passa liso pela FK): apaga os bytes **antes** de tocar o banco, e só então
 * remove a linha do anexo e marca os objetos.
 */
export async function purgeOccurrenceAttachmentUnit(input: {
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: OccurrenceAttachmentPurgeGateway
  readonly objectId: string
}): Promise<PurgeOccurrenceAttachmentUnitOutcome> {
  try {
    return await input.gateway.runInTransaction((gateway) => runUnit({ ...input, gateway }))
  } catch (error) {
    if (error instanceof OccurrenceAttachmentStorageDeleteError) return { result: 'failed' }
    throw error
  }
}

async function runUnit(input: {
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: OccurrenceAttachmentPurgeGateway
  readonly objectId: string
}): Promise<PurgeOccurrenceAttachmentUnitOutcome> {
  const attachment = await input.gateway.findAttachmentByObjectId(input.objectId)
  return attachment === undefined
    ? purgeOrphanObject(input)
    : purgeAttachedUnit({ ...input, attachment })
}

async function purgeOrphanObject(input: {
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: OccurrenceAttachmentPurgeGateway
  readonly objectId: string
}): Promise<PurgeOccurrenceAttachmentUnitOutcome> {
  const [object] = await input.gateway.lockStoredObjects([input.objectId])
  // Ajuste 6: objeto vencido sem linha de anexo — apaga os bytes e marca `deleted`, sem linha a
  // remover. Lock perdido ou já `deleted` converge: outro ciclo já tratou dele.
  if (object === undefined) return { result: 'missing' }

  await deleteWithTimeout(input.deleteObject, { bucket: object.bucket, key: object.key })
  await input.gateway.markObjectsDeleted([object.id])
  return { result: 'deleted' }
}

async function purgeAttachedUnit(input: {
  readonly attachment: {
    readonly id: string
    readonly storedObjectId: string
    readonly thumbnailObjectId: string | null
  }
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: OccurrenceAttachmentPurgeGateway
}): Promise<PurgeOccurrenceAttachmentUnitOutcome> {
  const objectIds = [input.attachment.storedObjectId, input.attachment.thumbnailObjectId].filter(
    (id): id is string => id !== null,
  )
  const locked = await input.gateway.lockStoredObjects(objectIds)
  // Reconfere depois do lock: perdeu algum dos dois, ou já estava `deleted` — a unidade inteira
  // converge para a próxima passada, nunca meia exclusão (ajuste 3).
  if (locked.length !== objectIds.length) return { result: 'missing' }

  for (const object of locked) {
    await deleteWithTimeout(input.deleteObject, { bucket: object.bucket, key: object.key })
  }

  await input.gateway.deleteAttachment(input.attachment.id)
  await input.gateway.markObjectsDeleted(locked.map((object) => object.id))
  return { result: 'deleted' }
}

async function deleteWithTimeout(
  deleteObject: DeleteStoredObjectBytes,
  input: { readonly bucket: string; readonly key: string },
): Promise<void> {
  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new OccurrenceAttachmentStorageDeleteError('object delete timed out')),
      TRIP_OCCURRENCE_ATTACHMENT_PURGE_DELETE_TIMEOUT_MS,
    )
  })
  try {
    await Promise.race([deleteObject(input), timeout])
  } catch (error) {
    if (error instanceof OccurrenceAttachmentStorageDeleteError) throw error
    throw new OccurrenceAttachmentStorageDeleteError(
      error instanceof Error ? error.message : 'object delete failed',
    )
  }
}
