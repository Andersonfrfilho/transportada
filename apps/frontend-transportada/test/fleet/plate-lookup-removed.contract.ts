/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FLEET_MODULE_ROOT = new URL('src/modules/fleet/', APPLICATION_ROOT)

/**
 * Nenhum provedor de consulta por placa é gratuito e nenhum combina placa e Renavam numa fonte
 * pública: o trilho inteiro saiu em favor da digitação pelo CRLV — ADR-0032, que substitui a 0020.
 */
const FORBIDDEN_NEEDLE = [
  'applyVehicleLookup',
  'canLookupPlate',
  'FLEET_VEHICLE_LOOKUP',
  'FleetVehicleLookup',
  'LookingUpPlate',
  'lookupPlate',
  'lookupVehicleByPlate',
  'useVehicleLookup',
  'vehicleLookup',
  'VEHICLE_LOOKUP',
  'VehicleLookupController',
] as const

const REMOVED_FILE = [
  'hooks/useVehicleLookup.hook.ts',
  '../../../test/fleet/vehicle-lookup.contract.ts',
] as const

async function listFleetModuleFiles(): Promise<readonly string[]> {
  const glob = new Bun.Glob('**/*.{css,json,ts,tsx}')
  const files: string[] = []
  for await (const file of glob.scan({ cwd: FLEET_MODULE_ROOT.pathname })) files.push(file)
  return files.sort()
}

function readModuleFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, FLEET_MODULE_ROOT)).text()
}

describe('fleet plate lookup removal contract', () => {
  test('leaves no plate lookup symbol anywhere in the fleet module', async () => {
    const files = await listFleetModuleFiles()
    expect(files.length).toBeGreaterThan(0)

    const contents = await Promise.all(files.map(readModuleFile))

    for (const [index, content] of contents.entries()) {
      for (const needle of FORBIDDEN_NEEDLE) {
        expect(`${files[index] ?? ''}:${content.includes(needle)}`).toBe(
          `${files[index] ?? ''}:false`,
        )
      }
    }
  })

  test('keeps the plate lookup files deleted', async () => {
    for (const filePath of REMOVED_FILE) {
      expect(await Bun.file(new URL(filePath, FLEET_MODULE_ROOT)).exists()).toBe(false)
    }
  })

  test('names no lookup feedback in either dictionary', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readModuleFile('locales/fleet.locale.json'),
      readModuleFile('locales/fleet.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      expect(Object.keys(dictionary).filter((key) => key.startsWith('lookup'))).toEqual([])
    }
  })

  test('keeps the vehicle catalog as the only fleet capability', async () => {
    const { FLEET_CAPABILITY_KEYS } = await loadFutureModule<FleetConstantModule>(
      '../../src/modules/fleet/shared/fleet.constant',
    )
    const { createFleetResponseAdapters } = await loadFutureModule<FleetAdapterModule>(
      '../../src/modules/fleet/shared/fleetResponse.validation',
    )

    expect(FLEET_CAPABILITY_KEYS).toEqual(['vehicleCatalog'])

    const adapters = createFleetResponseAdapters()
    expect(adapters.capabilitiesFromApi({ vehicleCatalog: true })).toEqual({ vehicleCatalog: true })
    // A capacidade removida não volta pela resposta: chave desconhecida é resposta inválida
    expect(() =>
      adapters.capabilitiesFromApi({ vehicleCatalog: true, vehicleLookup: true }),
    ).toThrow('FLEET_RESPONSE_INVALID')
  })
})

type FleetConstantModule = {
  readonly FLEET_CAPABILITY_KEYS: readonly string[]
}

type FleetAdapterModule = {
  readonly createFleetResponseAdapters: () => {
    readonly capabilitiesFromApi: (input: unknown) => unknown
  }
}
