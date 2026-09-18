/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 L6 (ADR-0049, spec 061 D4): a listagem de viagens publicava `amounts` — receita e soma
 * das notas — a quem só tinha `fleet.read`, inclusive `separator` e `viewer`. Sem `trip.financials`
 * o campo sai do objeto, como no detalhe (spec 153 D10): ausente, não `null`.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ROLE_PERMISSIONS } from '../../src/identity/domain/authorization.policy'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import { jsonRequest, TRIP, TRIP_PAGE, TRIPS_PATH } from '../fixtures/trip-http-payload.fixture'
import { createTripHttpFixture } from '../fixtures/trip-http.fixture'

const PRICED_TRIP_PAGE = {
  ...TRIP_PAGE,
  items: [
    {
      ...TRIP,
      amounts: {
        documentsTotal: '15000.0000',
        revenueSource: 'estimated',
        revenueTotal: '1250.0000',
      },
    },
  ],
} as const satisfies typeof TRIP_PAGE

function permissionsOf(role: keyof typeof COMPANY_ROLE_PERMISSIONS): CompanyContext['permissions'] {
  return new Set(COMPANY_ROLE_PERMISSIONS[role])
}

async function listTripsAs(
  permissions: CompanyContext['permissions'],
): Promise<readonly Record<string, unknown>[]> {
  const fixture = await createTripHttpFixture({ listTripsResult: PRICED_TRIP_PAGE, permissions })
  const response = await fixture.handle(jsonRequest({ method: 'GET', path: TRIPS_PATH }))

  expect(response.status).toBe(200)
  const body = (await response.json()) as { data: readonly Record<string, unknown>[] }
  return body.data
}

describe('GET /trips cuts amounts without trip.financials (spec 156 L6)', () => {
  for (const role of ['separator', 'viewer'] as const) {
    test(`answers ${role} without the amounts key`, async () => {
      const [trip] = await listTripsAs(permissionsOf(role))

      expect(Object.hasOwn(trip ?? {}, 'amounts')).toBe(false)
      expect(trip?.id).toBe(TRIP.id)
      expect(trip?.driverNames).toEqual(TRIP.driverNames)
    })
  }

  for (const role of ['finance', 'operator', 'company-admin'] as const) {
    test(`answers ${role} with the amounts`, async () => {
      const [trip] = await listTripsAs(permissionsOf(role))

      expect(trip?.amounts).toEqual(PRICED_TRIP_PAGE.items[0].amounts)
    })
  }
})
