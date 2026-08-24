/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_ID,
  TRIPS_PATH,
  TRIP_PAGE,
  VEHICLE_ID,
  jsonRequest,
} from '../fixtures/trip-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  READ_ONLY_PERMISSIONS,
  createTripHttpFixture,
} from '../fixtures/trip-http.fixture'

describe('GET /trips', () => {
  test('lists the trips of the company with the page cursor', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: TRIPS_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [...TRIP_PAGE.items],
      page: { nextCursor: TRIP_PAGE.nextCursor },
    })
    expect(fixture.listTripsCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: READ_ONLY_PERMISSIONS },
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
})
