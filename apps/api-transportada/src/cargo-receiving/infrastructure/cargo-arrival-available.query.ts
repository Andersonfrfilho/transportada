/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: as notas que podem entrar numa chegada — do emitente do contratante (CNPJ do
 * cadastro, papel `emitter`), autorizadas, sem viagem viva e sem chegada —, da mais nova para a
 * mais velha pela emissão.
 */
import { and, desc, eq } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import { nfeAddresses, nfeDocuments } from '../../database/nfe.schema.js'
import type { AvailableArrivalDocumentsLookup } from '../application/cargo-arrival.port.js'
import type { ListAvailableArrivalDocumentsRecordParams } from '../application/cargo-arrival-request.types.js'
import {
  buildAvailableDocumentFilters,
  emitterJoin,
  emitterParticipant,
  recipientAddressSql,
  recipientJoin,
  recipientParticipant,
} from './cargo-arrival-document.query.js'
import {
  buildDescendingCursorFilter,
  toPage,
  type Database,
} from './cargo-arrival-persistence.support.js'

export async function selectAvailableDocuments(
  database: Database,
  params: ListAvailableArrivalDocumentsRecordParams,
): Promise<AvailableArrivalDocumentsLookup> {
  const [contractor] = await database
    .select({ taxId: contractors.taxId })
    .from(contractors)
    .where(
      and(eq(contractors.companyId, params.companyId), eq(contractors.id, params.contractorId)),
    )
  if (contractor === undefined) return { isContractorFound: false }

  const rows = await selectAvailableRows(database, { ...params, emitterTaxId: contractor.taxId })
  return {
    isContractorFound: true,
    page: toPage({
      dateOf: (row) => row.issuedAt,
      limit: params.paging.limit,
      map: (row) => ({ ...row, issuedAt: row.issuedAt.toISOString() }),
      rows,
    }),
  }
}

function selectAvailableRows(
  database: Database,
  params: ListAvailableArrivalDocumentsRecordParams & { readonly emitterTaxId: string },
) {
  return database
    .select({
      accessKey: nfeDocuments.accessKey,
      cityIbgeCode: recipientAddressSql(nfeAddresses.cityCode),
      cityName: recipientAddressSql(nfeAddresses.city),
      id: nfeDocuments.id,
      issuedAt: nfeDocuments.issuedAt,
      number: nfeDocuments.number,
      recipientName: recipientParticipant.legalName,
      series: nfeDocuments.series,
      state: recipientAddressSql(nfeAddresses.state),
      totalValue: nfeDocuments.totalValue,
    })
    .from(nfeDocuments)
    .innerJoin(emitterParticipant, emitterJoin())
    .leftJoin(recipientParticipant, recipientJoin())
    .where(
      and(
        ...buildAvailableDocumentFilters(params),
        buildDescendingCursorFilter({
          cursor: params.paging.cursor,
          dateColumn: nfeDocuments.issuedAt,
          idColumn: nfeDocuments.id,
        }),
      ),
    )
    .orderBy(desc(nfeDocuments.issuedAt), desc(nfeDocuments.id))
    .limit(params.paging.limit + 1)
}
