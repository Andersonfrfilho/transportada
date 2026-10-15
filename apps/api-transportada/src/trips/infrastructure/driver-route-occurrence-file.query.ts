/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: as fotos e a assinatura das ocorrências, em lote. A foto vem da tabela de
 * anexos (spec 161) e, na ocorrência de nota sem nenhuma linha lá, da coluna antiga
 * `attachment_object_id`; a ocorrência de parada só tem a coluna. A assinatura é coluna, nunca anexo.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { storedObjects } from '../../database/storage.schema.js'
import { tripDocumentOccurrenceAttachments } from '../../database/trip.schema.js'
import type { DriverRouteOccurrenceFileFact } from '../domain/driver-route-occurrence.types.js'
import type { RouteOccurrenceRow } from './driver-route-occurrence.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type RouteOccurrenceFiles = {
  readonly photos: readonly DriverRouteOccurrenceFileFact[]
  readonly signature: DriverRouteOccurrenceFileFact | null
}

export const NO_ROUTE_OCCURRENCE_FILES: RouteOccurrenceFiles = { photos: [], signature: null }

export async function readRouteOccurrenceFiles(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly rows: readonly RouteOccurrenceRow[] },
): Promise<ReadonlyMap<string, RouteOccurrenceFiles>> {
  const documentIds = input.rows.filter((row) => row.kind === 'document').map((row) => row.id)
  const attachmentRows =
    documentIds.length === 0
      ? []
      : await queryable
          .select({
            createdAt: tripDocumentOccurrenceAttachments.createdAt,
            occurrenceId: tripDocumentOccurrenceAttachments.occurrenceId,
            position: tripDocumentOccurrenceAttachments.position,
            storedObjectId: tripDocumentOccurrenceAttachments.storedObjectId,
          })
          .from(tripDocumentOccurrenceAttachments)
          .where(
            and(
              eq(tripDocumentOccurrenceAttachments.companyId, input.companyId),
              inArray(tripDocumentOccurrenceAttachments.occurrenceId, documentIds),
            ),
          )
          .orderBy(asc(tripDocumentOccurrenceAttachments.position))

  const objectIds = new Set<string>(attachmentRows.map((row) => row.storedObjectId))
  for (const row of input.rows) {
    if (row.attachmentObjectId !== null) objectIds.add(row.attachmentObjectId)
    if (row.signatureObjectId !== null) objectIds.add(row.signatureObjectId)
  }
  if (objectIds.size === 0) return new Map()

  const objects = await queryable
    .select({
      bucket: storedObjects.bucket,
      createdAt: storedObjects.createdAt,
      id: storedObjects.id,
      mimeType: storedObjects.mimeType,
      objectKey: storedObjects.objectKey,
      retentionUntil: storedObjects.retentionUntil,
      sizeBytes: storedObjects.sizeBytes,
    })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, input.companyId),
        inArray(storedObjects.id, [...objectIds]),
        sql`${storedObjects.status} <> 'deleted'`,
      ),
    )
  const objectById = new Map(objects.map((object) => [object.id, object]))

  function toFact(objectId: string, createdAt?: Date): DriverRouteOccurrenceFileFact | undefined {
    const object = objectById.get(objectId)
    if (object === undefined) return undefined
    return {
      bucket: object.bucket,
      contentType: object.mimeType,
      createdAt: (createdAt ?? object.createdAt).toISOString(),
      fileName: null,
      objectId: object.id,
      objectKey: object.objectKey,
      retentionUntil: object.retentionUntil?.toISOString(),
      sizeBytes: Number(object.sizeBytes),
    }
  }

  const tablePhotosByOccurrence = new Map<string, DriverRouteOccurrenceFileFact[]>()
  for (const row of attachmentRows) {
    const fact = toFact(row.storedObjectId, row.createdAt)
    if (fact === undefined) continue
    const photos = tablePhotosByOccurrence.get(row.occurrenceId) ?? []
    photos.push(fact)
    tablePhotosByOccurrence.set(row.occurrenceId, photos)
  }

  const files = new Map<string, RouteOccurrenceFiles>()
  for (const row of input.rows) {
    const tablePhotos = tablePhotosByOccurrence.get(row.id)
    const legacy = row.attachmentObjectId === null ? undefined : toFact(row.attachmentObjectId)
    const photos = tablePhotos ?? (legacy === undefined ? [] : [legacy])
    const signature = row.signatureObjectId === null ? undefined : toFact(row.signatureObjectId)
    files.set(row.id, { photos, signature: signature ?? null })
  }
  return files
}
