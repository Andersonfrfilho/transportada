/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { toVehicleFormState } from '@/modules/fleet/shared/fleetForm.service'
import { resolveVehicleBrandDefaults } from '@/modules/fleet/shared/vehicleBrandDefaults.service'
import {
  clearVehicleFilterField,
  describeVehicleFilterPills,
  VEHICLE_PILL_FIELDS,
} from '@/modules/fleet/shared/vehicleFilterPills.service'
import {
  buildVehiclePlateList,
  buildVehicleSelectionCsv,
  VEHICLE_EXPORT_COLUMNS,
  VEHICLE_EXPORT_FILE_NAME,
  VEHICLE_EXPORT_MEDIA_TYPE,
  type VehicleExportColumn,
} from '@/modules/fleet/shared/vehicleSelectionExport.service'
import {
  collectVehicleFilterOptions,
  countActiveVehicleFilters,
  EMPTY_VEHICLE_TABLE_FILTERS,
  filterVehicles,
  nextVehicleSortState,
  resolveVehicleSelectionState,
  sortVehicles,
  toggleFilterValue,
  toggleVisibleSelection,
  VEHICLE_SORT_COLUMNS,
} from '@/modules/fleet/shared/vehicleTable.service'
import { maskTypedAmount } from '@/modules/shared/decimalAmount.service'

import { NO_COSTS_VEHICLE_DETAIL, VEHICLE_DETAIL } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function buildVehicle(overrides: Partial<FleetVehicleDetail>): FleetVehicleDetail {
  return { ...(VEHICLE_DETAIL as FleetVehicleDetail), ...overrides }
}

const VOLVO = buildVehicle({
  axleCount: 3,
  brand: 'Volvo',
  color: 'branca',
  costPerKilometer: '2.6920',
  id: 'vehicle-volvo',
  modelYear: 2020,
  plate: 'AAA1B11',
})
const SCANIA = buildVehicle({
  axleCount: 6,
  brand: 'Scania',
  color: 'preta',
  costPerKilometer: '1.1000',
  id: 'vehicle-scania',
  modelYear: 2024,
  plate: 'BBB2C22',
  status: 'inactive',
})
const NO_COST = buildVehicle({
  ...(NO_COSTS_VEHICLE_DETAIL as FleetVehicleDetail),
  brand: 'Iveco',
  id: 'vehicle-iveco',
  plate: 'CCC3D33',
})
const FLEET: readonly FleetVehicleDetail[] = [VOLVO, SCANIA, NO_COST]

function idsOf(vehicles: readonly FleetVehicleDetail[]): readonly string[] {
  return vehicles.map((vehicle) => vehicle.id)
}

describe('fleet vehicle table contract', () => {
  test('cycles the header through ascending, descending and back to the natural order', () => {
    const first = nextVehicleSortState(null, 'plate')
    const second = nextVehicleSortState(first, 'plate')
    const third = nextVehicleSortState(second, 'plate')

    expect(first).toEqual({ column: 'plate', direction: 'asc' })
    expect(second).toEqual({ column: 'plate', direction: 'desc' })
    expect(third).toBeNull()
    expect(nextVehicleSortState(second, 'brand')).toEqual({ column: 'brand', direction: 'asc' })
    expect(VEHICLE_SORT_COLUMNS).toContain('costPerKilometer')
  })

  test('sorts money by value and keeps the vehicle without cost last in both directions', () => {
    const ascending = sortVehicles({
      sort: { column: 'costPerKilometer', direction: 'asc' },
      vehicles: FLEET,
    })
    const descending = sortVehicles({
      sort: { column: 'costPerKilometer', direction: 'desc' },
      vehicles: FLEET,
    })

    expect(idsOf(ascending)).toEqual(['vehicle-scania', 'vehicle-volvo', 'vehicle-iveco'])
    expect(idsOf(descending)).toEqual(['vehicle-volvo', 'vehicle-scania', 'vehicle-iveco'])
    expect(idsOf(sortVehicles({ sort: null, vehicles: FLEET }))).toEqual(idsOf(FLEET))
  })

  test('accepts more than one value per filter and searches the plate without the mask', () => {
    const brands = toggleFilterValue(toggleFilterValue([], 'Volvo'), 'Scania')
    const both = filterVehicles({
      filters: { ...EMPTY_VEHICLE_TABLE_FILTERS, brands },
      vehicles: FLEET,
    })
    const masked = filterVehicles({
      filters: { ...EMPTY_VEHICLE_TABLE_FILTERS, plateQuery: 'bbb-2c22' },
      vehicles: FLEET,
    })

    expect(idsOf(both)).toEqual(['vehicle-volvo', 'vehicle-scania'])
    expect(idsOf(masked)).toEqual(['vehicle-scania'])
    expect(toggleFilterValue(brands, 'Volvo')).toEqual(['Scania'])
    expect(
      idsOf(filterVehicles({ filters: EMPTY_VEHICLE_TABLE_FILTERS, vehicles: FLEET })),
    ).toEqual(idsOf(FLEET))
  })

  test('offers only the values the loaded fleet has, and counts one filter per field', () => {
    const options = collectVehicleFilterOptions(FLEET)

    expect(options.brands).toEqual(['Iveco', 'Scania', 'Volvo'])
    expect(options.axleCounts).toEqual([3, 6])
    expect(options.modelYears).toEqual([2024, 2020])
    expect(countActiveVehicleFilters(EMPTY_VEHICLE_TABLE_FILTERS)).toBe(0)
    expect(
      countActiveVehicleFilters({
        ...EMPTY_VEHICLE_TABLE_FILTERS,
        brands: ['Volvo', 'Scania'],
        plateQuery: 'AAA',
        statuses: ['active'],
      }),
    ).toBe(3)
  })

  test('selects every visible row without touching what the filter hid', () => {
    const visibleIds = ['vehicle-volvo', 'vehicle-scania']
    const none = resolveVehicleSelectionState({ selectedIds: [], visibleIds })
    const partial = resolveVehicleSelectionState({ selectedIds: ['vehicle-volvo'], visibleIds })
    const all = resolveVehicleSelectionState({ selectedIds: visibleIds, visibleIds })

    expect([none, partial, all]).toEqual(['none', 'partial', 'all'])
    expect(toggleVisibleSelection({ selectedIds: ['vehicle-iveco'], visibleIds })).toEqual([
      'vehicle-iveco',
      'vehicle-volvo',
      'vehicle-scania',
    ])
    expect(
      toggleVisibleSelection({ selectedIds: ['vehicle-iveco', ...visibleIds], visibleIds }),
    ).toEqual(['vehicle-iveco'])
    expect(resolveVehicleSelectionState({ selectedIds: ['vehicle-iveco'], visibleIds: [] })).toBe(
      'none',
    )
  })

  test('describes every active filter as a removable pill and clears one field at a time', () => {
    const filters = {
      ...EMPTY_VEHICLE_TABLE_FILTERS,
      brands: ['Volvo'],
      colors: ['branca'],
      plateQuery: 'AAA1B11',
    }
    const pills = describeVehicleFilterPills(filters)

    expect(pills.map((pill) => pill.field)).toEqual(['plateQuery', 'brands', 'colors'])
    expect(pills[1]).toEqual({ field: 'brands', labelKey: 'vehicleFilters.brand', value: 'Volvo' })
    expect(pills[2]?.valueKeys).toEqual(['colorOption.branca'])
    expect(describeVehicleFilterPills(EMPTY_VEHICLE_TABLE_FILTERS)).toEqual([])
    expect(clearVehicleFilterField({ field: 'brands', filters }).brands).toEqual([])
    expect(clearVehicleFilterField({ field: 'brands', filters }).plateQuery).toBe('AAA1B11')
    for (const field of VEHICLE_PILL_FIELDS) {
      expect(EMPTY_VEHICLE_TABLE_FILTERS[field]).toBeDefined()
    }
  })

  test('exports the selection as a spreadsheet pt-BR opens without an import wizard', () => {
    const header = Object.fromEntries(
      VEHICLE_EXPORT_COLUMNS.map((column) => [column, `head:${column}`]),
    ) as Record<VehicleExportColumn, string>
    const csv = buildVehicleSelectionCsv({
      labels: { header, translateValue: (input) => `t:${input.value}` },
      vehicles: [VOLVO, NO_COST],
    })
    const [headerLine = '', firstRow = '', secondRow = ''] = csv.split('\r\n')

    const byteOrderMark = '\uFEFF'

    expect(csv.startsWith(byteOrderMark)).toBe(true)
    expect(headerLine).toBe(
      byteOrderMark + VEHICLE_EXPORT_COLUMNS.map((column) => `"head:${column}"`).join(';'),
    )
    expect(firstRow).toContain('"2,6920"')
    expect(firstRow).toContain('"AAA1B11"')
    expect(firstRow).toContain('"t:active"')
    expect(secondRow.split(';')).toHaveLength(VEHICLE_EXPORT_COLUMNS.length)
    expect(secondRow).toContain('""')
    expect(VEHICLE_EXPORT_FILE_NAME).toBe('veiculos.csv')
    expect(VEHICLE_EXPORT_MEDIA_TYPE).toContain('charset=utf-8')
    expect(buildVehiclePlateList([VOLVO, SCANIA])).toBe('AAA1B11\nBBB2C22')
  })

  test('repeats the technical sheet of the same brand without inheriting identity', () => {
    const source = buildVehicle({ brand: 'Volvo', createdAt: '2026-07-28T12:00:00.000Z' })
    const older = buildVehicle({
      brand: 'Volvo',
      capacityKilograms: '11000.00',
      createdAt: '2020-01-01T00:00:00.000Z',
      id: 'vehicle-older',
    })
    const sourceState = toVehicleFormState(source)
    const defaults = resolveVehicleBrandDefaults({
      state: {
        ...toVehicleFormState(source),
        acquisitionAmount: '',
        axleCount: '0',
        capacityKilograms: '',
        tareWeightKilograms: '',
      },
      vehicles: [older, source],
    })

    expect(defaults.capacityKilograms).toBe(sourceState.capacityKilograms)
    expect(defaults.tareWeightKilograms).toBe(sourceState.tareWeightKilograms)
    expect(defaults.axleCount).toBe(sourceState.axleCount)
    expect(defaults.acquisitionAmount).toBe(sourceState.acquisitionAmount)
    expect(defaults).not.toHaveProperty('plate')
    expect(defaults).not.toHaveProperty('renavam')
    expect(defaults).not.toHaveProperty('color')
    expect(defaults).not.toHaveProperty('fleetNumber')
    expect(defaults).not.toHaveProperty('ownership')
  })

  test('keeps what the operator already typed and stays quiet for a brand nobody registered', () => {
    const source = buildVehicle({ brand: 'Volvo' })
    const typed = {
      ...toVehicleFormState(source),
      capacityKilograms: '9.000,00',
      tareWeightKilograms: '',
    }

    expect(resolveVehicleBrandDefaults({ state: typed, vehicles: [source] })).not.toHaveProperty(
      'capacityKilograms',
    )
    expect(
      resolveVehicleBrandDefaults({
        state: { ...typed, brand: 'Marca Inedita' },
        vehicles: [source],
      }),
    ).toEqual({})
  })

  test('masks the money field from the right, grouping the thousand while it is typed', () => {
    expect(maskTypedAmount({ scale: 2, value: '' })).toBe('')
    expect(maskTypedAmount({ scale: 2, value: '5' })).toBe('0,05')
    expect(maskTypedAmount({ scale: 2, value: '12000000' })).toBe('120.000,00')
    expect(maskTypedAmount({ scale: 4, value: '5000' })).toBe('0,5000')
    expect(
      maskTypedAmount({ scale: 2, value: maskTypedAmount({ scale: 2, value: '12000000' }) }),
    ).toBe('120.000,00')
  })

  test('wires selection, sorting, filters and the money field into the vehicles screen', async () => {
    const [list, panel, selectionBar, costFields, workspacePage] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleList.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehiclePanel.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleSelectionBar.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleCostFields.component.tsx'),
      readApplicationFile('src/modules/fleet/pages/FleetWorkspace.page.tsx'),
    ])

    expect(list).toContain('aria-sort')
    expect(list).toContain('table.toggleSort')
    expect(list).toContain('@/components/ui/checkbox')
    expect(panel).toContain('@/components/ui/count-badge')
    expect(panel).toContain('VehicleSelectionBar')
    expect(panel).toContain('VehicleFilters')
    expect(selectionBar).toContain('buildVehicleSelectionCsv')
    expect(selectionBar).toContain('buildVehiclePlateList')
    expect(selectionBar).toContain('navigator.clipboard')
    expect(costFields).toContain('FleetMoneyField')
    expect(costFields).toContain('VEHICLE_COST_FIELD_SCALE')
    expect(workspacePage).toContain('useVehicleTable')
    expect(workspacePage).toContain('table={vehicleTable}')
    expect(workspacePage).toContain('vehicles={vehicles}')
  })

  test('takes the height, the currency prefix and the chips from the fleet stylesheet', async () => {
    const [stylesheet, fieldComponent] = await Promise.all([
      readApplicationFile('src/modules/fleet/styles/fleet.module.css'),
      readApplicationFile('src/modules/fleet/components/FleetField.component.tsx'),
    ])

    for (const className of [
      '.bulkBar',
      '.bulkActions',
      '.chipGroup',
      '.chip',
      '.counter',
      '.filterPanel',
      '.moneyField',
      '.moneyPrefix',
      '.sortButton',
      '.sortIndicator',
      '.srOnly',
    ]) {
      expect(stylesheet).toContain(`${className} `)
    }
    expect(stylesheet).toContain('var(--field-height)')
    expect(fieldComponent).toContain('maskTypedAmount')
    expect(fieldComponent).toContain("t('currencyPrefix')")
  })

  test('names every column, filter and bulk action in both locales', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      const exportLabels = dictionary.vehicleExport as Record<string, unknown> | undefined
      const filterLabels = dictionary.vehicleFilters as Record<string, unknown> | undefined
      const selectionLabels = dictionary.vehicleSelection as Record<string, unknown> | undefined
      const sortLabels = dictionary.sort as Record<string, unknown> | undefined

      expect(typeof dictionary.currencyPrefix).toBe('string')
      expect(Object.keys(exportLabels ?? {}).sort()).toEqual([...VEHICLE_EXPORT_COLUMNS].sort())
      for (const key of ['asc', 'desc', 'none']) expect(typeof sortLabels?.[key]).toBe('string')
      for (const key of [
        'axleCount',
        'brand',
        'color',
        'fuelType',
        'modelYear',
        'ownership',
        'removeFilter',
        'role',
        'shownOfTotal',
        'status',
        'title',
      ]) {
        expect(typeof filterLabels?.[key]).toBe('string')
      }
      for (const key of [
        'activate',
        'clear',
        'copied',
        'copyPlates',
        'count',
        'count_other',
        'deactivate',
        'export',
        'select',
        'selectAll',
      ]) {
        expect(typeof selectionLabels?.[key]).toBe('string')
      }
    }
  })
})
