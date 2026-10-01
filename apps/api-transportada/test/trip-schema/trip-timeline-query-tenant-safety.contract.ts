/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5, aceite 5 (T9 correção do orquestrador): a linha do tempo une sete consultas (spec 171
 * acrescenta `listCreatedRows`), e cada degrau tem de carregar o tenant — o mesmo cuidado de
 * `occurrence-feed-query-tenant-safety.contract.ts`, no mesmo molde: lê a fonte, porque uma
 * assinatura que aceitasse junção simples compilaria e passaria em todo teste de caminho feliz. As
 * sete consultas hoje moram em quatro arquivos (orquestrador + status + stop + document); este
 * contrato varre todos — arquivo novo que escape dele não é pego por nenhum outro teste.
 */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

const TIMELINE_SOURCE_FILES = [
  '../../src/trips/infrastructure/trip-timeline.query.ts',
  '../../src/trips/infrastructure/trip-timeline-status.query.ts',
  '../../src/trips/infrastructure/trip-timeline-stop.query.ts',
  '../../src/trips/infrastructure/trip-timeline-document.query.ts',
] as const

const QUERY_SOURCE = TIMELINE_SOURCE_FILES.map((path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8'),
).join('\n')

describe('tenant safety da linha do tempo da viagem (spec 158 T5)', () => {
  test('as sete consultas ancoram a empresa no where', () => {
    expect(QUERY_SOURCE).toContain('eq(tripDispatchSnapshots.companyId, params.companyId)')
    expect(QUERY_SOURCE).toContain('eq(tripStatusEvents.companyId, params.companyId)')
    expect(QUERY_SOURCE).toContain('eq(tripStopEvents.companyId, params.companyId)')
    expect(QUERY_SOURCE).toContain('eq(tripStopOccurrences.companyId, params.companyId)')
    expect(QUERY_SOURCE).toContain('eq(tripDocumentOccurrences.companyId, params.companyId)')
    expect(QUERY_SOURCE).toContain('eq(tripDocumentEvents.companyId, params.companyId)')
  })

  test('trip_stop_events entra pela viagem via trip_stops, nunca sem tripId', () => {
    expect(QUERY_SOURCE).toContain('eq(tripStops.tripId, params.tripId)')
  })

  test('cada junção carrega o companyId — nunca só o id', () => {
    const joins = QUERY_SOURCE.match(/\.(?:inner|left)Join\(/gu) ?? []
    const scopedJoins =
      QUERY_SOURCE.match(/\.(?:inner|left)Join\(\s*\w+,\s*and\(\s*eq\(\w+\.companyId,/gu) ?? []
    // Mesma exceção do feed (D3/T9 da spec 156): `identity_user_profiles` não tem `company_id` — é
    // global, por `user_id` — e só entra depois da junção com `userCompanyMemberships`, já escopada.
    const actorProfileJoins = QUERY_SOURCE.match(/\.leftJoin\(timelineActorProfile, eq\(/gu) ?? []
    // Emenda spec 196 T4.1: `geocoded_addresses` também não tem `company_id` (ADR-0044 §5 — a
    // coordenada de um endereço não é de ninguém). Só entra casada pela `address_key` de `trip_stops`,
    // que já está escopada pela empresa, e o teste abaixo trava essa âncora.
    const geocodedAddressJoins =
      QUERY_SOURCE.match(
        /\.leftJoin\(geocodedAddresses, eq\(geocodedAddresses\.addressKey, tripStops\.addressKey\)\)/gu,
      ) ?? []
    expect(joins.length).toBeGreaterThan(0)
    expect(scopedJoins.length + actorProfileJoins.length + geocodedAddressJoins.length).toBe(
      joins.length,
    )
  })

  test('a coordenada de referência só é lida pela address_key da parada da própria viagem', () => {
    expect(QUERY_SOURCE).toContain('eq(geocodedAddresses.addressKey, tripStops.addressKey)')
    expect(QUERY_SOURCE).toContain('tripStopEvents.latitude')
    expect(QUERY_SOURCE).toContain('tripStopEvents.locationState')
  })

  test('D3/ADR-0068 §4: trip_document_events com driver_app sai como channel null, sem reescrita', () => {
    expect(QUERY_SOURCE).toContain(
      'row.channel === TRIP_FIELD_CHANNELS.driverApp ? null : row.channel',
    )
  })
})
