/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 T2.1 (D1, D2, D7): o mapeamento da foto do canhoto para o item da linha do tempo — instante,
 * ponto, distância e estado — e o recorte de posição do caso de uso para o `kind` novo. Sem banco.
 */
import { describe, expect, test } from 'bun:test'

import { createReadTripTimelineUseCase } from '../../src/trips/application/read-trip-timeline.use-case.js'
import type { ReadTripTimelineResult } from '../../src/trips/application/trip-timeline.types.js'
import { toCanhotoPhotoTimelineRow } from '../../src/trips/infrastructure/trip-timeline-proof.query.js'
import type { CanhotoPhotoQueryRow } from '../../src/trips/infrastructure/trip-timeline-proof.query.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const TRIP_ID = '00000000-0000-4000-8000-000000000101'
const CAPTURED_AT = new Date('2026-10-01T10:00:00.000Z')
const CREATED_AT = new Date('2026-10-01T10:00:09.000Z')

function makeRow(overrides: Partial<CanhotoPhotoQueryRow> = {}): CanhotoPhotoQueryRow {
  return {
    accuracyMeters: '12.50',
    actorName: 'Usuária Escritório',
    capturedAt: CAPTURED_AT,
    channel: 'driver_app',
    createdAt: CREATED_AT,
    documentId: '00000000-0000-4000-8000-0000000000d1',
    id: '00000000-0000-4000-8000-0000000000f1',
    invoiceNumber: '9000',
    invoiceSeries: '1',
    lateRegistration: false,
    latitude: '-23.5505000',
    locationState: 'captured',
    longitude: '-46.6334000',
    occurredAtKey: '2026-10-01T10:00:00.000000Z',
    onBehalfOfDriverName: null,
    referenceLatitude: '-23.5505000',
    referenceLongitude: '-46.6333000',
    stopId: '00000000-0000-4000-8000-0000000000a1',
    stopSequence: 1n,
    ...overrides,
  }
}

describe('toCanhotoPhotoTimelineRow (spec 228 T2.1)', () => {
  test('o instante é o captured_at do aparelho quando existe', () => {
    expect(toCanhotoPhotoTimelineRow(makeRow()).occurredAt).toEqual(CAPTURED_AT)
  })

  test('sem captured_at o instante é o created_at, e o ponto leva o mesmo instante', () => {
    const row = toCanhotoPhotoTimelineRow(makeRow({ capturedAt: null }))
    expect(row.occurredAt).toEqual(CREATED_AT)
    expect(row.location?.capturedAt).toBe(CREATED_AT.toISOString())
  })

  test('o kind, o documento e a parada saem como na baixa', () => {
    const row = toCanhotoPhotoTimelineRow(makeRow())
    expect(row.kind).toBe('document.canhoto_photo')
    expect(row.document).toEqual({
      id: '00000000-0000-4000-8000-0000000000d1',
      number: '9000',
      series: '1',
    })
    expect(row.stop).toEqual({ id: '00000000-0000-4000-8000-0000000000a1', sequence: 1 })
  })

  test('com latitude e longitude o ponto sai com precisão e distância arredondada à parada', () => {
    const location = toCanhotoPhotoTimelineRow(makeRow()).location
    expect(location?.latitude).toBe(-23.5505)
    expect(location?.longitude).toBe(-46.6334)
    expect(location?.accuracyMeters).toBe(12.5)
    expect(location?.distanceMeters).toBe(10)
  })

  test('sem ponto de referência da parada a distância é null', () => {
    const location = toCanhotoPhotoTimelineRow(
      makeRow({ referenceLatitude: null, referenceLongitude: null }),
    ).location
    expect(location?.distanceMeters).toBeNull()
  })

  test('location só existe com latitude E longitude', () => {
    expect(toCanhotoPhotoTimelineRow(makeRow({ latitude: null })).location).toBeNull()
    expect(toCanhotoPhotoTimelineRow(makeRow({ longitude: null })).location).toBeNull()
  })

  test('o estado do ponto é repassado, inclusive unavailable, expired e nulo', () => {
    for (const state of ['unavailable', 'expired', 'captured'] as const) {
      const row = toCanhotoPhotoTimelineRow(
        makeRow({ latitude: null, locationState: state, longitude: null }),
      )
      expect(row.locationState).toBe(state)
    }
    const old = toCanhotoPhotoTimelineRow(
      makeRow({ latitude: null, locationState: null, longitude: null }),
    )
    expect(old.locationState).toBeNull()
  })

  test('o item não carrega addressChange (a chave só existe no kind do endereço)', () => {
    expect('addressChange' in toCanhotoPhotoTimelineRow(makeRow())).toBe(false)
  })

  test('canal, ator, registro tardio e motorista em nome de quem passam como nas fontes vizinhas', () => {
    const row = toCanhotoPhotoTimelineRow(
      makeRow({ lateRegistration: true, onBehalfOfDriverName: 'Motorista Um' }),
    )
    expect(row.channel).toBe('driver_app')
    expect(row.actorName).toBe('Usuária Escritório')
    expect(row.lateRegistration).toBe(true)
    expect(row.onBehalfOfDriverName).toBe('Motorista Um')
    expect(row.occurrence).toBeNull()
  })

  test('a chave de ordenação em texto vem da consulta, não do Date', () => {
    expect(toCanhotoPhotoTimelineRow(makeRow()).occurredAtKey).toBe('2026-10-01T10:00:00.000000Z')
  })

  test('canal do escritório com foto registrada tarde traz recordedAt', () => {
    const lateCreatedAt = new Date('2026-10-01T10:05:00.000Z')
    const row = toCanhotoPhotoTimelineRow(makeRow({ channel: 'office', createdAt: lateCreatedAt }))
    expect(row.recordedAt).toEqual(lateCreatedAt)
    expect(toCanhotoPhotoTimelineRow(makeRow({ channel: 'office' })).recordedAt).toBeNull()
    expect(
      toCanhotoPhotoTimelineRow(makeRow({ channel: 'driver_app', createdAt: lateCreatedAt }))
        .recordedAt,
    ).toBeNull()
  })
})

describe('recorte de posição do kind document.canhoto_photo (spec 228 T2.1, RF5)', () => {
  test('sem trip.event-location: location null e locationState mantido; com ela, o ponto', async () => {
    const photo = toCanhotoPhotoTimelineRow(makeRow())
    const result: ReadTripTimelineResult = {
      items: [{ ...photo, occurredAt: photo.occurredAt.toISOString(), recordedAt: null }],
      nextCursor: null,
    }
    const useCase = createReadTripTimelineUseCase({
      existence: {
        findTripCompanyScope: async () => ({ id: TRIP_ID }),
        findTripDocumentScope: async () => null,
      },
      reader: { listTripTimeline: async () => result },
    })
    const base = {
      context: { companyId: COMPANY_ID },
      cursor: null,
      limit: 100,
      tripId: TRIP_ID,
    }

    const cut = await useCase.execute({ ...base, canReadEventLocation: false })
    expect(cut.items[0]?.location).toBeNull()
    expect(cut.items[0]?.locationState).toBe('captured')

    const full = await useCase.execute({ ...base, canReadEventLocation: true })
    expect(full.items[0]?.location).not.toBeNull()
  })
})
