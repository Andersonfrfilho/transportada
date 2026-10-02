/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 T3.1 (D4, D5, D7, CA06): o SQL do endereço corrigido na linha do tempo. Lê a fonte: tenant em
 * ambas as trilhas e na parada, só refino `refined`, só correção a partir da criação da parada, `distinct on`
 * em subselect, nenhuma leitura da tabela global de geocodificação e nenhuma coluna de texto livre.
 */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import { EVENT_LOCATION_READERS } from '../../src/trips/application/event-location-readers.constant.js'

const ADDRESS_PATH = 'trips/infrastructure/trip-timeline-address.query.ts'
const ADDRESS_SOURCE = readFileSync(new URL(`../../src/${ADDRESS_PATH}`, import.meta.url), 'utf8')
const ORCHESTRATOR_SOURCE = readFileSync(
  new URL('../../src/trips/infrastructure/trip-timeline.query.ts', import.meta.url),
  'utf8',
)
const STOP_SOURCE = readFileSync(
  new URL('../../src/trips/infrastructure/trip-timeline-stop.query.ts', import.meta.url),
  'utf8',
)

describe('SQL do endereço corrigido na linha do tempo (spec 228 T3.1)', () => {
  test('a empresa ancora as duas trilhas, a parada e o membro do ator', () => {
    const companyFilters = ADDRESS_SOURCE.match(/company_id = \$\{params\.companyId\}/gu) ?? []
    expect(companyFilters.length).toBeGreaterThanOrEqual(4)
    expect(ADDRESS_SOURCE).toMatch(
      /from geocoded_address_corrections\s+where company_id = \$\{params\.companyId\}/u,
    )
    expect(ADDRESS_SOURCE).toMatch(
      /from geocoding_refinement_requests\s+where company_id = \$\{params\.companyId\}/u,
    )
    expect(ADDRESS_SOURCE).toMatch(
      /where trip_stops\.company_id = \$\{params\.companyId\}\s+and trip_stops\.trip_id = \$\{params\.tripId\}/u,
    )
    expect(ADDRESS_SOURCE).toMatch(
      /left join user_company_memberships[^\n]*\n?[^\n]*company_id = \$\{params\.companyId\}/u,
    )
  })

  test("só o refino 'refined' entra, e só a correção feita a partir da criação da parada", () => {
    expect(ADDRESS_SOURCE).toContain("outcome = 'refined'")
    expect(ADDRESS_SOURCE).toContain('changes.created_at >= trip_stops.created_at')
  })

  test('as duas trilhas viram uma só consulta (union all), com os tipos fixados', () => {
    expect(ADDRESS_SOURCE.match(/union all/gu) ?? []).toHaveLength(1)
    expect(ADDRESS_SOURCE).toContain("'refinement'::text")
    expect(ADDRESS_SOURCE).toContain('null::numeric')
    expect(ADDRESS_SOURCE.match(/queryable\.execute/gu) ?? []).toHaveLength(1)
  })

  test('o distinct on mora num subselect e a ordem, o keyset e o limite ficam na consulta externa', () => {
    expect(ADDRESS_SOURCE).toMatch(/select distinct on \(changes\.id\)/u)
    expect(ADDRESS_SOURCE).toMatch(/order by changes\.id, trip_stops\.sequence asc/u)
    expect(ADDRESS_SOURCE).toMatch(/\)\s+matched\b/u)
    expect(ADDRESS_SOURCE).toContain('timelineKeysetCondition(')
    expect(ADDRESS_SOURCE).toContain('timelineOrderExpression(')
    expect(ADDRESS_SOURCE).toContain('limit ${params.limit + 1}')
    const subselect = ADDRESS_SOURCE.slice(
      ADDRESS_SOURCE.indexOf('select distinct on'),
      ADDRESS_SOURCE.indexOf(' matched'),
    )
    expect(subselect).not.toContain('limit')
    expect(subselect).not.toContain('timelineKeysetCondition')
  })

  test('nenhuma leitura de geocoded_addresses: tabela global, sem empresa', () => {
    expect(ADDRESS_SOURCE).not.toContain('geocodedAddresses')
    expect(ADDRESS_SOURCE).not.toMatch(/geocoded_addresses\b/u)
    expect(ADDRESS_SOURCE).not.toMatch(/geocoding\.schema/u)
  })

  test('texto livre, procedência e chave do endereço não são selecionados (CA06)', () => {
    for (const forbidden of [
      'reason',
      'requested_by',
      'requestedBy',
      'new_source',
      'new_precision',
      'previous_source',
      'previous_precision',
    ]) {
      expect(ADDRESS_SOURCE).not.toContain(forbidden)
    }
    const selectList = ADDRESS_SOURCE.slice(
      ADDRESS_SOURCE.indexOf('select\n      matched.id'),
      ADDRESS_SOURCE.indexOf('from ('),
    )
    expect(selectList).not.toContain('address_key')
  })

  test('o filtro por nota é a parada da nota (documentStopScope), sem subselect em trip_documents', () => {
    expect(ADDRESS_SOURCE).toContain('documentStopScope(params)')
    expect(ADDRESS_SOURCE).not.toContain('trip_documents')
    expect(ADDRESS_SOURCE).not.toContain('tripDocuments')
    expect(ADDRESS_SOURCE).toMatch(/params\.documentId !== undefined/u)
    expect(STOP_SOURCE).toContain('export function documentStopScope(')
  })

  test('a prioridade é a constante do kind e o erro de fonte não é engolido', () => {
    expect(ADDRESS_SOURCE).toContain("constantPriority('stop.address_corrected')")
    expect(ADDRESS_SOURCE).not.toMatch(/\bcatch\b/u)
    expect(ADDRESS_SOURCE).not.toContain('allSettled')
  })

  test('a fonte entra no Promise.all do orquestrador', () => {
    expect(ORCHESTRATOR_SOURCE).toContain('listAddressCorrectedRows(queryable, params)')
  })

  test('o arquivo não toca as cinco tabelas de evento e, por isso, fica fora da lista de leitores', () => {
    for (const identifier of [
      'tripDeliveryProofs',
      'tripDocumentOccurrences',
      'tripStatusEvents',
      'tripStopEvents',
      'tripStopOccurrences',
    ]) {
      expect(ADDRESS_SOURCE).not.toContain(identifier)
    }
    expect(EVENT_LOCATION_READERS.some((entry) => entry.path === ADDRESS_PATH)).toBe(false)
  })
})
