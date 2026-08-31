/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildNfseSelectionDocumentFilters,
  buildNfseSelectionPartyAddressJoin,
  buildNfseSelectionPartyFilters,
  type NfseInvoiceSelectionQuery,
} from '../../src/nfse-invoices/infrastructure/nfse-invoice-selection.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000801'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000802'
const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000000803'

const dialect = new PgDialect()

const QUERY: NfseInvoiceSelectionQuery = {
  companyId: COMPANY_ID,
  documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
}

describe('nfse invoice selection query tenant safety', () => {
  test('prende a busca de documentos à empresa do contexto', () => {
    const query = dialect.sqlToQuery(and(...buildNfseSelectionDocumentFilters(QUERY))!)

    expect(query.sql).toContain('"nfe_documents"."company_id" = $')
    expect(query.sql).toContain('"nfe_documents"."id" in (')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('prende a busca de partes (remetente/destinatário) à empresa do contexto', () => {
    const query = dialect.sqlToQuery(and(...buildNfseSelectionPartyFilters(QUERY))!)

    expect(query.sql).toContain('"nfe_participants"."company_id" = $')
    expect(query.sql).toContain('"nfe_participants"."document_id" in (')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  /** Sem o `company_id` na condição, o join alcançaria endereço de outra empresa pelo participantId sozinho. */
  test('o join com nfe_addresses carrega company_id além do participantId', () => {
    const join = dialect.sqlToQuery(buildNfseSelectionPartyAddressJoin())

    expect(join.sql).toContain('"nfe_addresses"."company_id" = "nfe_participants"."company_id"')
    expect(join.sql).toContain('"nfe_addresses"."participant_id" = "nfe_participants"."id"')
  })

  /**
   * A seleção de NFS-e não lê peso: o RPS não declara massa. Se `nfe_volumes` reaparecer nesta
   * query, o gate de peso voltou junto — e com ele o bloqueio que travava emissão real.
   */
  test('a seleção de NFS-e não consulta a tabela de volumes', () => {
    const source = readFileSync(
      new URL(
        '../../src/nfse-invoices/infrastructure/nfse-invoice-selection.query.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).not.toContain('nfeVolumes')
  })
})
