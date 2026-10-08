/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 258 RF2: os filtros de nota do relatório, em paridade com a aba de notas. Cada um entra no
 * mesmo `AND` do resto, então total, página e cursor contam só o conjunto já filtrado.
 */
import { and, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import {
  buildBatchLinkCompanyFilter,
  buildBatchLinkNotCancelledFilter,
} from '../../nfe-documents/infrastructure/cte-batch-link.query.js'
import type { TripReportFilters } from '../domain/trip-report.types.js'
import { reportDocument, reportEmitter, reportRecipient } from './trip-report-aliases.js'
import type { TripReportAddress } from './trip-report.query.js'

const NUMERIC_TEXT_PATTERN = '^[0-9]+$'
const MASK_CHARACTERS = /[./-]/gu

export type DocumentFilterInput = {
  readonly companyId: string
  readonly emitterAddress: TripReportAddress
  readonly filters: TripReportFilters
  readonly recipientAddress: TripReportAddress
}

export function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

function composeAddressSql(address: TripReportAddress): SQL {
  return sql`concat_ws(' - ', nullif(concat_ws(', ', nullif(${address.street}, ''), nullif(${address.number}, '')), ''), nullif(${address.district}, ''))`
}

function containsAddress(address: TripReportAddress, text: string): SQL {
  return sql`${composeAddressSql(address)} ilike ${`%${escapeLike(text)}%`}`
}

/** Dia civil em UTC, como a aba de notas (`issuedAt.slice(0, 10)`): meia-noite UTC do dia e do dia seguinte. */
function buildIssuedConditions(filters: TripReportFilters): SQL[] {
  const conditions: SQL[] = []
  if (filters.issuedFrom !== undefined) {
    conditions.push(
      sql`${reportDocument.issuedAt} >= (${filters.issuedFrom}::date)::timestamp AT TIME ZONE 'UTC'`,
    )
  }
  if (filters.issuedUntil !== undefined) {
    conditions.push(
      sql`${reportDocument.issuedAt} < ((${filters.issuedUntil}::date + 1))::timestamp AT TIME ZONE 'UTC'`,
    )
  }
  return conditions
}

/** `case` e não `or`: o Postgres não garante a ordem do `or`, e `::numeric` em texto não numérico derruba a consulta. */
function buildNumberConditions(filters: TripReportFilters): SQL[] {
  const conditions: SQL[] = []
  const number = reportDocument.number
  if (filters.numberFrom !== undefined) {
    conditions.push(
      sql`(case when ${number} ~ ${NUMERIC_TEXT_PATTERN} then ${number}::numeric >= ${filters.numberFrom}::numeric else true end)`,
    )
  }
  if (filters.numberTo !== undefined) {
    conditions.push(
      sql`(case when ${number} ~ ${NUMERIC_TEXT_PATTERN} then ${number}::numeric <= ${filters.numberTo}::numeric else true end)`,
    )
  }
  return conditions
}

/** `cteIssued` não é coluna: aproxima a elegibilidade completa por nota autorizada com vínculo ativo em lote. */
function buildCteLinkedCondition(companyId: string): SQL {
  return sql`(${reportDocument.status} = 'authorized' and exists (select 1 from ${cteBatchItemDocuments} inner join ${cteBatches} on ${and(eq(cteBatches.companyId, cteBatchItemDocuments.companyId), eq(cteBatches.id, cteBatchItemDocuments.batchId))} where ${and(buildBatchLinkCompanyFilter(companyId), eq(cteBatchItemDocuments.nfeDocumentId, reportDocument.id), buildBatchLinkNotCancelledFilter())}))`
}

function buildEmitterConditions(input: DocumentFilterInput): SQL[] {
  const { emitterAddress, filters } = input
  const conditions: SQL[] = []
  if (filters.emitterNameIn !== undefined) {
    conditions.push(inArray(reportEmitter.legalName, [...filters.emitterNameIn]))
  }
  if (filters.emitterTaxIdIn !== undefined) {
    const taxIds = filters.emitterTaxIdIn.map((taxId) => taxId.replace(MASK_CHARACTERS, ''))
    conditions.push(inArray(reportEmitter.taxId, taxIds))
  }
  if (filters.emitterCityIn !== undefined) {
    conditions.push(inArray(emitterAddress.city, [...filters.emitterCityIn]))
  }
  if (filters.emitterStateIn !== undefined) {
    conditions.push(inArray(emitterAddress.state, [...filters.emitterStateIn]))
  }
  if (filters.emitterAddress !== undefined) {
    conditions.push(containsAddress(emitterAddress, filters.emitterAddress))
  }
  return conditions
}

function buildRecipientConditions(input: DocumentFilterInput): SQL[] {
  const { filters, recipientAddress } = input
  const conditions: SQL[] = []
  if (filters.recipientName !== undefined) {
    conditions.push(ilike(reportRecipient.legalName, `%${escapeLike(filters.recipientName)}%`))
  }
  if (filters.recipientAddress !== undefined) {
    conditions.push(containsAddress(recipientAddress, filters.recipientAddress))
  }
  return conditions
}

export function buildDocumentFilterConditions(input: DocumentFilterInput): readonly SQL[] {
  const { companyId, filters } = input
  const conditions = [
    ...buildIssuedConditions(filters),
    ...buildNumberConditions(filters),
    ...buildEmitterConditions(input),
    ...buildRecipientConditions(input),
  ]
  if (filters.fiscalStatusIn !== undefined) {
    conditions.push(inArray(reportDocument.status, [...filters.fiscalStatusIn]))
  }
  if (filters.cteIssued === 'issued') conditions.push(buildCteLinkedCondition(companyId))
  if (filters.cteIssued === 'pending') {
    conditions.push(sql`not ${buildCteLinkedCondition(companyId)}`)
  }
  return conditions
}
