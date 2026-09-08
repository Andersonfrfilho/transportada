/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { jsonRequest, responseData } from '../fixtures/fleet-http-payload.fixture.js'
import { READ_ONLY_PERMISSIONS } from '../fixtures/fleet-http.fixture.js'
import { createVehicleReferenceHttpFixture } from '../fixtures/vehicle-reference-http.fixture.js'

const REFERENCES_PATH = '/fleet/vehicle-references'

describe('vehicle reference http contract', () => {
  /**
   * ⚠️ `fleet.read` sozinho basta: quem cadastra veículo é quem precisa da sugestão. Exigir
   * `settings.manage` faria a ficha abrir vazia para o operador que a preenche todo dia.
   */
  test('serves the market catalogue to a caller with fleet.read alone', async () => {
    const fixture = await createVehicleReferenceHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: REFERENCES_PATH }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([
      {
        bodyType: '02',
        cargoHeightM: '2.150',
        cargoLengthM: '4.200',
        cargoWidthM: '2.100',
        maxPayloadKg: '1500.000',
        vehicleType: 'vuc',
      },
      {
        bodyType: '02',
        cargoHeightM: '2.700',
        cargoLengthM: '14.270',
        cargoWidthM: '2.460',
        maxPayloadKg: null,
        vehicleType: '',
      },
    ])
  })

  /**
   * A carga ausente atravessa como `null`, nunca como zero nem omitida: o cliente lê "o mercado não
   * publica" e deixa o campo em branco. Um zero aqui viraria uma sugestão de carga zerada na ficha.
   */
  test('keeps an absent payload null instead of collapsing it to zero', async () => {
    const fixture = await createVehicleReferenceHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: REFERENCES_PATH }))
    const data = (await responseData(response)) as readonly { maxPayloadKg: unknown }[]

    expect(data[1]?.maxPayloadKg).toBeNull()
  })

  test('rejects a caller without fleet.read', async () => {
    const fixture = await createVehicleReferenceHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: REFERENCES_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.listCalls).toBe(0)
  })
})
