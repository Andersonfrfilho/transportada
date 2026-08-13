/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  FLEET_MANAGE,
  FLEET_READ,
  loadFutureModule,
  SYNTHETIC_ACCESS_TOKEN,
  VEHICLE_LOOKUP,
  type FleetVehicleLookupContract,
} from './fleet.fixture'

const API_URL = 'https://api.example.test'
const LOOKUP_PATH = `${API_URL}/fleet/vehicles/lookup`
const CAPABILITIES_PATH = `${API_URL}/fleet/capabilities`
const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet vehicle lookup contract', () => {
  test('asks the api for the plate over an authenticated no-store request', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(await client.lookupVehicleByPlate({ plate: 'abc-1d23' })).toEqual(VEHICLE_LOOKUP)
    expect(await client.getFleetCapabilities()).toEqual({ vehicleLookup: true })

    const [lookupRequest, capabilitiesRequest] = requests
    if (lookupRequest === undefined || capabilitiesRequest === undefined) {
      throw new Error('FLEET_CONTRACT_REQUEST_MISSING')
    }

    expect(lookupRequest.url).toBe(`${LOOKUP_PATH}?plate=ABC1D23`)
    expect(lookupRequest.method).toBe('GET')
    expect(lookupRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(lookupRequest.cache).toBe('no-store')
    expect(capabilitiesRequest.url).toBe(CAPABILITIES_PATH)
    expect(capabilitiesRequest.method).toBe('GET')
  })

  // A placa desconhecida é resposta legítima do provedor, não falha de rede
  test('answers null when the provider has no vehicle for the plate', async () => {
    const { createFleetClient } = await loadFutureModule<FleetClientModule>(
      '../../src/modules/fleet/shared/fleetClient.service',
    )
    const client = createFleetClient({
      apiUrl: API_URL,
      fetch: () => Promise.resolve(Response.json({ data: null })),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(await client.lookupVehicleByPlate({ plate: 'ABC1D23' })).toBe(null)
  })

  test('surfaces the api error code when the provider is off or fails', async () => {
    const { createFleetClient } = await loadFutureModule<FleetClientModule>(
      '../../src/modules/fleet/shared/fleetClient.service',
    )
    const client = createFleetClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'FLEET_VEHICLE_LOOKUP_UNAVAILABLE', message: 'off' } },
            { status: 503 },
          ),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client.lookupVehicleByPlate({ plate: 'ABC1D23' }).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_VEHICLE_LOOKUP_UNAVAILABLE' }))
  })

  test('keeps the lookup dto strict and free of tenant fields', async () => {
    const { createFleetResponseAdapters } = await loadFutureModule<FleetAdaptersModule>(
      '../../src/modules/fleet/shared/fleetResponse.validation',
    )
    const adapters = createFleetResponseAdapters()

    expect(adapters.vehicleLookupFromApi(VEHICLE_LOOKUP)).toEqual(VEHICLE_LOOKUP)
    expect(adapters.vehicleLookupFromApi(null)).toBe(null)
    expect(adapters.capabilitiesFromApi({ vehicleLookup: false })).toEqual({ vehicleLookup: false })

    expect(() =>
      adapters.vehicleLookupFromApi({ ...VEHICLE_LOOKUP, companyId: 'forbidden-company' }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() =>
      adapters.vehicleLookupFromApi({ ...VEHICLE_LOOKUP, capacityKilograms: 27000 }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() => adapters.capabilitiesFromApi({ vehicleLookup: 'true' })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
  })

  test('fills the vehicle form from the lookup without inventing fields', async () => {
    const { applyVehicleLookup, createVehicleDraft } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const draft = createVehicleDraft()

    const filled = applyVehicleLookup(draft, VEHICLE_LOOKUP)
    expect(filled).toEqual({
      ...draft,
      capacityKilograms: VEHICLE_LOOKUP.capacityKilograms,
      ownerName: VEHICLE_LOOKUP.ownerName,
      ownerTaxId: VEHICLE_LOOKUP.ownerTaxId,
      plate: VEHICLE_LOOKUP.plate,
      renavam: VEHICLE_LOOKUP.renavam,
      state: VEHICLE_LOOKUP.state,
      tareWeightKilograms: VEHICLE_LOOKUP.tareWeightKilograms,
    })

    // Campo que o provedor não devolveu não apaga o que o operador já digitou
    const typed = { ...draft, renavam: '99999999999', state: 'MG' }
    expect(applyVehicleLookup(typed, { ...VEHICLE_LOOKUP, renavam: '', state: '' })).toMatchObject({
      renavam: '99999999999',
      state: 'MG',
    })
  })

  test('offers the plate lookup only to fleet.manage and the capability to fleet.read', async () => {
    const { createFleetController } = await loadFutureModule<FleetHookModule>(
      '../../src/modules/fleet/hooks/useFleet.hook',
    )
    const client = createLookupClient()

    const readOnlyController = createFleetController({ client, permissions: [FLEET_READ] })
    expect(
      await readOnlyController
        .lookupVehicleByPlate({ plate: 'ABC1D23' })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))
    expect(await readOnlyController.getFleetCapabilities()).toEqual({ vehicleLookup: true })

    const blindController = createFleetController({ client, permissions: [] })
    expect(await blindController.getFleetCapabilities().catch((caught: unknown) => caught)).toEqual(
      expect.objectContaining({ message: 'FLEET_FORBIDDEN' }),
    )

    const controller = createFleetController({
      client,
      permissions: [FLEET_READ, FLEET_MANAGE],
    })
    expect(await controller.lookupVehicleByPlate({ plate: 'ABC1D23' })).toEqual(VEHICLE_LOOKUP)
  })

  test('shows the plate lookup action beside the plate field and names it in both locales', async () => {
    const [identityFields, form, ptLocale, enLocale, constants] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleForm.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
      readApplicationFile('src/modules/fleet/shared/fleet.constant.ts'),
    ])

    expect(identityFields).toContain("t('lookupPlate')")
    expect(identityFields).toContain('name="search"')
    expect(identityFields).toContain('canLookupPlate')
    expect(form).toContain('onLookupPlate')
    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      for (const key of ['lookupPlate', 'lookupNotFound', 'lookupFailed', 'lookupUnavailable']) {
        expect(typeof dictionary[key]).toBe('string')
      }
    }
    expect(constants).toContain('FLEET_VEHICLE_LOOKUP_UNAVAILABLE')
    expect(constants).toContain('FLEET_VEHICLE_LOOKUP_FAILED')
  })
})

async function createRecordingClient(requests: Request[]): Promise<FleetLookupClient> {
  const { createFleetClient } = await loadFutureModule<FleetClientModule>(
    '../../src/modules/fleet/shared/fleetClient.service',
  )
  return createFleetClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      if (request.url === CAPABILITIES_PATH) {
        return Promise.resolve(Response.json({ data: { vehicleLookup: true } }))
      }
      return Promise.resolve(Response.json({ data: VEHICLE_LOOKUP }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

function createLookupClient(): FleetLookupClient {
  return {
    getFleetCapabilities: () => Promise.resolve({ vehicleLookup: true }),
    lookupVehicleByPlate: () => Promise.resolve(VEHICLE_LOOKUP),
  }
}

type FleetCapabilitiesContract = Readonly<{ vehicleLookup: boolean }>

type FleetLookupClient = {
  getFleetCapabilities(): Promise<FleetCapabilitiesContract>
  lookupVehicleByPlate(input: {
    readonly plate: string
  }): Promise<FleetVehicleLookupContract | null>
}

type FleetClientModule = {
  readonly createFleetClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => FleetLookupClient
}

type FleetAdaptersModule = {
  readonly createFleetResponseAdapters: () => {
    readonly capabilitiesFromApi: (input: unknown) => unknown
    readonly vehicleLookupFromApi: (input: unknown) => unknown
  }
}

type FleetVehicleFormStateContract = Record<string, unknown>

type FleetFormModule = {
  readonly applyVehicleLookup: (
    state: FleetVehicleFormStateContract,
    lookup: FleetVehicleLookupContract,
  ) => FleetVehicleFormStateContract
  readonly createVehicleDraft: (input?: Record<string, unknown>) => FleetVehicleFormStateContract
}

type FleetHookModule = {
  readonly createFleetController: (input: {
    readonly client: FleetLookupClient
    readonly permissions: readonly string[]
  }) => {
    readonly getFleetCapabilities: () => Promise<FleetCapabilitiesContract>
    readonly lookupVehicleByPlate: (input: {
      readonly plate: string
    }) => Promise<FleetVehicleLookupContract | null>
  }
}
