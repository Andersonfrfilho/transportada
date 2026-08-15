/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildActiveCredentialFilters,
  buildActiveCteBatchLinkFilters,
  buildActiveCteBatchLinkJoin,
  buildActiveFreightRuleVersionFilters,
  buildActiveInvoiceLinkFilters,
  buildAttemptIdempotencyFilters,
  buildFiscalEnvironmentFilters,
  buildNfseProfileFilters,
} from '../../src/nfse-invoices/infrastructure/nfse-invoice-issuance.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000a01'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000a02'
const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000a03'
const PROFILE_ID = '00000000-0000-4000-8000-000000000a04'
const FREIGHT_RULE_ID = '00000000-0000-4000-8000-000000000a05'
const IDEMPOTENCY_KEY = 'e4f0e0a0-0000-4000-8000-000000000a06'

const dialect = new PgDialect()

const LINK_QUERY = {
  companyId: COMPANY_ID,
  documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
}

function compile(filters: readonly ReturnType<typeof buildNfseProfileFilters>[number][]): {
  readonly params: readonly string[]
  readonly sql: string
} {
  const query = dialect.sqlToQuery(and(...filters)!)
  return { params: query.params.map((value) => String(value)), sql: query.sql }
}

describe('nfse invoice issuance query tenant safety', () => {
  test('prende os vínculos de lote de CT-e à empresa do contexto', () => {
    const query = compile(buildActiveCteBatchLinkFilters(LINK_QUERY))

    expect(query.sql).toContain('"cte_batch_item_documents"."company_id" = $')
    expect(query.sql).toContain('"cte_batch_item_documents"."nfe_document_id" in (')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /**
   * Lote cancelado não segura mais a nota. Sem o `<>` de status, uma seleção cancelada continuaria
   * bloqueada para sempre e a nota de serviço nunca sairia.
   */
  test('lote cancelado devolve a nota para a seleção', () => {
    const query = compile(buildActiveCteBatchLinkFilters(LINK_QUERY))

    expect(query.sql).toContain('"cte_batches"."status" <> $')
    expect(query.params).toContain('cancelled')
  })

  /** Sem o `company_id` na condição, o join alcançaria lote de outra empresa pelo batchId sozinho. */
  test('o join com cte_batches carrega company_id além do batchId', () => {
    const join = dialect.sqlToQuery(buildActiveCteBatchLinkJoin())

    expect(join.sql).toContain(
      '"cte_batches"."company_id" = "cte_batch_item_documents"."company_id"',
    )
    expect(join.sql).toContain('"cte_batches"."id" = "cte_batch_item_documents"."batch_id"')
  })

  test('prende os vínculos de nota de serviço à empresa do contexto', () => {
    const query = compile(buildActiveInvoiceLinkFilters(LINK_QUERY))

    expect(query.sql).toContain('"nfse_service_invoice_documents"."company_id" = $')
    expect(query.sql).toContain('"nfse_service_invoice_documents"."nfe_document_id" in (')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /**
   * Mesmo recorte do índice parcial único da tabela: cancelar a nota precisa devolver o documento
   * para a seleção, senão ele fica preso na nota cancelada.
   */
  test('nota de serviço cancelada devolve o documento para a seleção', () => {
    const query = compile(buildActiveInvoiceLinkFilters(LINK_QUERY))

    expect(query.sql).toContain('"nfse_service_invoice_documents"."cancelled_at" is null')
  })

  test('prende a busca do perfil de emissão à empresa do contexto', () => {
    const query = compile(buildNfseProfileFilters({ companyId: COMPANY_ID, profileId: PROFILE_ID }))

    expect(query.sql).toContain('"nfse_emission_profiles"."company_id" = $')
    expect(query.sql).toContain('"nfse_emission_profiles"."id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(PROFILE_ID)
  })

  /** A nota congela a versão publicada da regra — a regra viva pode mudar depois da emissão. */
  test('a versão de regra de frete é a ativa e é presa à empresa do contexto', () => {
    const query = compile(
      buildActiveFreightRuleVersionFilters({
        companyId: COMPANY_ID,
        freightRuleId: FREIGHT_RULE_ID,
      }),
    )

    expect(query.sql).toContain('"freight_rule_versions"."company_id" = $')
    expect(query.sql).toContain('"freight_rule_versions"."freight_rule_id" = $')
    expect(query.sql).toContain('"freight_rule_versions"."status" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain('active')
  })

  test('prende o ambiente fiscal à empresa do contexto', () => {
    const query = compile(buildFiscalEnvironmentFilters({ companyId: COMPANY_ID }))

    expect(query.sql).toContain('"company_fiscal_profiles"."company_id" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /** Homologação e produção têm credenciais distintas: sem o ambiente, a nota sairia pelo token errado. */
  test('a credencial ativa é presa à empresa e ao ambiente fiscal', () => {
    const query = compile(
      buildActiveCredentialFilters({ companyId: COMPANY_ID, fiscalEnvironment: 'homologation' }),
    )

    expect(query.sql).toContain('"nfse_provider_credentials"."company_id" = $')
    expect(query.sql).toContain('"nfse_provider_credentials"."fiscal_environment" = $')
    expect(query.sql).toContain('"nfse_provider_credentials"."status" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain('homologation')
    expect(query.params).toContain('active')
  })

  /**
   * A chave de idempotência é escolhida pelo cliente: sem o `company_id`, uma chave repetida por
   * outra transportadora devolveria a tentativa dela como replay desta.
   */
  test('a busca por chave de idempotência é presa à empresa do contexto', () => {
    const query = compile(
      buildAttemptIdempotencyFilters({ companyId: COMPANY_ID, idempotencyKey: IDEMPOTENCY_KEY }),
    )

    expect(query.sql).toContain('"nfse_issuance_attempts"."company_id" = $')
    expect(query.sql).toContain('"nfse_issuance_attempts"."idempotency_key" = $')
    expect(query.params[0]).toBe(COMPANY_ID)
    expect(query.params).toContain(IDEMPOTENCY_KEY)
  })
})
