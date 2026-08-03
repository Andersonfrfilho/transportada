/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { createFleetVehicleLookupUseCase } from '../../src/fleet/application/fleet-vehicle-lookup.use-case.js'
import type { FleetVehicleLookup } from '../../src/fleet/application/fleet.port.js'
import { normalizeVehicleLookupPayload } from '../../src/fleet/domain/vehicle-lookup-payload.policy.js'
import { ApiError } from '../../src/shared/api.error.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture'
import { FLEET_CONTEXT } from '../fixtures/fleet-application.fixture'

const EMPTY_LOOKUP: FleetVehicleLookup = {
  brand: '',
  capacityKilograms: '',
  model: '',
  modelYear: '',
  ownerName: '',
  ownerTaxId: '',
  plate: '',
  renavam: '',
  state: '',
  tareWeightKilograms: '',
}

const LOOKUP_RESULT: FleetVehicleLookup = {
  ...EMPTY_LOOKUP,
  brand: 'VOLVO',
  model: 'FH 540',
  plate: 'ABC1D23',
  renavam: '12345678901',
  state: 'SP',
}

function createGatewayStub(result: FleetVehicleLookup | null = LOOKUP_RESULT) {
  const calls: string[] = []
  return {
    calls,
    gateway: {
      async lookupByPlate(input: { readonly plate: string }): Promise<FleetVehicleLookup | null> {
        calls.push(input.plate)
        return result
      },
    },
  }
}

describe('fleet vehicle lookup payload contract', () => {
  test('reads the canonical english payload', () => {
    expect(
      normalizeVehicleLookupPayload({
        brand: 'VOLVO',
        model: 'FH 540',
        plate: 'ABC1D23',
        renavam: '12345678901',
        state: 'SP',
      }),
    ).toEqual(LOOKUP_RESULT)
  })

  // Cada serviço de consulta de placa nomeia os campos do seu jeito — o gateway é genérico por isso
  test('reads the brazilian aliases regardless of case and accents', () => {
    expect(
      normalizeVehicleLookupPayload({
        ANO_MODELO: '2021',
        CAPACIDADE_CARGA: '32000',
        MARCA: 'VOLVO',
        MODELO: 'FH 540',
        PLACA: 'abc1d23',
        RENAVAM: '123.456.789-01',
        TARA: '9000',
        UF: 'sp',
      }),
    ).toEqual({
      ...LOOKUP_RESULT,
      capacityKilograms: '32000',
      modelYear: '2021',
      tareWeightKilograms: '9000',
    })
  })

  test('unwraps the usual response envelopes', () => {
    const inner = { placa: 'ABC1D23', uf: 'SP' }
    const expected = { ...EMPTY_LOOKUP, plate: 'ABC1D23', state: 'SP' }

    expect(normalizeVehicleLookupPayload({ data: inner })).toEqual(expected)
    expect(normalizeVehicleLookupPayload({ dados: inner })).toEqual(expected)
    expect(normalizeVehicleLookupPayload({ veiculo: inner })).toEqual(expected)
    expect(normalizeVehicleLookupPayload({ vehicle: inner })).toEqual(expected)
    expect(normalizeVehicleLookupPayload({ data: { veiculo: inner } })).toEqual(expected)
  })

  // Vários serviços devolvem "MARCA/MODELO" num campo só
  test('splits the combined brand and model field', () => {
    expect(
      normalizeVehicleLookupPayload({ marcaModelo: 'VOLVO/FH 540', placa: 'ABC1D23' }),
    ).toEqual({ ...EMPTY_LOOKUP, brand: 'VOLVO', model: 'FH 540', plate: 'ABC1D23' })
    expect(normalizeVehicleLookupPayload({ 'marca/modelo': 'SCANIA', placa: 'ABC1D23' })).toEqual({
      ...EMPTY_LOOKUP,
      brand: 'SCANIA',
      plate: 'ABC1D23',
    })
  })

  test('keeps digits, uppercase and decimals under our own rules', () => {
    expect(
      normalizeVehicleLookupPayload({
        cpfCnpjProprietario: '12.345.678/0001-95',
        nomeProprietario: '  transportes ada  ',
        placa: 'abc-1234',
        renavam: 12_345_678_901,
        tara: 9000,
        uf: 'sp',
      }),
    ).toEqual({
      ...EMPTY_LOOKUP,
      ownerName: 'transportes ada',
      ownerTaxId: '12345678000195',
      plate: 'ABC1234',
      renavam: '12345678901',
      state: 'SP',
      tareWeightKilograms: '9000',
    })
  })

  test('refuses a payload without a plate', () => {
    expect(normalizeVehicleLookupPayload({ marca: 'VOLVO' })).toBeNull()
    expect(normalizeVehicleLookupPayload({ placa: '' })).toBeNull()
    expect(normalizeVehicleLookupPayload(null)).toBeNull()
    expect(normalizeVehicleLookupPayload('ABC1D23')).toBeNull()
    expect(normalizeVehicleLookupPayload([{ placa: 'ABC1D23' }])).toBeNull()
  })

  // Campo desconhecido do serviço externo não pode vazar para dentro do nosso domínio
  test('never carries a field we did not ask for', () => {
    const normalized = normalizeVehicleLookupPayload({
      multa: 'R$ 1.000,00',
      placa: 'ABC1D23',
      situacao: 'roubado',
    })

    expect(Object.keys(normalized ?? {}).sort()).toEqual(Object.keys(EMPTY_LOOKUP).sort())
  })
})

describe('fleet vehicle lookup use case contract', () => {
  test('reports the feature as unavailable when no provider is configured', async () => {
    const useCase = createFleetVehicleLookupUseCase({ gateway: null })

    expect(useCase.isAvailable()).toBe(false)
    const failure = await useCase
      .lookup({ context: FLEET_CONTEXT, plate: 'ABC1D23' })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_LOOKUP_UNAVAILABLE')
    expect((failure as ApiError).status).toBe(503)
  })

  test('delegates the plate to the configured provider', async () => {
    const { calls, gateway } = createGatewayStub()
    const useCase = createFleetVehicleLookupUseCase({ gateway })

    expect(useCase.isAvailable()).toBe(true)
    expect(await useCase.lookup({ context: FLEET_CONTEXT, plate: 'abc1d23' })).toEqual(
      LOOKUP_RESULT,
    )
    expect(calls).toEqual(['ABC1D23'])
  })

  test('answers nothing when the provider does not know the plate', async () => {
    const { gateway } = createGatewayStub(null)
    const useCase = createFleetVehicleLookupUseCase({ gateway })

    expect(await useCase.lookup({ context: FLEET_CONTEXT, plate: 'ABC1D23' })).toBeNull()
  })
})

describe('fleet vehicle lookup environment contract', () => {
  test('keeps the lookup unconfigured when the url is absent', () => {
    expect(parseEnvironment(API_ENVIRONMENT).vehicleLookup).toBeNull()
  })

  test.each(['', '   '])('keeps the lookup unconfigured when the url is blank (%p)', (url) => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, FLEET_VEHICLE_LOOKUP_URL: url }).vehicleLookup,
    ).toBeNull()
  })

  test('reads the provider url and token when both are configured', () => {
    const environment = {
      ...API_ENVIRONMENT,
      FLEET_VEHICLE_LOOKUP_TOKEN: ' synthetic-token ',
      FLEET_VEHICLE_LOOKUP_URL: ' https://lookup.example.test/v1/plates ',
    }

    expect(parseEnvironment(environment).vehicleLookup).toEqual({
      token: 'synthetic-token',
      url: 'https://lookup.example.test/v1/plates',
    })
  })

  test('refuses a lookup url outside https or localhost', () => {
    expect(() =>
      parseEnvironment({
        ...API_ENVIRONMENT,
        FLEET_VEHICLE_LOOKUP_URL: 'http://lookup.example.test',
      }),
    ).toThrow()
  })
})
