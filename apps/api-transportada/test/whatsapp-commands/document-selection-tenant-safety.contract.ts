/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — toda consulta da seleção pelo WhatsApp começa pela empresa do contexto, e nenhuma
 * subconsulta atravessa empresa: nota, participante, vínculo de lote, de NFS-e e de viagem.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import {
  buildEmitterParticipantFilters,
  buildNfseProfileVersionFilters,
  buildPendingDocumentFilters,
  buildRecentTripFilters,
  buildSelectionCriterionFilters,
} from '../../src/whatsapp-commands/infrastructure/drizzle-document-selection.repository.js'
import type { DocumentSelectionCriterion } from '../../src/whatsapp-commands/application/document-selection.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001301'
const TRIP_ID = '00000000-0000-4000-8000-000000001302'
const EMITTER = '11111111000191'

const dialect = new PgDialect()
const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

const CRITERIA: readonly DocumentSelectionCriterion[] = [
  { emitterTaxId: EMITTER, firstNumber: 1200, kind: 'number_range', lastNumber: 1250, series: '1' },
  { kind: 'trip', tripId: TRIP_ID },
  { emitterTaxId: EMITTER, endDate: '2026-09-10', kind: 'issue_date', startDate: '2026-09-01' },
  { emitterTaxId: EMITTER, kind: 'sender' },
]

describe('seleção de notas pelo WhatsApp — tenant safety', () => {
  test.each(CRITERIA.map((criterion) => [criterion.kind, criterion] as const))(
    'o critério "%s" começa pelo tenant e repete a empresa em toda subconsulta',
    (_kind, criterion) => {
      const query = toSql(buildSelectionCriterionFilters({ companyId: COMPANY_ID, criterion }))
      expect(query.sql).toMatch(/^\(+"nfe_documents"\."company_id" = \$1\)/)
      expect(query.params[0]).toBe(COMPANY_ID)
      // Toda subconsulta amarra a empresa — por parâmetro ou correlacionada à própria nota.
      const subqueries = query.sql.match(/exists \(select/g)?.length ?? 0
      const companyFilters = query.sql.match(/"company_id" = /g)?.length ?? 0
      expect(companyFilters).toBeGreaterThanOrEqual(1 + subqueries)
    },
  )

  test('a nota pendente casa os vínculos de lote e de NFS-e pela mesma empresa da nota', () => {
    const query = toSql(buildPendingDocumentFilters(COMPANY_ID))
    expect(query.sql).toContain('"nfe_documents"."company_id" = $1')
    expect(query.sql).toContain(
      '"cte_batch_item_documents"."company_id" = "nfe_documents"."company_id"',
    )
    expect(query.sql).toContain(
      '"nfse_service_invoice_documents"."company_id" = "nfe_documents"."company_id"',
    )
    expect(query.sql).toContain(
      '"cte_batches"."company_id" = "cte_batch_item_documents"."company_id"',
    )
  })

  test('o emitente é lido do participante da própria empresa', () => {
    const query = toSql(buildEmitterParticipantFilters(COMPANY_ID))
    expect(query.sql).toContain('"nfe_participants"."company_id" = $1')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('as viagens recentes são da empresa', () => {
    const query = toSql(buildRecentTripFilters({ companyId: COMPANY_ID, since: new Date(0) }))
    expect(query.sql).toContain('"trips"."company_id" = $1')
    expect(query.params[0]).toBe(COMPANY_ID)
  })

  test('a versão do perfil NFS-e é lida na empresa do contexto', () => {
    const query = toSql(
      buildNfseProfileVersionFilters({ companyId: COMPANY_ID, profileIds: ['p'] }),
    )
    expect(query.sql).toContain('"nfse_emission_profiles"."company_id" = $1')
    expect(query.params[0]).toBe(COMPANY_ID)
  })
})
