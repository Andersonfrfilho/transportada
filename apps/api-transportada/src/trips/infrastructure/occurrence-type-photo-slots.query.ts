/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E1, RF8): as vagas de foto de cada tipo, em lote — uma consulta para N tipos, sempre pela empresa do
 * contexto. O app do motorista lê as vagas daqui e o registro no servidor recobra (`resolveStopOccurrencePhotos`).
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { companyOccurrenceTypePhotoSlots } from '../../database/trip.schema.js'
import type { StopOccurrencePhotoSlot } from '../domain/stop-occurrence-photo-slots.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** Só os tipos que têm vagas ganham `photoSlots`: o corpo dos demais continua byte a byte o de hoje. */
export async function withOccurrenceTypePhotoSlots<TRecord extends { readonly id: string }>(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly records: readonly TRecord[] },
): Promise<readonly (TRecord & { readonly photoSlots?: readonly StopOccurrencePhotoSlot[] })[]> {
  if (params.records.length === 0) return params.records
  const rows = await queryable
    .select({
      label: companyOccurrenceTypePhotoSlots.label,
      occurrenceTypeId: companyOccurrenceTypePhotoSlots.occurrenceTypeId,
      position: companyOccurrenceTypePhotoSlots.position,
      required: companyOccurrenceTypePhotoSlots.required,
      slotKey: companyOccurrenceTypePhotoSlots.slotKey,
    })
    .from(companyOccurrenceTypePhotoSlots)
    .where(
      and(
        eq(companyOccurrenceTypePhotoSlots.companyId, params.companyId),
        inArray(
          companyOccurrenceTypePhotoSlots.occurrenceTypeId,
          params.records.map((record) => record.id),
        ),
      ),
    )
    .orderBy(
      asc(companyOccurrenceTypePhotoSlots.position),
      asc(companyOccurrenceTypePhotoSlots.slotKey),
    )
  const byType = new Map<string, StopOccurrencePhotoSlot[]>()
  for (const row of rows) {
    const slots = byType.get(row.occurrenceTypeId) ?? []
    slots.push({
      label: row.label,
      position: row.position,
      required: row.required,
      slotKey: row.slotKey,
    })
    byType.set(row.occurrenceTypeId, slots)
  }
  return params.records.map((record) => {
    const photoSlots = byType.get(record.id)
    return photoSlots === undefined ? record : { ...record, photoSlots }
  })
}
