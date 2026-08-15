/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { type SQL, sql } from 'drizzle-orm'

import { nfseServiceInvoices } from '../../database/nfse-reconciliation.schema.js'

/**
 * Nota sem agendamento é a mais devida de todas — a política a trata como devida agora. No Postgres
 * `asc` é `nulls last`, então o `nulls first` é explícito: sem ele ela ficava no fim e o `limit` do
 * ciclo podia nunca alcançá-la.
 */
export function buildDueInvoiceOrdering(): SQL {
  return sql`${nfseServiceInvoices.nextStatusCheckAt} asc nulls first`
}
