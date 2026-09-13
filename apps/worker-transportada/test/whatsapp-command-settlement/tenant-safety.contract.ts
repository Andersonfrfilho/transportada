/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A varredura é da instalação inteira, mas cada junção leva a empresa: o id do lote e o da NFS-e vêm
 * do diário de uma empresa, e sem ela na junção um id alcançaria a linha de outra.
 */
import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'

import {
  buildCandidateBatchItemJoin,
  buildCandidateFilters,
  buildCandidateJournalJoin,
  buildCandidateNfseJoin,
} from '../../src/whatsapp-command-settlement/infrastructure/drizzle-settlement-candidate.repository.js'

const dialect = new PgDialect()
const DOCUMENTS = '"whatsapp_command_documents"'

describe('varredura da liquidação: empresa em toda junção (spec 144 T014)', () => {
  test('o diário junta ao pedido pela empresa e pelo id', () => {
    const { sql } = dialect.sqlToQuery(buildCandidateJournalJoin())
    expect(sql).toContain(`${DOCUMENTS}."company_id" = "whatsapp_command_requests"."company_id"`)
    expect(sql).toContain(`${DOCUMENTS}."request_id" = "whatsapp_command_requests"."id"`)
  })

  test('o item do lote junta ao diário pela empresa, e só no passo de CT-e', () => {
    const { params, sql } = dialect.sqlToQuery(buildCandidateBatchItemJoin())
    expect(sql).toContain(`"cte_batch_items"."company_id" = ${DOCUMENTS}."company_id"`)
    expect(sql).toContain(`"cte_batch_items"."batch_id" = ${DOCUMENTS}."document_id"`)
    expect(params).toEqual(['cte_batch'])
  })

  test('a NFS-e junta ao diário pela empresa, e só no passo de NFS-e', () => {
    const { params, sql } = dialect.sqlToQuery(buildCandidateNfseJoin())
    expect(sql).toContain(`"nfse_service_invoices"."company_id" = ${DOCUMENTS}."company_id"`)
    expect(sql).toContain(`"nfse_service_invoices"."id" = ${DOCUMENTS}."document_id"`)
    expect(params).toEqual(['nfse_invoice'])
  })

  test('varre os dispatched e os confirming parados antes do corte', () => {
    const cutoff = new Date('2026-09-12T11:45:00.000Z')
    const now = new Date('2026-09-12T12:00:00.000Z')
    const { params, sql } = dialect.sqlToQuery(
      buildCandidateFilters({ now, stuckConfirmingBefore: cutoff }),
    )
    expect(sql).toContain('"whatsapp_command_requests"."confirmed_at" < $')
    expect(params).toEqual(['dispatched', 'confirming', cutoff.toISOString(), now.toISOString()])
  })

  /** T020 (B2): o pedido que a API pôs em recuo não ocupa lugar no teto até a hora dele. */
  test('deixa de fora o pedido em recuo até next_settlement_at', () => {
    const now = new Date('2026-09-12T12:00:00.000Z')
    const { sql } = dialect.sqlToQuery(
      buildCandidateFilters({ now, stuckConfirmingBefore: new Date('2026-09-12T11:45:00.000Z') }),
    )
    expect(sql).toContain('"whatsapp_command_requests"."next_settlement_at" is null')
    expect(sql).toContain('"whatsapp_command_requests"."next_settlement_at" <= $')
  })
})
