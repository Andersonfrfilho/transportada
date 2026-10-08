/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 T3.1 (D4, D7, D8): o mapeamento da correção do endereço da parada para o item da linha do
 * tempo — origem, deslocamento, ponto novo e a ausência de qualquer texto de endereço ou de pessoa. Sem banco.
 */
import { describe, expect, test } from 'bun:test'

import { createReadTripTimelineUseCase } from '../../src/trips/application/read-trip-timeline.use-case.js'
import type { ReadTripTimelineResult } from '../../src/trips/application/trip-timeline.types.js'
import { toAddressCorrectedTimelineRow } from '../../src/trips/infrastructure/trip-timeline-address.query.js'
import type { AddressCorrectionQueryRow } from '../../src/trips/infrastructure/trip-timeline-address.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const TRIP_ID = '00000000-0000-4000-8000-000000000101'
const CREATED_AT = new Date('2026-10-01T10:00:00.000Z')

function makeRow(overrides: Partial<AddressCorrectionQueryRow> = {}): AddressCorrectionQueryRow {
  return {
    actorName: 'Usuária Escritório',
    createdAt: CREATED_AT,
    id: '00000000-0000-4000-8000-0000000000c1',
    isSystemActor: false,
    newLatitude: '-23.5505000',
    newLongitude: '-46.6334000',
    occurredAtKey: '2026-10-01T10:00:00.000000Z',
    origin: 'operator',
    previousLatitude: '-23.5505000',
    previousLongitude: '-46.6333000',
    stopId: '00000000-0000-4000-8000-0000000000a1',
    stopSequence: 2n,
    ...overrides,
  }
}

const REFINEMENT_ROW = makeRow({
  newLatitude: null,
  newLongitude: null,
  origin: 'refinement',
  previousLatitude: null,
  previousLongitude: null,
})

describe('toAddressCorrectedTimelineRow (spec 228 T3.1)', () => {
  test('o kind é stop.address_corrected, da parada, sem nota, canal nem estado de posição', () => {
    const row = toAddressCorrectedTimelineRow(makeRow())
    expect(row.kind).toBe('stop.address_corrected')
    expect(row.stop).toEqual({ id: '00000000-0000-4000-8000-0000000000a1', sequence: 2 })
    expect(row.document).toBeNull()
    expect(row.channel).toBeNull()
    expect(row.locationState).toBeNull()
    expect(row.lateRegistration).toBe(false)
    expect(row.recordedAt).toBeNull()
    expect(row.occurrence).toBeNull()
    expect(row.onBehalfOfDriverName).toBeNull()
    expect(row.actorName).toBe('Usuária Escritório')
  })

  test('o instante é o created_at da correção e a chave em texto vem da consulta', () => {
    const row = toAddressCorrectedTimelineRow(makeRow())
    expect(row.occurredAt).toEqual(CREATED_AT)
    expect(row.occurredAtKey).toBe('2026-10-01T10:00:00.000000Z')
  })

  test.each(['contractor', 'driver', 'operator', 'refinement'] as const)(
    'addressChange.origin repassa a origem %s',
    (origin) => {
      expect(toAddressCorrectedTimelineRow(makeRow({ origin })).addressChange?.origin).toBe(origin)
    },
  )

  test('o deslocamento é a distância entre o ponto anterior e o novo, arredondada em metros', () => {
    const change = toAddressCorrectedTimelineRow(makeRow()).addressChange
    expect(change?.displacementMeters).toBe(10)
    expect(Number.isInteger(change?.displacementMeters)).toBe(true)
  })

  test('sem ponto anterior o deslocamento é null e o ponto novo continua saindo', () => {
    const row = toAddressCorrectedTimelineRow(
      makeRow({ previousLatitude: null, previousLongitude: null }),
    )
    expect(row.addressChange?.displacementMeters).toBeNull()
    expect(row.location?.latitude).toBe(-23.5505)
  })

  test('o ponto novo sai com precisão null, distância null e o instante da correção', () => {
    const location = toAddressCorrectedTimelineRow(makeRow()).location
    expect(location).toEqual({
      accuracyMeters: null,
      capturedAt: CREATED_AT.toISOString(),
      distanceMeters: null,
      latitude: -23.5505,
      longitude: -46.6334,
    })
  })

  test('o refino não guarda ponto: location null e deslocamento null, com a origem refinement', () => {
    const row = toAddressCorrectedTimelineRow(REFINEMENT_ROW)
    expect(row.location).toBeNull()
    expect(row.addressChange).toEqual({ displacementMeters: null, origin: 'refinement' })
  })

  test('addressChange carrega só origem e deslocamento, e o item não leva texto de endereço nem de pessoa', () => {
    const row = toAddressCorrectedTimelineRow(makeRow())
    expect(Object.keys(row.addressChange ?? {}).sort()).toEqual(['displacementMeters', 'origin'])
    const body = JSON.stringify(row)
    for (const forbidden of [
      'reason',
      'requestedBy',
      'addressKey',
      'address_key',
      'previousLatitude',
      'previousLongitude',
      'newSource',
      'newPrecision',
    ]) {
      expect(body).not.toContain(forbidden)
    }
  })
})

describe('recorte de posição do kind stop.address_corrected (spec 228 T3.1, CA05)', () => {
  test('sem trip.event-location o ponto some e o deslocamento fica; com ela, o ponto', async () => {
    const corrected = toAddressCorrectedTimelineRow(makeRow())
    const result: ReadTripTimelineResult = {
      items: [{ ...corrected, occurredAt: corrected.occurredAt.toISOString(), recordedAt: null }],
      nextCursor: null,
    }
    const useCase = createReadTripTimelineUseCase({
      existence: {
        findTripCompanyScope: async () => ({ id: TRIP_ID }),
        findTripDocumentScope: async () => null,
      },
      reader: { listTripTimeline: async () => result },
    })
    const base = { context: { companyId: COMPANY_ID }, cursor: null, limit: 100, tripId: TRIP_ID }

    const cut = await useCase.execute({ ...base, canReadEventLocation: false })
    expect(cut.items[0]?.location).toBeNull()
    expect(cut.items[0]?.addressChange).toEqual({ displacementMeters: 10, origin: 'operator' })

    const full = await useCase.execute({ ...base, canReadEventLocation: true })
    expect(full.items[0]?.location?.latitude).toBe(-23.5505)
  })
})
