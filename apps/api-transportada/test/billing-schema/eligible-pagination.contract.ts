/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildEligibleCteFilters,
  type EligibleCteFilterInput,
} from '../../src/billing/infrastructure/eligible-cte.query.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../src/shared/keyset-cursor.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const BATCH_ID = '00000000-0000-4000-8000-000000000902'
const LAST_CTE_ID = '00000000-0000-4000-8000-000000000903'
const LAST_AUTHORIZED_AT = new Date('2026-08-11T13:45:00.000Z')

const dialect = new PgDialect()

const EMPTY_FILTERS: EligibleCteFilterInput = {
  batchId: null,
  batchIdIn: null,
  companyId: COMPANY_ID,
  cteDocumentIds: null,
  cteNumber: null,
  cteNumberFrom: null,
  cteNumberIn: null,
  cteNumberTo: null,
  cursor: null,
  customerDocument: null,
  customerName: null,
  from: null,
  maxAmount: null,
  minAmount: null,
  nfeNumberFrom: null,
  nfeNumberIn: null,
  nfeNumberTo: null,
  to: null,
}

function compile(overrides: Partial<EligibleCteFilterInput> = {}): {
  readonly params: readonly string[]
  readonly sql: string
} {
  const query = dialect.sqlToQuery(
    and(...buildEligibleCteFilters({ ...EMPTY_FILTERS, ...overrides }))!,
  )
  return { params: query.params.map((value) => String(value)), sql: query.sql }
}

describe('billing eligible CT-e pagination', () => {
  test('sem cursor a consulta não ganha condição de retomada', () => {
    const query = compile()

    expect(query.sql).not.toContain('"cte_fiscal_documents"."authorized_at" >')
    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
  })

  /**
   * A ordenação é `(authorized_at, id)` crescente. Comparar só a data repetiria toda linha empatada
   * no mesmo instante — o desempate pelo id é o que garante avanço.
   */
  test('o cursor retoma pela dupla (authorized_at, id), com desempate pelo id', () => {
    const query = compile({
      cursor: { createdAt: LAST_AUTHORIZED_AT, id: LAST_CTE_ID },
    })

    expect(query.sql).toContain('"cte_fiscal_documents"."authorized_at" >')
    expect(query.sql).toContain('"cte_fiscal_documents"."id" >')
    expect(query.sql).toContain(' or ')
    expect(query.params).toContain(LAST_CTE_ID)
  })

  /** Cursor não pode soltar filtro nenhum: a página seguinte é do mesmo recorte, ou é outra lista. */
  test('o cursor convive com o filtro de lote sem soltar a empresa', () => {
    const query = compile({
      batchIdIn: [BATCH_ID],
      cursor: { createdAt: LAST_AUTHORIZED_AT, id: LAST_CTE_ID },
    })

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."batch_id" in (')
    expect(query.params).toContain(COMPANY_ID)
    expect(query.params).toContain(BATCH_ID)
    expect(query.params).toContain(LAST_CTE_ID)
  })

  test('o cursor da listagem usa o mesmo formato compartilhado das demais listas', () => {
    const encoded = encodeKeysetCursor({ createdAt: LAST_AUTHORIZED_AT, id: LAST_CTE_ID })

    expect(encoded).toBe(`${LAST_AUTHORIZED_AT.toISOString()}::${LAST_CTE_ID}`)
    expect(decodeKeysetCursor(encoded)).toEqual({
      createdAt: LAST_AUTHORIZED_AT,
      id: LAST_CTE_ID,
    })
  })
})
