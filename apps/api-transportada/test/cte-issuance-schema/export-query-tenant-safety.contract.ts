/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import { buildCteExportFilters } from '../../src/cte-issuance/infrastructure/cte-export-selection.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000801'
const BATCH_ID = '00000000-0000-4000-8000-000000000802'
const ITEM_ID = '00000000-0000-4000-8000-000000000803'
const OTHER_ITEM_ID = '00000000-0000-4000-8000-000000000804'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

describe('CT-e XML export query tenant safety', () => {
  test('prende a exportação à empresa do contexto mesmo sem filtro nenhum', () => {
    const query = toSql(buildCteExportFilters({ companyId: COMPANY_ID }))

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /**
   * "Com chave de acesso" não vira predicado: `access_key` é `not null` em `cte_fiscal_documents`,
   * então quem garante a chave é o `innerJoin` do documento, não um `is not null` tautológico.
   */
  test('só alcança documento autorizado e não cancelado', () => {
    const query = toSql(buildCteExportFilters({ companyId: COMPANY_ID }))

    expect(query.sql).toContain('"cte_fiscal_documents"."status" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."cancellation_requested_at" is null')
    expect(query.params).toEqual([COMPANY_ID, 'authorized'])
  })

  test('seleção explícita de itens continua presa ao companyId do contexto', () => {
    const query = toSql(
      buildCteExportFilters({ companyId: COMPANY_ID, itemIds: [ITEM_ID, OTHER_ITEM_ID] }),
    )

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."id" in (')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(ITEM_ID)
    expect(query.params).toContain(OTHER_ITEM_ID)
  })

  test('preserva os filtros da listagem sem soltar o filtro de empresa', () => {
    const query = toSql(
      buildCteExportFilters({
        companyId: COMPANY_ID,
        filters: { batchId: BATCH_ID, cteNumberIn: ['1401', '1402'] },
      }),
    )

    expect(query.sql).toContain('"cte_batch_items"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."batch_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(BATCH_ID)
  })
})
