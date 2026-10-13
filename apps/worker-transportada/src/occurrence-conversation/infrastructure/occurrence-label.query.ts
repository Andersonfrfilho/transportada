/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6b: how the occurrence is called in the driver notice — the invoice, or the type name when the
 * occurrence has no invoice. The same rule as the API (`occurrence-label.policy.ts`) and as the overdue alert.
 * Never personal data: the notice crosses third-party mailboxes and logs. Raw SQL because the worker does not
 * copy the schema of the occurrence tables.
 */
import { sql } from 'drizzle-orm'

import type { OccurrenceConversationTransaction } from './drizzle-occurrence-conversation-mail.repository.js'

type LabelRow = Readonly<{
  invoice_number: null | string
  invoice_series: null | string
  type_name: string
}>

export function describeOccurrenceLabel(item: {
  readonly invoiceNumber: null | string
  readonly invoiceSeries: null | string
  readonly typeName: string
}): string {
  if (item.invoiceNumber === null || item.invoiceNumber === '') return item.typeName
  return item.invoiceSeries === null || item.invoiceSeries === ''
    ? `NF ${item.invoiceNumber}`
    : `NF ${item.invoiceNumber}/${item.invoiceSeries}`
}

export async function findOccurrenceLabel(
  transaction: OccurrenceConversationTransaction,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<string> {
  const rows = (await transaction.execute(sql`
    select t."name" as type_name, n."number" as invoice_number, n."series" as invoice_series
    from trip_document_occurrences o
    join company_occurrence_types t
      on t."company_id" = o."company_id" and t."id" = o."occurrence_type_id"
    left join trip_documents d on d."company_id" = o."company_id" and d."id" = o."trip_document_id"
    left join nfe_documents n on n."company_id" = o."company_id" and n."id" = d."nfe_document_id"
    where o."company_id" = ${params.companyId}::uuid and o."id" = ${params.occurrenceId}::uuid
  `)) as unknown as readonly LabelRow[]
  const [row] = rows
  if (row === undefined) return ''
  return describeOccurrenceLabel({
    invoiceNumber: row.invoice_number,
    invoiceSeries: row.invoice_series,
    typeName: row.type_name,
  })
}
