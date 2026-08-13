/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildDueInvoiceOrdering } from '../../src/nfse-status-pull/infrastructure/nfse-reconciliation.query.js'

const dialect = new PgDialect()

describe('NFS-e reconciliation due ordering', () => {
  /**
   * `next_status_check_at` é nulo até a primeira consulta, e a política trata nota sem agendamento
   * como devida agora. No Postgres `asc` é `nulls last`: sem o `nulls first` explícito, ela ia para o
   * fim da fila e o `limit` do ciclo podia nunca alcançá-la.
   */
  test('a nota sem agendamento vem primeiro, não por último', () => {
    const ordering = dialect.sqlToQuery(buildDueInvoiceOrdering())

    expect(ordering.sql).toContain('"nfse_service_invoices"."next_status_check_at"')
    expect(ordering.sql.toLowerCase()).toContain('asc nulls first')
  })
})
