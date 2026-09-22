/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 D11 e aceite 14: sem `fleet.read`, o detalhe da viagem traz o motorista pelo nome e só.
 * CPF, e-mail e telefone saem `null`, e o CPF da fixture não aparece em lugar nenhum do corpo.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseData,
  tripDetailPath,
  TRIP_DETAIL,
} from '../fixtures/trip-http-payload.fixture'
import { createTripHttpFixture, READ_ONLY_PERMISSIONS } from '../fixtures/trip-http.fixture'

const FINANCE_PERMISSIONS = new Set(['trip.financials', 'trip.report-on-behalf'] as const)

type DriverLine = {
  readonly driverEmail: null | string
  readonly driverId: string
  readonly driverName: string
  readonly driverPhone: null | string
  readonly driverTaxId: null | string
}

describe('GET /trips/:id recorta a ficha do motorista sem fleet.read (spec 156 D11)', () => {
  test('o finance recebe 200 com nome e sem CPF, e-mail e telefone', async () => {
    const fixture = await createTripHttpFixture({ permissions: FINANCE_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(200)
    const data = await responseData<{ readonly drivers: readonly DriverLine[] }>(response)
    expect(data.drivers.map((driver) => driver.driverName)).toEqual([
      'Motorista Um',
      'Motorista Dois',
    ])
    for (const driver of data.drivers) {
      expect(driver.driverTaxId).toBeNull()
      expect(driver.driverEmail).toBeNull()
      expect(driver.driverPhone).toBeNull()
    }
  })

  test('aceite 14: o CPF da fixture não aparece em lugar nenhum do JSON', async () => {
    const fixture = await createTripHttpFixture({ permissions: FINANCE_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))
    const body = await response.text()

    for (const driver of TRIP_DETAIL.drivers) {
      expect(body).not.toContain(driver.driverTaxId)
      if (driver.driverEmail !== '') expect(body).not.toContain(driver.driverEmail)
      if (driver.driverPhone !== '') expect(body).not.toContain(driver.driverPhone)
    }
  })

  test('com fleet.read a ficha sai como antes', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(200)
    const data = await responseData<{ readonly drivers: readonly DriverLine[] }>(response)
    expect(data.drivers[0]?.driverTaxId).toBe('11111111111')
    expect(data.drivers[0]?.driverEmail).toBe('motorista.um@empresa.test')
  })

  test('sem fleet.read nem trip.report-on-behalf continua 403', async () => {
    const fixture = await createTripHttpFixture({ permissions: new Set(['trip.financials']) })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(403)
  })
})
