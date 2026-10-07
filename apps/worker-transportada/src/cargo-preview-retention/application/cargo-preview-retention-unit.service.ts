/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CARGO_PREVIEW_RETENTION_DELETE_TIMEOUT_MS,
  CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW,
  CARGO_PREVIEW_RETENTION_UNIT_RESULT,
  type CargoPreviewRetentionUnitResult,
} from '../domain/cargo-preview-retention.constant.js'
import { resolveCargoPreviewRetentionCutoff } from '../domain/cargo-preview-retention.policy.js'
import type {
  CargoPreviewRetentionGateway,
  DeleteStoredObjectBytes,
} from './cargo-preview-retention-unit.port.js'

export class CargoPreviewRetentionStorageDeleteError extends Error {}

/**
 * A unidade é a prévia, numa transação só. Ordem em código, não no banco: os bytes saem do bucket
 * **antes** de qualquer escrita, e o evento — que é o marcador de "já retida" — é a última. Falha de
 * bucket desfaz a transação inteira e a prévia volta na próxima execução; o delete do S3 é
 * idempotente, então o objeto que já tinha saído não atrapalha a repetição.
 */
export async function applyCargoPreviewRetentionUnit(input: {
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: CargoPreviewRetentionGateway
  readonly now: Date
  readonly previewId: string
}): Promise<CargoPreviewRetentionUnitResult> {
  try {
    return await input.gateway.runInTransaction((gateway) => runUnit({ ...input, gateway }))
  } catch (error) {
    if (error instanceof CargoPreviewRetentionStorageDeleteError) {
      return CARGO_PREVIEW_RETENTION_UNIT_RESULT.failed
    }
    throw error
  }
}

async function runUnit(input: {
  readonly deleteObject: DeleteStoredObjectBytes
  readonly gateway: CargoPreviewRetentionGateway
  readonly now: Date
  readonly previewId: string
}): Promise<CargoPreviewRetentionUnitResult> {
  const { gateway } = input
  const preview = await gateway.lockEligiblePreview({
    cutoff: resolveCargoPreviewRetentionCutoff(input.now),
    previewId: input.previewId,
  })
  if (preview === undefined) return CARGO_PREVIEW_RETENTION_UNIT_RESULT.skipped

  const limit = CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW
  const live = await gateway.lockLiveObjects({ limit, preview })
  const objects = live.slice(0, limit)
  for (const object of objects) {
    await deleteWithTimeout(input.deleteObject, { bucket: object.bucket, key: object.key })
  }

  const itemsAnonymized = await gateway.anonymizeItems(preview)
  if (objects.length > 0) await gateway.markObjectsDeleted(objects.map((object) => object.id))
  if (live.length > limit) return CARGO_PREVIEW_RETENTION_UNIT_RESULT.partial

  await gateway.recordRetention({
    preview,
    record: { itemsAnonymized, objectsDeleted: objects.length, occurredAt: input.now },
  })
  return CARGO_PREVIEW_RETENTION_UNIT_RESULT.retained
}

async function deleteWithTimeout(
  deleteObject: DeleteStoredObjectBytes,
  input: { readonly bucket: string; readonly key: string },
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new CargoPreviewRetentionStorageDeleteError('object delete timed out')),
      CARGO_PREVIEW_RETENTION_DELETE_TIMEOUT_MS,
    )
  })
  try {
    await Promise.race([deleteObject(input), timeout])
  } catch (error) {
    if (error instanceof CargoPreviewRetentionStorageDeleteError) throw error
    throw new CargoPreviewRetentionStorageDeleteError(
      error instanceof Error ? error.message : 'object delete failed',
    )
  } finally {
    clearTimeout(timer)
  }
}
