/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_ID,
  TRIPS_PATH,
  TRIP_PAGE,
  TRIP_PAGE_WITH_AMOUNTS,
  VEHICLE_ID,
  jsonRequest,
} from '../fixtures/trip-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  FINANCIALS_PERMISSIONS,
  READ_ONLY_PERMISSIONS,
  createTripHttpFixture,
} from '../fixtures/trip-http.fixture'

const SECOND_VEHICLE_ID = '00000000-0000-4000-8000-000000000b12'
const SECOND_DRIVER_ID = '00000000-0000-4000-8000-000000000b13'

/** 101 ids distintos: o teto da lista é 100, e passar dele é tentativa de varrer a base. */
const TOO_MANY_VEHICLE_IDS = Array.from(
  { length: 101 },
  (_unused, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
).join(',')

describe('GET /trips', () => {
  test('lists the trips of the company with the page cursor', async () => {
    /** Com `trip.financials` a linha sai inteira; o recorte sem ela é `list-money-redaction`. */
    const fixture = await createTripHttpFixture({ permissions: FINANCIALS_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: TRIPS_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [...TRIP_PAGE.items],
      page: { nextCursor: TRIP_PAGE.nextCursor },
    })
    expect(fixture.listTripsCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: FINANCIALS_PERMISSIONS },
        cursor: null,
        limit: 25,
      },
    ])
  })

  test('forwards the filters and the paging the operator asked for', async () => {
    const fixture = await createTripHttpFixture()
    const cursor = '2026-08-04T12:00:00.000Z::00000000-0000-4000-8000-000000000a11'

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${TRIPS_PATH}?statusEq=draft&vehicleIdEq=${VEHICLE_ID}&driverIdEq=${DRIVER_ID}&createdFrom=2026-08-01T00:00:00.000Z&createdUntil=2026-08-05T00:00:00.000Z&limit=5&cursor=${encodeURIComponent(cursor)}`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listTripsCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor,
        filters: {
          createdFrom: '2026-08-01T00:00:00.000Z',
          createdUntil: '2026-08-05T00:00:00.000Z',
          driverIdEq: DRIVER_ID,
          statusEq: 'draft',
          vehicleIdEq: VEHICLE_ID,
        },
        limit: 5,
      },
    ])
  })

  /**
   * Spec 221: os três filtros da tela viraram multi-escolha. A lista vai separada por vírgula num
   * parâmetro só, no mesmo molde de `billing` — não repetindo a chave, que `readListQuery` recusa.
   */
  test('forwards the multi-choice lists the operator picked', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${TRIPS_PATH}?statusIn=draft,loading&vehicleIdIn=${VEHICLE_ID},${SECOND_VEHICLE_ID}&driverIdIn=${DRIVER_ID},${SECOND_DRIVER_ID}`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.listTripsCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        filters: {
          driverIdIn: [DRIVER_ID, SECOND_DRIVER_ID],
          statusIn: ['draft', 'loading'],
          vehicleIdIn: [VEHICLE_ID, SECOND_VEHICLE_ID],
        },
        limit: 25,
      },
    ])
  })

  /** Spec 223 RF4: o filtro "com canhoto pendente" é booleano e aceita os dois lados. */
  test('forwards proofPendingEq as a boolean, true and false', async () => {
    const fixture = await createTripHttpFixture()

    for (const value of ['true', 'false']) {
      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: `${TRIPS_PATH}?proofPendingEq=${value}` }),
      )
      expect(response.status).toBe(200)
    }

    expect(fixture.listTripsCalls.map((call) => call.filters)).toEqual([
      { proofPendingEq: true },
      { proofPendingEq: false },
    ])
  })

  test('refuses a query it does not know how to honour', async () => {
    const fixture = await createTripHttpFixture()

    for (const query of [
      '?companyId=00000000-0000-4000-8000-000000000001',
      '?statusEq=flying',
      '?limit=0',
      '?limit=101',
      '?cursor=yesterday',
      '?vehicleIdEq=not-a-uuid',
      '?driverIdEq=not-a-uuid',
      '?createdFrom=yesterday',
      // Filtro exato e lista do mesmo campo não têm resposta certa: recusar, nunca eleger um deles
      // em silêncio.
      '?statusEq=draft&statusIn=loading',
      `?vehicleIdEq=${VEHICLE_ID}&vehicleIdIn=${SECOND_VEHICLE_ID}`,
      `?driverIdEq=${DRIVER_ID}&driverIdIn=${SECOND_DRIVER_ID}`,
      // Um item podre invalida a lista inteira — devolver o resto daria menos viagens sem dizer por quê.
      '?statusIn=draft,flying',
      `?vehicleIdIn=${VEHICLE_ID},not-a-uuid`,
      '?statusIn=',
      // Repetido quase sempre é a tela montando a query errada; deduplicar esconderia o defeito.
      '?statusIn=draft,draft',
      `?vehicleIdIn=${TOO_MANY_VEHICLE_IDS}`,
      '?proofPendingEq=maybe',
      '?proofPendingEq=',
    ]) {
      const response = await fixture.handle(
        jsonRequest({ method: 'GET', path: `${TRIPS_PATH}${query}` }),
      )

      expect(response.status).toBe(400)
    }
    expect(fixture.listTripsCalls).toEqual([])
  })

  test('denies who has neither fleet.read nor fleet.manage', async () => {
    const fixture = await createTripHttpFixture({ permissions: new Set([]) })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: TRIPS_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.listTripsCalls).toEqual([])
  })

  /**
   * T707 (H3, achado anterior à 153) tirava só `documentsTotal`/`revenueTotal` de dentro de
   * `amounts`, mantendo `revenueSource` visível. `2f252a5b2` (staging, um dia depois) apertou a
   * regra para o mesmo molde da spec 153 D10: o campo **inteiro** some sem `trip.financials`, não só
   * o valor — `revenueSource` sozinho já entrega que a viagem tem receita calculada. Ver
   * `list-money-redaction.contract.ts`, que é a prova dedicada desta versão da regra.
   */
  test('cuts amounts without trip.financials', async () => {
    const fixture = await createTripHttpFixture({
      listTripsResult: TRIP_PAGE_WITH_AMOUNTS,
      permissions: READ_ONLY_PERMISSIONS,
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: TRIPS_PATH }))
    const body = (await response.json()) as { data: readonly Record<string, unknown>[] }

    expect(response.status).toBe(200)
    const [trip] = body.data
    expect(Object.hasOwn(trip ?? {}, 'amounts')).toBe(false)
  })

  test('answers with documentsTotal and revenueTotal when the caller has trip.financials', async () => {
    const fixture = await createTripHttpFixture({
      listTripsResult: TRIP_PAGE_WITH_AMOUNTS,
      permissions: FINANCIALS_PERMISSIONS,
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: TRIPS_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [...TRIP_PAGE_WITH_AMOUNTS.items],
      page: { nextCursor: TRIP_PAGE_WITH_AMOUNTS.nextCursor },
    })
  })
})
