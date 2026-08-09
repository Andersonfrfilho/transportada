/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildBillingTakerJoin,
  buildEligibleCteFilters,
  buildEligibleNfeDocumentJoin,
  type EligibleCteFilterInput,
} from '../../src/billing/infrastructure/eligible-cte.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const BATCH_ID = '00000000-0000-4000-8000-000000000902'

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

describe('billing eligible CT-e query tenant safety', () => {
  test('prende a listagem à empresa do contexto mesmo sem filtro nenhum', () => {
    const query = compile()

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('mantém o recorte de elegibilidade: autorizado, com data e sem item de fatura', () => {
    const query = compile()

    expect(query.sql).toContain('"cte_fiscal_documents"."status" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."authorized_at" is not null')
    expect(query.sql).toContain('"billing_invoice_items"."id" is null')
    expect(query.params).toContain('authorized')
  })

  test('aplica a faixa de número de CT-e sem soltar o filtro de empresa', () => {
    const query = compile({ cteNumberFrom: '10', cteNumberTo: '40' })

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_fiscal_documents"."fiscal_number" >= $')
    expect(query.sql).toContain('"cte_fiscal_documents"."fiscal_number" <= $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain('10')
    expect(query.params).toContain('40')
  })

  /**
   * Lista e faixa são alternativas do mesmo domínio. Se virassem duas restrições em `and`, uma seleção
   * disjunta (`3,7` mais `10-40`) devolveria zero linha — o operador certo é `or`.
   */
  test('une lista e faixa por OU, nunca por interseção', () => {
    const query = compile({ cteNumberFrom: '10', cteNumberIn: ['3', '7'], cteNumberTo: '40' })

    expect(query.sql).toContain(' or ')
    expect(query.sql).toContain('"cte_fiscal_documents"."fiscal_number" in (')
    expect(query.sql).toContain('"cte_fiscal_documents"."fiscal_number" >= $')
    expect(query.params).toContain('3')
    expect(query.params).toContain('7')
    expect(query.params).toContain('10')
    expect(query.params).toContain('40')
  })

  /**
   * `nfe_documents.number` é texto sem preenchimento: `::bigint` estouraria numa linha fora do padrão
   * numérico, então a comparação preenche os dois lados a 9 dígitos.
   */
  test('compara o número da nota preenchido a 9 dígitos, sem cast para bigint', () => {
    const query = compile({ nfeNumberFrom: '10', nfeNumberTo: '40' })

    expect(query.sql).toContain(`lpad("nfe_documents"."number", 9, '0')`)
    expect(query.sql).not.toContain('::bigint')
    expect(query.params).toContain('000000010')
    expect(query.params).toContain('000000040')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('une lista e faixa de nota por OU, com os valores preenchidos', () => {
    const query = compile({ nfeNumberFrom: '10', nfeNumberIn: ['3', '7'], nfeNumberTo: '40' })

    expect(query.sql).toContain(' or ')
    expect(query.params).toContain('000000003')
    expect(query.params).toContain('000000007')
    expect(query.params).toContain('000000010')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /** Sem o `company_id` na condição, o join alcançaria nota de outra empresa pelo id sozinho. */
  test('o join com nfe_documents carrega company_id além do id', () => {
    const join = dialect.sqlToQuery(buildEligibleNfeDocumentJoin())

    expect(join.sql).toContain('"nfe_documents"."company_id" = "cte_batch_items"."company_id"')
    expect(join.sql).toContain('"nfe_documents"."id" = "cte_batch_items"."nfe_document_id"')
  })

  /**
   * O cliente da fatura é o tomador do frete, e quem é o tomador está configurado por perfil de
   * emissão (`cte_emission_profiles.taker`): remetente em `0`, destinatário em `3`. Cravar o papel
   * na consulta acertava uma operação e errava a outra — o valor gravado na emissão é a fonte.
   */
  test('o cliente da fatura vem do tomador gravado na emissão, não de um papel cravado', () => {
    const join = dialect.sqlToQuery(buildBillingTakerJoin())

    expect(join.sql).toContain(
      '"cte_issuance_payloads"."company_id" = "cte_fiscal_documents"."company_id"',
    )
    expect(join.sql).toContain(
      '"cte_issuance_payloads"."attempt_id" = "cte_fiscal_documents"."attempt_id"',
    )
    expect(join.sql).not.toContain('nfe_participants')
  })

  /** Papel de participante da nota não decide mais cliente nenhum — nem emitente, nem destinatário. */
  test('nenhum filtro do faturamento agrupa por papel da nota', () => {
    const query = compile({ customerDocument: '12345678000190', customerName: 'Spani' })

    expect(query.sql).toContain('"cte_issuance_payloads"."taker_tax_id"')
    expect(query.sql).toContain('"cte_issuance_payloads"."taker_legal_name"')
    expect(query.params).not.toContain('emitter')
    expect(query.params).not.toContain('recipient')
  })

  test('os filtros que já existiam continuam presos à empresa', () => {
    const query = compile({
      batchId: BATCH_ID,
      cteNumber: '123456',
      customerName: 'Sul',
      maxAmount: '350.50',
      minAmount: '100.00',
    })

    expect(query.sql).toContain('"cte_fiscal_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_items"."batch_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(BATCH_ID)
    expect(query.params).toContain('123456')
  })
})
