/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 081 (RF-7): o vínculo da empresa inteiro, em pares. O diálogo da sugestão multi-veículo
 * precisa saber, para **qualquer** veículo e **qualquer** motorista, quem está amarrado a quem —
 * e a rota por motorista (`/fleet/drivers/:id/vehicles`) resolveria isso com uma requisição por
 * motorista escolhido.
 */
import { describe, expect, test } from 'bun:test'

import {
  DRIVER_ID,
  DRIVER_OWNED_VEHICLE_ID,
  jsonRequest,
  responseData,
  VEHICLE_ID,
} from '../fixtures/fleet-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createFleetHttpFixture,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/fleet-http.fixture'

const DRIVER_VEHICLE_LINKS_PATH = '/fleet/driver-vehicles'

type Pair = Readonly<{ driverId: string; vehicleId: string }>

describe('fleet driver vehicle links http contract', () => {
  test('lists every live link of the company as pairs', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: DRIVER_VEHICLE_LINKS_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData<readonly Pair[]>(response)).toEqual([
      { driverId: DRIVER_ID, vehicleId: VEHICLE_ID },
      { driverId: DRIVER_ID, vehicleId: DRIVER_OWNED_VEHICLE_ID },
    ])
    expect(fixture.listDriverVehicleLinkCalls).toEqual([{ context: COMPANY_CONTEXT }])
  })

  /**
   * `fleet.read`, não `fleet.manage`: quem monta a viagem escolhe motorista e veículo sem
   * administrar a frota — é a mesma razão pela qual a aba Regiões lê com `fleet.read`.
   */
  test('reading the links only needs fleet.read', async () => {
    const fixture = await createFleetHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: DRIVER_VEHICLE_LINKS_PATH }),
    )

    expect(response.status).toBe(200)
  })

  /** O par não carrega nada além dos dois ids: o resto já vem das listagens de frota. */
  test('the pair carries the two identifiers and nothing else', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: DRIVER_VEHICLE_LINKS_PATH }),
    )

    const [first] = await responseData<readonly Pair[]>(response)
    expect(Object.keys(first ?? {}).sort()).toEqual(['driverId', 'vehicleId'])
  })
})
