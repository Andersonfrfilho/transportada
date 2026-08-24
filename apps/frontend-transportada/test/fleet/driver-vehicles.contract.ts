/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type { FleetDriverVehicleContract } from './fleet.fixture'
import {
  DRIVER_ID,
  DRIVER_OWNED_VEHICLE_ID,
  DRIVER_VEHICLE_LINKS,
  FLEET_MANAGE,
  FLEET_READ,
  loadFutureModule,
  SYNTHETIC_ACCESS_TOKEN,
  VEHICLE_DETAIL,
  VEHICLE_ID,
} from './fleet.fixture'

const API_URL = 'https://api.example.test'
const DRIVER_VEHICLES_PATH = `${API_URL}/fleet/drivers/${DRIVER_ID}/vehicles`
const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet driver vehicles contract', () => {
  test('never rewrites the vehicle set from a list that has not loaded', async () => {
    const { shouldReplaceDriverVehicles } = await loadFutureModule<{
      shouldReplaceDriverVehicles: (
        input: Readonly<{ hasOperatorChoice: boolean; isReady: boolean }>,
      ) => boolean
    }>('../../src/modules/fleet/shared/driverVehicles.service')

    expect(shouldReplaceDriverVehicles({ hasOperatorChoice: false, isReady: false })).toBe(false)
    expect(shouldReplaceDriverVehicles({ hasOperatorChoice: false, isReady: true })).toBe(true)
    expect(shouldReplaceDriverVehicles({ hasOperatorChoice: true, isReady: false })).toBe(true)
  })

  test('reads and replaces the driver vehicle set over authenticated no-store requests', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(await client.listDriverVehicles({ driverId: DRIVER_ID })).toEqual(DRIVER_VEHICLE_LINKS)
    expect(
      await client.replaceDriverVehicles({
        driverId: DRIVER_ID,
        vehicleIds: [VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID],
      }),
    ).toEqual(DRIVER_VEHICLE_LINKS)

    const [listRequest, replaceRequest] = requests
    if (listRequest === undefined || replaceRequest === undefined) {
      throw new Error('FLEET_CONTRACT_REQUEST_MISSING')
    }

    expect(listRequest.url).toBe(DRIVER_VEHICLES_PATH)
    expect(listRequest.method).toBe('GET')
    expect(listRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(listRequest.cache).toBe('no-store')

    expect(replaceRequest.url).toBe(DRIVER_VEHICLES_PATH)
    expect(replaceRequest.method).toBe('PUT')
    expect(replaceRequest.headers.get('content-type')).toBe('application/json')
    expect(await replaceRequest.json()).toEqual({
      vehicleIds: [VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID],
    })
  })

  test('never smuggles the tenant or the driver identifier into the replace body', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.replaceDriverVehicles({
      companyId: 'forbidden-company',
      driverId: DRIVER_ID,
      vehicleIds: [VEHICLE_ID],
    } as never)

    const [replaceRequest] = requests
    if (replaceRequest === undefined) throw new Error('FLEET_CONTRACT_REQUEST_MISSING')
    const body = JSON.stringify(await replaceRequest.json())
    expect(body).not.toContain('forbidden-company')
    expect(body).not.toContain(DRIVER_ID)
  })

  test('surfaces the api error code when a vehicle left the company', async () => {
    const { createFleetClient } = await loadFutureModule<FleetClientModule>(
      '../../src/modules/fleet/shared/fleetClient.service',
    )
    const client = createFleetClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'FLEET_VEHICLE_NOT_FOUND', message: 'not found' } },
            { status: 404 },
          ),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client
        .replaceDriverVehicles({ driverId: DRIVER_ID, vehicleIds: [VEHICLE_ID] })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_VEHICLE_NOT_FOUND' }))
  })

  test('keeps the link dto strict, free of tenant fields and with a trustworthy ownership flag', async () => {
    const { createFleetResponseAdapters } = await loadFutureModule<FleetAdaptersModule>(
      '../../src/modules/fleet/shared/fleetResponse.validation',
    )
    const adapters = createFleetResponseAdapters()
    const [link] = DRIVER_VEHICLE_LINKS

    expect(adapters.driverVehicleListFromApi({ data: DRIVER_VEHICLE_LINKS })).toEqual(
      DRIVER_VEHICLE_LINKS,
    )
    expect(adapters.driverVehicleListFromApi({ data: [] })).toEqual([])

    expect(() =>
      adapters.driverVehicleListFromApi({ data: [{ ...link, companyId: 'forbidden-company' }] }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() =>
      adapters.driverVehicleListFromApi({ data: [{ ...link, ownedByDriver: 'true' }] }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() =>
      adapters.driverVehicleListFromApi({
        data: [{ ...link, vehicle: { ...VEHICLE_DETAIL, role: 'semi_trailer' } }],
      }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() =>
      adapters.driverVehicleListFromApi({ data: [{ assignedAt: link?.assignedAt }] }),
    ).toThrow('FLEET_RESPONSE_INVALID')
    expect(() => adapters.driverVehicleListFromApi({ data: DRIVER_VEHICLE_LINKS[0] })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
  })

  test('reads the driver vehicles with fleet.read and replaces them only with fleet.manage', async () => {
    const { createFleetController } = await loadFutureModule<FleetHookModule>(
      '../../src/modules/fleet/hooks/useFleet.hook',
    )
    const client = createLinkRecordingClient()

    const readOnlyController = createFleetController({ client, permissions: [FLEET_READ] })
    expect(await readOnlyController.listDriverVehicles({ driverId: DRIVER_ID })).toEqual(
      DRIVER_VEHICLE_LINKS,
    )
    expect(
      await readOnlyController
        .replaceDriverVehicles({ driverId: DRIVER_ID, vehicleIds: [VEHICLE_ID] })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))
    expect(client.replaceCount).toBe(0)

    const blindController = createFleetController({ client, permissions: [] })
    expect(
      await blindController
        .listDriverVehicles({ driverId: DRIVER_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'FLEET_FORBIDDEN' }))

    const controller = createFleetController({
      client,
      permissions: [FLEET_READ, FLEET_MANAGE],
    })
    await controller.replaceDriverVehicles({ driverId: DRIVER_ID, vehicleIds: [VEHICLE_ID] })
    expect(client.replaceCount).toBe(1)
  })

  test('turns the saved links into a selection and toggles a vehicle without losing the others', async () => {
    const { toSelectedVehicleIds, toggleVehicleSelection } =
      await loadFutureModule<DriverVehiclesModule>(
        '../../src/modules/fleet/shared/driverVehicles.service',
      )

    expect(toSelectedVehicleIds(DRIVER_VEHICLE_LINKS)).toEqual([
      VEHICLE_ID,
      DRIVER_OWNED_VEHICLE_ID,
    ])
    expect(toSelectedVehicleIds([])).toEqual([])

    expect(
      toggleVehicleSelection({ selected: [VEHICLE_ID], vehicleId: DRIVER_OWNED_VEHICLE_ID }),
    ).toEqual([VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID])
    expect(
      toggleVehicleSelection({
        selected: [VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID],
        vehicleId: VEHICLE_ID,
      }),
    ).toEqual([DRIVER_OWNED_VEHICLE_ID])
    expect(toggleVehicleSelection({ selected: [VEHICLE_ID], vehicleId: VEHICLE_ID })).toEqual([])
  })

  // O veículo próprio do motorista tem que aparecer marcado sem depender de leitura do cadastro
  test('marks the vehicles owned by the driver from the flag the api derived', async () => {
    const { toOwnedVehicleIds } = await loadFutureModule<DriverVehiclesModule>(
      '../../src/modules/fleet/shared/driverVehicles.service',
    )

    expect(toOwnedVehicleIds(DRIVER_VEHICLE_LINKS)).toEqual([DRIVER_OWNED_VEHICLE_ID])
    expect(
      toOwnedVehicleIds(DRIVER_VEHICLE_LINKS.map((link) => ({ ...link, ownedByDriver: false }))),
    ).toEqual([])
  })

  test('offers the vehicle links as one searchable field and names it in both locales', async () => {
    const [field, form, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/DriverVehicleLinkField.component.tsx'),
      readApplicationFile('src/modules/fleet/components/DriverForm.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(field).toContain("t('driverVehiclesLegend')")
    expect(field).toContain("from '@/components/ui/multi-select'")
    expect(field).not.toContain('type="checkbox"')
    expect(form).toContain('<DriverVehicleLinkField')
    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      for (const key of [
        'driverVehiclesLegend',
        'driverVehiclesHint',
        'driverVehiclesEmpty',
        'driverVehiclesPlaceholder',
        'driverVehiclesSearch',
        'driverVehiclesNoMatch',
        'driverVehiclesSummary',
        'driverVehiclesSummary_other',
        'driverVehiclesRemove',
        'driverVehiclesClearAll',
        'driverOwnedVehicle',
      ]) {
        expect(typeof dictionary[key]).toBe('string')
      }
    }
  })
})

async function createRecordingClient(requests: Request[]): Promise<FleetLinkClient> {
  const { createFleetClient } = await loadFutureModule<FleetClientModule>(
    '../../src/modules/fleet/shared/fleetClient.service',
  )
  return createFleetClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      if (request.url !== DRIVER_VEHICLES_PATH) {
        throw new Error(`Unexpected request in contract: ${request.url}`)
      }
      return Promise.resolve(Response.json({ data: DRIVER_VEHICLE_LINKS }))
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

function createLinkRecordingClient(): FleetLinkClient & { readonly replaceCount: number } {
  let replaceCount = 0

  return {
    listDriverVehicles: () => Promise.resolve(DRIVER_VEHICLE_LINKS),
    replaceDriverVehicles: () => {
      replaceCount += 1
      return Promise.resolve(DRIVER_VEHICLE_LINKS)
    },
    get replaceCount(): number {
      return replaceCount
    },
  }
}

type ListInput = Readonly<{ driverId: string }>
type ReplaceInput = Readonly<{ driverId: string; vehicleIds: readonly string[] }>

type FleetLinkClient = {
  listDriverVehicles(input: ListInput): Promise<unknown>
  replaceDriverVehicles(input: ReplaceInput): Promise<unknown>
}

type FleetClientModule = {
  readonly createFleetClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => FleetLinkClient
}

type FleetAdaptersModule = {
  readonly createFleetResponseAdapters: () => {
    readonly driverVehicleListFromApi: (input: unknown) => unknown
  }
}

type FleetHookModule = {
  readonly createFleetController: (input: {
    readonly client: FleetLinkClient
    readonly permissions: readonly string[]
  }) => FleetLinkClient
}

type DriverVehiclesModule = {
  readonly toOwnedVehicleIds: (links: readonly FleetDriverVehicleContract[]) => readonly string[]
  readonly toSelectedVehicleIds: (links: readonly FleetDriverVehicleContract[]) => readonly string[]
  readonly toggleVehicleSelection: (input: {
    readonly selected: readonly string[]
    readonly vehicleId: string
  }) => readonly string[]
}
