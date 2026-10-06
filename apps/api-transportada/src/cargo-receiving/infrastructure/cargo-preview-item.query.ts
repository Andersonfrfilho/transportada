/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: os itens da prévia em ordem de linha, com a nota vinculada (número, destinatário e
 * valor da NF) numa consulta só.
 */
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'

import { cargoPreviewItems } from '../../database/cargo-preview-item.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import type { CargoPreviewItemFilters } from '../application/cargo-preview-request.types.js'
import type { Database } from './cargo-arrival-persistence.support.js'
import { recipientJoin, recipientParticipant } from './cargo-arrival-document.query.js'
import type { CargoPreviewItemRow } from './cargo-preview-view.mapper.js'

const ITEM_COLUMNS = {
  address: cargoPreviewItems.address,
  city: cargoPreviewItems.city,
  contractorReference: cargoPreviewItems.contractorReference,
  documentImportedAt: nfeDocuments.createdAt,
  documentIssuedAt: nfeDocuments.issuedAt,
  documentNumber: nfeDocuments.number,
  documentRecipientName: recipientParticipant.legalName,
  documentSeries: nfeDocuments.series,
  documentTotalValue: nfeDocuments.totalValue,
  id: cargoPreviewItems.id,
  matchEvidence: cargoPreviewItems.matchEvidence,
  matchGroupKey: cargoPreviewItems.matchGroupKey,
  matchState: cargoPreviewItems.matchState,
  matchedAt: cargoPreviewItems.matchedAt,
  matchedBy: cargoPreviewItems.matchedBy,
  matchedDocumentId: cargoPreviewItems.matchedDocumentId,
  neighborhood: cargoPreviewItems.neighborhood,
  postalCode: cargoPreviewItems.postalCode,
  recipientCode: cargoPreviewItems.recipientCode,
  recipientName: cargoPreviewItems.recipientName,
  routeName: cargoPreviewItems.routeName,
  routingDate: cargoPreviewItems.routingDate,
  rowError: cargoPreviewItems.rowError,
  rowNumber: cargoPreviewItems.rowNumber,
  state: cargoPreviewItems.state,
  value: cargoPreviewItems.value,
  volumeM3: cargoPreviewItems.volumeM3,
  weightKg: cargoPreviewItems.weightKg,
}

export async function selectPreviewItemRows(
  database: Pick<Database, 'select'>,
  params: { readonly filters: readonly SQL[]; readonly limit: number },
): Promise<readonly CargoPreviewItemRow[]> {
  return database
    .select(ITEM_COLUMNS)
    .from(cargoPreviewItems)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, cargoPreviewItems.companyId),
        eq(nfeDocuments.id, cargoPreviewItems.matchedDocumentId),
      ),
    )
    .leftJoin(recipientParticipant, recipientJoin())
    .where(and(...params.filters))
    .orderBy(asc(cargoPreviewItems.rowNumber))
    .limit(params.limit)
}

export function buildPreviewItemFilters(
  params: CargoPreviewItemFilters & {
    readonly companyId: string
    readonly previewId: string
  },
): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(cargoPreviewItems.companyId, params.companyId),
    eq(cargoPreviewItems.previewId, params.previewId),
    params.state === undefined ? undefined : eq(cargoPreviewItems.matchState, params.state),
    params.routeName === undefined ? undefined : eq(cargoPreviewItems.routeName, params.routeName),
    params.afterRow === undefined ? undefined : gt(cargoPreviewItems.rowNumber, params.afterRow),
  ]
  return filters.filter((filter): filter is SQL => filter !== undefined)
}
