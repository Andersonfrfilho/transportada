/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T14, ADR-0069 §3: a leitura do canhoto por OCR precisa casar pela chave inteira (fix
 * `b1653f25`, T13), e `GET /trips/:id` não traz a chave — ressalva M1 do t7-design.md (validador
 * do frontend recusa chave desconhecida numa aba com bundle antigo). Leitura própria e leve, no
 * molde de `trip-action-snapshot.query.ts`: só o que o assistente do escritório precisa para
 * identificar o canhoto.
 */
import { and, asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { freightCalculations, nfeDocuments } from '../../database/database.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type TripFieldDeliveryDocument = {
  readonly accessKey: string | null
  readonly id: string
  readonly nfeNumber: string | null
  readonly nfeSeries: string | null
  readonly releasedAt: string | null
}

/** Mesmo alias de `drizzle-trip.repository.ts`: a nota chega pelo vínculo direto ou por cálculo de frete. */
const nfeDocumentsViaFreight = alias(nfeDocuments, 'nfe_documents_via_freight_field_delivery')

/** `null` quando a viagem não é desta empresa — ausência, nunca 403 (mesma régua do allowed-actions). */
export async function readTripFieldDeliveryDocuments(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly TripFieldDeliveryDocument[] | null> {
  const [tripRecord] = await queryable
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (tripRecord === undefined) return null

  const rows = await queryable
    .select({
      accessKey: nfeDocuments.accessKey,
      accessKeyViaFreight: nfeDocumentsViaFreight.accessKey,
      id: tripDocuments.id,
      nfeNumber: nfeDocuments.number,
      nfeNumberViaFreight: nfeDocumentsViaFreight.number,
      nfeSeries: nfeDocuments.series,
      nfeSeriesViaFreight: nfeDocumentsViaFreight.series,
      releasedAt: tripDocuments.releasedAt,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      freightCalculations,
      and(
        eq(freightCalculations.companyId, tripDocuments.companyId),
        eq(freightCalculations.id, tripDocuments.freightCalculationId),
      ),
    )
    .leftJoin(
      nfeDocumentsViaFreight,
      and(
        eq(nfeDocumentsViaFreight.companyId, tripDocuments.companyId),
        eq(nfeDocumentsViaFreight.id, freightCalculations.nfeDocumentId),
      ),
    )
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)),
    )
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))

  return rows.map((row) => ({
    accessKey: row.accessKey ?? row.accessKeyViaFreight ?? null,
    id: row.id,
    nfeNumber: row.nfeNumber ?? row.nfeNumberViaFreight ?? null,
    nfeSeries: row.nfeSeries ?? row.nfeSeriesViaFreight ?? null,
    releasedAt: row.releasedAt?.toISOString() ?? null,
  }))
}
