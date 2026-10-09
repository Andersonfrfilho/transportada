/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura em lote da descoberta, em SQL cru para o cursor comparar a linha inteira. A ordem é a do
 * índice `nfe_documents_company_updated_issued_id_idx` (`DESC`) varrido de trás para a frente, e os
 * instantes saem e voltam como texto para não perder microssegundos.
 */
import { sql, type SQL } from 'drizzle-orm'

import type { DiscoveryCursor } from '../application/holiday-discovery.port.js'

export function buildDocumentBatchQuery(input: {
  readonly companyId: string
  readonly cursor: DiscoveryCursor | undefined
  readonly limit: number
}): SQL {
  const { companyId, cursor, limit } = input
  const afterCursor =
    cursor === undefined
      ? sql``
      : sql`and (d.updated_at, d.issued_at, d.id) > (${cursor.updatedAt}::timestamptz, ${cursor.issuedAt}::timestamptz, ${cursor.documentId}::uuid)`

  return sql`
    select d.id::text as document_id, d.issued_at::text as issued_at, d.updated_at::text as updated_at
    from nfe_documents d
    where d.company_id = ${companyId}::uuid ${afterCursor}
    order by d.updated_at asc, d.issued_at asc, d.id asc
    limit ${limit}`
}

/** Empresa ativa, com a importação ligada (sem linha de configuração vale ligada), e onde parou. */
export const LIST_DISCOVERY_COMPANIES_QUERY: SQL = sql`
  select c.id::text as company_id,
         s.cursor_updated_at::text as cursor_updated_at,
         s.cursor_issued_at::text as cursor_issued_at,
         s.cursor_document_id::text as cursor_document_id
  from companies c
  left join company_holiday_import_settings s on s.company_id = c.id
  where c.status = 'active' and coalesce(s.is_enabled, true)
  order by c.id`
