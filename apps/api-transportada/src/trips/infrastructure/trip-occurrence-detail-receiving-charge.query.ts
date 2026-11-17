/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A cobrança no recebimento no detalhe da ocorrência de parada (spec 317): quem pagou, o valor total, o PIX do
 * motorista e a localização de cada foto de vaga (placa, extrato). Toda junção leva `company_id`. O PIX sai
 * cru daqui; quem decide mostrá-lo (`trip.financials`) é o caso de uso.
 */
import { and, asc, eq, ne } from 'drizzle-orm'

import { storedObjects } from '../../database/storage.schema.js'
import {
  companyOccurrenceTypePhotoSlots,
  tripStopOccurrencePhotos,
  tripStopOccurrences,
} from '../../database/trip.schema.js'
import { formatAmountCents, parseAmountToCents } from '../domain/occurrence-amount.policy.js'
import type { TripOccurrenceDetailReceivingChargeSource } from '../application/read-trip-occurrence-detail.use-case.js'
import type { TripOccurrenceFeedItem } from '../application/trip-occurrence-feed.use-case.js'
import type { TripQueryable } from './trip-queryable.type.js'

const DELETED_OBJECT_STATUS = 'deleted'

/** `null` na ocorrência de nota e na de parada que não pergunta quem pagou nem tem foto de vaga. */
export async function findReceivingChargeDetail(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly item: TripOccurrenceFeedItem },
): Promise<null | TripOccurrenceDetailReceivingChargeSource> {
  if (input.item.source !== 'stop') return null
  const [occurrence] = await queryable
    .select({
      declaredAmount: tripStopOccurrences.declaredAmount,
      driverPixKey: tripStopOccurrences.driverPixKey,
      driverPixKeyType: tripStopOccurrences.driverPixKeyType,
      paidBy: tripStopOccurrences.paidBy,
    })
    .from(tripStopOccurrences)
    .where(
      and(
        eq(tripStopOccurrences.companyId, input.companyId),
        eq(tripStopOccurrences.id, input.item.id),
      ),
    )
    .limit(1)
  if (occurrence === undefined) return null

  const photoRows = await queryable
    .select({
      bucket: storedObjects.bucket,
      label: companyOccurrenceTypePhotoSlots.label,
      objectKey: storedObjects.objectKey,
      slotKey: tripStopOccurrencePhotos.slotKey,
    })
    .from(tripStopOccurrencePhotos)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, tripStopOccurrencePhotos.companyId),
        eq(storedObjects.id, tripStopOccurrencePhotos.objectId),
        ne(storedObjects.status, DELETED_OBJECT_STATUS),
      ),
    )
    .innerJoin(
      tripStopOccurrences,
      and(
        eq(tripStopOccurrences.companyId, tripStopOccurrencePhotos.companyId),
        eq(tripStopOccurrences.id, tripStopOccurrencePhotos.stopOccurrenceId),
      ),
    )
    .leftJoin(
      companyOccurrenceTypePhotoSlots,
      and(
        eq(companyOccurrenceTypePhotoSlots.companyId, tripStopOccurrences.companyId),
        eq(companyOccurrenceTypePhotoSlots.occurrenceTypeId, tripStopOccurrences.occurrenceTypeId),
        eq(companyOccurrenceTypePhotoSlots.slotKey, tripStopOccurrencePhotos.slotKey),
      ),
    )
    .where(
      and(
        eq(tripStopOccurrencePhotos.companyId, input.companyId),
        eq(tripStopOccurrencePhotos.stopOccurrenceId, input.item.id),
      ),
    )
    .orderBy(asc(tripStopOccurrencePhotos.position), asc(tripStopOccurrencePhotos.slotKey))

  const hasPixKey = occurrence.driverPixKey !== null && occurrence.driverPixKeyType !== null
  if (occurrence.paidBy === null && occurrence.declaredAmount === null && photoRows.length === 0) {
    return null
  }
  return {
    declaredAmount:
      occurrence.declaredAmount === null
        ? null
        : formatAmountCents(parseAmountToCents(occurrence.declaredAmount)),
    driverPix:
      hasPixKey && occurrence.driverPixKey !== null && occurrence.driverPixKeyType !== null
        ? { key: occurrence.driverPixKey, type: occurrence.driverPixKeyType }
        : null,
    paidBy: occurrence.paidBy,
    photos: photoRows.map((photo) => ({
      bucket: photo.bucket,
      label: photo.label ?? photo.slotKey,
      objectKey: photo.objectKey,
      slotKey: photo.slotKey,
    })),
  }
}
