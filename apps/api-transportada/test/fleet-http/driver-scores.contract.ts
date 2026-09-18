/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 157 RF10 (T8), aceite 6: a nota na listagem da frota e a rota da ficha com as penalidades.
 * Leitura de `fleet.read`, como a listagem; motorista inexistente ou de outra empresa é 404; a
 * resposta nunca carrega posição — só motivo, pontos e datas.
 */
import { describe, expect, test } from 'bun:test'

import { FleetDriverNotFoundError } from '../../src/fleet/domain/fleet.error.js'
import {
  DRIVER,
  DRIVER_ID,
  FLEET_DRIVERS_PATH,
  jsonRequest,
  responseApiError,
} from '../fixtures/fleet-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createFleetHttpFixture,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/fleet-http.fixture'

const DRIVER_SCORE_PATH = `${FLEET_DRIVERS_PATH}/${DRIVER_ID}/score`

describe('fleet driver score http contract (spec 157 T8)', () => {
  test('lists each driver with its score', async () => {
    const fixture = await createFleetHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: FLEET_DRIVERS_PATH }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [{ ...DRIVER, score: 85 }],
      page: { nextCursor: null },
    })
  })

  test('reads the score and the penalties with fleet.read', async () => {
    const fixture = await createFleetHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: DRIVER_SCORE_PATH }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      data: {
        penalties: [
          {
            deliveredAt: '2026-09-17T11:00:00.000Z',
            documentNumber: '1234',
            expiresAt: '2026-12-16T11:00:00.000Z',
            points: 10,
            reason: 'missing_proof',
            tripDocumentId: '00000000-0000-4000-8000-0000000000e1',
          },
        ],
        score: 90,
      },
    })
    expect(fixture.driverScoreCalls).toEqual([
      { context: { ...COMPANY_CONTEXT, permissions: READ_ONLY_PERMISSIONS }, driverId: DRIVER_ID },
    ])
  })

  test('answers 404 for a driver outside the company', async () => {
    const fixture = await createFleetHttpFixture({
      driverScoreError: new FleetDriverNotFoundError(),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: DRIVER_SCORE_PATH }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_NOT_FOUND')
  })

  // O roteador exige UUID canônico no `:id` e responde 404 antes de qualquer leitura
  test('answers 404 for an identifier that is not a uuid, before reading anything', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${FLEET_DRIVERS_PATH}/not-a-uuid/score` }),
    )

    expect(response.status).toBe(404)
    expect(fixture.driverScoreCalls).toEqual([])
  })

  test('refuses a context without fleet.read', async () => {
    const fixture = await createFleetHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: DRIVER_SCORE_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.driverScoreCalls).toEqual([])
  })
})
