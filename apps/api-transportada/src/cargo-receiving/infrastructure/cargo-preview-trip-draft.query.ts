/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: as leituras dos rascunhos de viagem — uma consulta por tabela, nunca uma por item,
 * todas filtradas pela empresa do contexto. As notas vêm pelo vínculo desta prévia (não por `IN` de
 * milhares de ids), com cidade e destinatário do XML, o peso somado dos volumes e se a nota já está em
 * viagem viva (a mesma conta de `findUnavailableDocumentIds`).
 */
import { and, asc, eq, sql } from 'drizzle-orm'

import { cargoPreviewItems } from '../../database/cargo-preview-item.schema.js'
import {
  cargoPreviewDocumentLinks,
  cargoPreviewRouteLoads,
} from '../../database/cargo-preview-link.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { nfeAddresses, nfeDocuments, nfeVolumes } from '../../database/nfe.schema.js'
import type {
  TripDraftDocumentRow,
  TripDraftItemRow,
  TripDraftPreviewRow,
  TripDraftRouteLoadRow,
} from '../domain/cargo-preview-trip-draft.types.js'
import type { Database } from './cargo-arrival-persistence.support.js'
import {
  isInLiveTripSql,
  recipientAddressSql,
  recipientJoin,
  recipientParticipant,
  toIbgeCityCode,
} from './cargo-arrival-document.query.js'
import { buildPreviewFilters } from './cargo-preview-persistence.support.js'

type Scope = { readonly companyId: string; readonly previewId: string }

const GROSS_WEIGHT_KG = sql<
  string | null
>`(select round(sum(${nfeVolumes.grossWeight}), 3)::text from ${nfeVolumes} where ${nfeVolumes.companyId} = ${nfeDocuments.companyId} and ${nfeVolumes.documentId} = ${nfeDocuments.id})`

export async function selectTripDraftPreview(
  database: Database,
  params: Scope,
): Promise<TripDraftPreviewRow | null> {
  const [row] = await database
    .select({
      contractorId: cargoPreviews.contractorId,
      id: cargoPreviews.id,
      plannedDate: cargoPreviews.plannedDate,
      status: cargoPreviews.status,
    })
    .from(cargoPreviews)
    .where(and(...buildPreviewFilters(params)))
  return row ?? null
}

export function selectTripDraftItems(
  database: Database,
  params: Scope,
): Promise<TripDraftItemRow[]> {
  return database
    .select({
      city: cargoPreviewItems.city,
      matchState: cargoPreviewItems.matchState,
      matchedDocumentId: cargoPreviewItems.matchedDocumentId,
      routeName: cargoPreviewItems.routeName,
      rowNumber: cargoPreviewItems.rowNumber,
      state: cargoPreviewItems.state,
      value: cargoPreviewItems.value,
      volumeM3: cargoPreviewItems.volumeM3,
      weightKg: cargoPreviewItems.weightKg,
    })
    .from(cargoPreviewItems)
    .where(
      and(
        eq(cargoPreviewItems.companyId, params.companyId),
        eq(cargoPreviewItems.previewId, params.previewId),
      ),
    )
    .orderBy(asc(cargoPreviewItems.rowNumber))
}

export function selectTripDraftRouteLoads(
  database: Database,
  params: Scope,
): Promise<TripDraftRouteLoadRow[]> {
  return database
    .select({
      loadReference: cargoPreviewRouteLoads.loadReference,
      origin: cargoPreviewRouteLoads.origin,
      routeName: cargoPreviewRouteLoads.routeName,
    })
    .from(cargoPreviewRouteLoads)
    .where(
      and(
        eq(cargoPreviewRouteLoads.companyId, params.companyId),
        eq(cargoPreviewRouteLoads.previewId, params.previewId),
      ),
    )
}

export async function selectTripDraftDocuments(
  database: Database,
  params: Scope,
): Promise<TripDraftDocumentRow[]> {
  const rows = await database
    .select({
      cityIbgeCode: recipientAddressSql(nfeAddresses.cityCode),
      cityName: recipientAddressSql(nfeAddresses.city),
      grossWeightKg: GROSS_WEIGHT_KG,
      id: nfeDocuments.id,
      isInLiveTrip: isInLiveTripSql(nfeDocuments.id).mapWith(Boolean),
      number: nfeDocuments.number,
      recipientName: recipientParticipant.legalName,
      series: nfeDocuments.series,
      state: recipientAddressSql(nfeAddresses.state),
      status: nfeDocuments.status,
      totalValue: nfeDocuments.totalValue,
    })
    .from(cargoPreviewDocumentLinks)
    .innerJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, cargoPreviewDocumentLinks.companyId),
        eq(nfeDocuments.id, cargoPreviewDocumentLinks.documentId),
      ),
    )
    .leftJoin(recipientParticipant, recipientJoin())
    .where(
      and(
        eq(cargoPreviewDocumentLinks.companyId, params.companyId),
        eq(cargoPreviewDocumentLinks.previewId, params.previewId),
      ),
    )
  return rows.map((row) => ({ ...row, cityIbgeCode: toIbgeCityCode(row.cityIbgeCode) }))
}

/**
 * RF8a (Fase 3): aqui entram as notas marcadas "devolver ao contratante". A marcação ainda não existe;
 * o gancho fica num lugar só, e a política já tira do roteável o que ele devolver.
 */
export function findExcludedTripDraftDocumentIds(): ReadonlySet<string> {
  return new Set()
}
