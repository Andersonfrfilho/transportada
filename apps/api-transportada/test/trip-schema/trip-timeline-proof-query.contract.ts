/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 T2.1 (D1-D3, D9, CA06): o SQL da foto do canhoto na linha do tempo. Lê a fonte, no molde de
 * `trip-timeline-query-tenant-safety.contract.ts`: tenant em toda tabela, `'photo'` literal (o índice
 * único parcial só se prova com literal), filtro de nota estrito, a MESMA expressão de instante no
 * filtro, na ordem e na chave em texto, e nenhuma coluna de pessoa ou de objeto.
 */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import { EVENT_LOCATION_READERS } from '../../src/trips/application/event-location-readers.constant.js'

const PROOF_PATH = 'trips/infrastructure/trip-timeline-proof.query.ts'
const PROOF_SOURCE = readFileSync(new URL(`../../src/${PROOF_PATH}`, import.meta.url), 'utf8')
const ORCHESTRATOR_SOURCE = readFileSync(
  new URL('../../src/trips/infrastructure/trip-timeline.query.ts', import.meta.url),
  'utf8',
)
const HELPER_SOURCE = readFileSync(
  new URL('../../src/trips/infrastructure/trip-timeline-condition.helper.ts', import.meta.url),
  'utf8',
)

describe('SQL da foto do canhoto na linha do tempo (spec 228 T2.1)', () => {
  test('o tenant ancora a prova, a parada e cada junção', () => {
    expect(PROOF_SOURCE).toContain('eq(tripDeliveryProofs.companyId, params.companyId)')
    expect(PROOF_SOURCE).toContain('eq(tripStops.companyId, params.companyId)')
    expect(PROOF_SOURCE).toContain('eq(tripStops.tripId, params.tripId)')
    const joins = PROOF_SOURCE.match(/\.(?:inner|left)Join\(/gu) ?? []
    const scopedJoins =
      PROOF_SOURCE.match(/\.(?:inner|left)Join\(\s*\w+,\s*and\(\s*eq\(\w+\.companyId,/gu) ?? []
    const actorProfileJoins = PROOF_SOURCE.match(/\.leftJoin\(timelineActorProfile, eq\(/gu) ?? []
    const geocodedAddressJoins =
      PROOF_SOURCE.match(
        /\.leftJoin\(geocodedAddresses, eq\(geocodedAddresses\.addressKey, tripStops\.addressKey\)\)/gu,
      ) ?? []
    expect(joins.length).toBeGreaterThanOrEqual(6)
    expect(scopedJoins.length + actorProfileJoins.length + geocodedAddressJoins.length).toBe(
      joins.length,
    )
  })

  test('as junções de evento, nota e membro usam company_id nas duas pontas', () => {
    expect(PROOF_SOURCE).toContain('eq(tripStopEvents.companyId, tripDeliveryProofs.companyId)')
    expect(PROOF_SOURCE).toContain('eq(tripDocuments.companyId, tripStopEvents.companyId)')
    expect(PROOF_SOURCE).toContain('eq(nfeDocuments.companyId, tripStopEvents.companyId)')
    expect(PROOF_SOURCE).toContain(
      'eq(timelineActorMembership.companyId, tripDeliveryProofs.companyId)',
    )
  })

  test("o tipo é o literal 'photo' em SQL cru, não um parâmetro (casa o índice parcial)", () => {
    expect(PROOF_SOURCE).toContain("= 'photo'")
    expect(PROOF_SOURCE).not.toContain('eq(tripDeliveryProofs.kind')
  })

  test('o filtro por nota é estrito, sem ramo is null, e limitado à parada da nota', () => {
    expect(PROOF_SOURCE).toContain('eq(tripStopEvents.tripDocumentId, params.documentId)')
    expect(PROOF_SOURCE).not.toContain('isNull(')
    expect(PROOF_SOURCE).toContain('documentStopScope(params)')
  })

  test('uma só expressão de instante, usada no filtro, na ordem e na chave em texto', () => {
    const definitions = PROOF_SOURCE.match(/coalesce\(/gu) ?? []
    expect(definitions).toHaveLength(1)
    expect(PROOF_SOURCE).toContain('timelineKeysetCondition(\n        PHOTO_INSTANT,')
    expect(PROOF_SOURCE).toContain('timelineOrderExpression(PHOTO_INSTANT')
    expect(PROOF_SOURCE).toContain('formatTimelineTimestampKey(PHOTO_INSTANT)')
  })

  test('a prioridade é a constante do kind e o erro de fonte não é engolido', () => {
    expect(PROOF_SOURCE).toContain("constantPriority('document.canhoto_photo')")
    expect(PROOF_SOURCE).not.toMatch(/\bcatch\b/u)
    expect(PROOF_SOURCE).not.toContain('allSettled')
  })

  test('colunas de pessoa, de objeto e de leitura do canhoto não aparecem (CA06)', () => {
    for (const forbidden of [
      'receiverName',
      'receivedBy',
      'receivedByDetail',
      'receiverDocument',
      'objectId',
      'thumbnailObjectId',
      'canhotoRead',
      'canhotoReview',
      'attachmentKey',
    ]) {
      expect(PROOF_SOURCE).not.toContain(`tripDeliveryProofs.${forbidden}`)
    }
    expect(PROOF_SOURCE).not.toMatch(/\.select\(\s*\)/u)
  })

  test('a fonte entra no Promise.all do orquestrador', () => {
    expect(ORCHESTRATOR_SOURCE).toContain('listCanhotoPhotoRows(queryable, params)')
  })

  test('formatTimelineTimestampKey aceita expressão e a parentesiza', () => {
    expect(HELPER_SOURCE).toContain("to_char((${expression}) at time zone 'UTC'")
  })

  test('a fonte está na lista fechada de leitores com as cinco colunas e um motivo (D9)', () => {
    const reader = EVENT_LOCATION_READERS.find((entry) => entry.path === PROOF_PATH)
    expect(reader?.columns).toEqual([
      'accuracyMeters',
      'capturedAt',
      'latitude',
      'locationState',
      'longitude',
    ])
    expect(reader?.reason.trim()).not.toBe('')
  })

  test('a fonte referencia as cinco colunas de posição da tabela, que a lista autoriza', () => {
    for (const column of [
      'accuracyMeters',
      'capturedAt',
      'latitude',
      'locationState',
      'longitude',
    ]) {
      expect(PROOF_SOURCE).toContain(`tripDeliveryProofs.${column}`)
    }
  })
})
