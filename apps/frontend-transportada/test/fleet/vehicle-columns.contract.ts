/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function createMemoryStorage(): FleetColumnStorage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
}

describe('fleet vehicle columns contract', () => {
  test('shows brand and model by default, hides model year, axle count, color and costs', async () => {
    const { readFleetVehicleColumnPreferences } = await loadFutureModule<FleetVehicleTableModule>(
      '../../src/modules/fleet/shared/fleetVehicleTable.service',
    )

    const preferences = readFleetVehicleColumnPreferences(null)

    expect(preferences.order).toEqual([
      'brand',
      'model',
      'modelYear',
      'axleCount',
      'color',
      'fuelArrangement',
      'costPerKilometer',
      'monthlyFixedCost',
    ])
    expect(preferences.visibility).toEqual({
      axleCount: false,
      brand: true,
      color: false,
      costPerKilometer: false,
      fuelArrangement: false,
      model: true,
      modelYear: false,
      monthlyFixedCost: false,
    })
  })

  test('persists reorder and visibility changes across reads', async () => {
    const {
      readFleetVehicleColumnPreferences,
      reorderFleetVehicleColumns,
      writeFleetVehicleColumnPreferences,
    } = await loadFutureModule<FleetVehicleTableModule>(
      '../../src/modules/fleet/shared/fleetVehicleTable.service',
    )
    const storage = createMemoryStorage()

    const initial = readFleetVehicleColumnPreferences(storage)
    const reordered = reorderFleetVehicleColumns(initial.order, 'model', 'up')
    writeFleetVehicleColumnPreferences({
      preferences: {
        order: reordered,
        visibility: { ...initial.visibility, modelYear: true },
      },
      storage,
    })

    const persisted = readFleetVehicleColumnPreferences(storage)
    expect(persisted.order).toEqual([
      'model',
      'brand',
      'modelYear',
      'axleCount',
      'color',
      'fuelArrangement',
      'costPerKilometer',
      'monthlyFixedCost',
    ])
    expect(persisted.visibility.modelYear).toBe(true)
    // A escolha do operador vale mesmo depois de nova leitura — nao volta ao default oculto
    expect(persisted.visibility.axleCount).toBe(false)
  })

  test('offers a columns menu that toggles and reorders the new columns, named in both locales', async () => {
    const [vehiclePanel, vehicleColumnsMenu, vehicleList, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehiclePanel.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleColumnsMenu.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleList.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(vehiclePanel).toContain('VehicleColumnsMenu')
    expect(vehiclePanel).toContain('Icon name="columns"')
    expect(vehicleColumnsMenu).toContain('moveColumn')
    expect(vehicleColumnsMenu).toContain('hideColumn')
    expect(vehicleList).toContain('columns')

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      const columns = dictionary.columns as Record<string, unknown> | undefined
      const column = dictionary.column as Record<string, unknown> | undefined
      expect(typeof columns?.title).toBe('string')
      expect(typeof columns?.brand).toBe('string')
      expect(typeof columns?.model).toBe('string')
      expect(typeof columns?.modelYear).toBe('string')
      expect(typeof columns?.axleCount).toBe('string')
      expect(typeof columns?.color).toBe('string')
      expect(typeof columns?.fuelArrangement).toBe('string')
      expect(typeof column?.moveUp).toBe('string')
      expect(typeof column?.moveDown).toBe('string')
    }
  })

  test('wires the vehicle columns hook into the fleet workspace page', async () => {
    const workspacePage = await readApplicationFile(
      'src/modules/fleet/pages/FleetWorkspace.page.tsx',
    )

    expect(workspacePage).toContain('useVehicleColumns')
    expect(workspacePage).toContain('columns=')
  })
})

type FleetColumnStorage = Readonly<{
  getItem: (key: string) => null | string
  setItem: (key: string, value: string) => void
}>

type FleetVehicleColumnKeyContract =
  | 'axleCount'
  | 'brand'
  | 'color'
  | 'costPerKilometer'
  | 'fuelArrangement'
  | 'model'
  | 'modelYear'
  | 'monthlyFixedCost'

type FleetVehicleColumnPreferencesContract = Readonly<{
  order: readonly FleetVehicleColumnKeyContract[]
  visibility: Readonly<Record<FleetVehicleColumnKeyContract, boolean>>
}>

type FleetVehicleTableModule = {
  readonly readFleetVehicleColumnPreferences: (
    storage: FleetColumnStorage | null,
  ) => FleetVehicleColumnPreferencesContract
  readonly reorderFleetVehicleColumns: (
    order: readonly FleetVehicleColumnKeyContract[],
    column: FleetVehicleColumnKeyContract,
    direction: 'down' | 'up',
  ) => readonly FleetVehicleColumnKeyContract[]
  readonly writeFleetVehicleColumnPreferences: (input: {
    readonly preferences: FleetVehicleColumnPreferencesContract
    readonly storage: FleetColumnStorage | null
  }) => void
}
