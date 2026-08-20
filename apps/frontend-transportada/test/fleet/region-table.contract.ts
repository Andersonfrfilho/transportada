/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type { FreightRegion } from '@/modules/fleet/shared/freightRegion.types'
import {
  FREIGHT_REGION_COLUMN_KEYS,
  readFreightRegionColumnPreferences,
  reorderFreightRegionColumns,
  writeFreightRegionColumnPreferences,
} from '@/modules/fleet/shared/freightRegionColumns.service'
import {
  buildFreightRegionCityList,
  buildFreightRegionCsv,
  FREIGHT_REGION_EXPORT_COLUMNS,
  FREIGHT_REGION_EXPORT_FILE_NAME,
} from '@/modules/fleet/shared/freightRegionExport.service'
import {
  clearFreightRegionFilterField,
  describeFreightRegionFilterPills,
  FREIGHT_REGION_PILL_FIELDS,
} from '@/modules/fleet/shared/freightRegionFilterPills.service'
import {
  collectFreightRegionFilterOptions,
  countActiveFreightRegionFilters,
  EMPTY_FREIGHT_REGION_TABLE_FILTERS,
  filterFreightRegions,
  FREIGHT_REGION_SORT_COLUMNS,
  nextFreightRegionSortState,
  rateOfRegion,
  sortFreightRegions,
} from '@/modules/fleet/shared/freightRegionTable.service'
import { FREIGHT_VEHICLE_CLASSES } from '@/modules/shared/freightClass.constant'
import type { TableColumnStorage } from '@/modules/shared/tableColumnPreferences.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const LIST_PATH = 'src/modules/fleet/components/FreightRegionList.component.tsx'
const FILTERS_PATH = 'src/modules/fleet/components/FreightRegionFilters.component.tsx'
const PANEL_PATH = 'src/modules/fleet/components/FreightRegionPanel.component.tsx'
const COLUMNS_MENU_PATH = 'src/modules/fleet/components/FreightRegionColumnsMenu.component.tsx'
const SELECTION_BAR_PATH = 'src/modules/fleet/components/FreightRegionSelectionBar.component.tsx'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const MATRIZ: FreightRegion = {
  cities: [{ city: 'RIBEIRÃO PRETO', state: 'SP' }],
  code: '0.001',
  createdAt: '2026-08-01T12:00:00.000Z',
  id: 'region-matriz',
  name: 'RIBEIRÃO PRETO',
  rates: [
    { driverAmount: '140.0000', freightClass: 'utility' },
    { driverAmount: '703.9700', freightClass: 'truck' },
  ],
  status: 'active',
  updatedAt: '2026-08-01T12:00:00.000Z',
  version: '1',
  zone: 0,
}

const BARRETOS: FreightRegion = {
  cities: [
    { city: 'PONTAL', state: 'SP' },
    { city: 'SERTÃOZINHO', state: 'SP' },
  ],
  code: '1.000',
  createdAt: '2026-08-02T12:00:00.000Z',
  id: 'region-barretos',
  name: 'BARRETOS',
  rates: [
    { driverAmount: '0.0000', freightClass: 'utility' },
    { driverAmount: '1086.1200', freightClass: 'truck' },
  ],
  status: 'active',
  updatedAt: '2026-08-02T12:00:00.000Z',
  version: '1',
  zone: 1,
}

const SEM_TRUCK: FreightRegion = {
  cities: [],
  code: '2.000',
  createdAt: '2026-08-03T12:00:00.000Z',
  id: 'region-sem-truck',
  name: 'FRANCA',
  rates: [{ driverAmount: '540.0000', freightClass: 'van' }],
  status: 'inactive',
  updatedAt: '2026-08-03T12:00:00.000Z',
  version: '1',
  zone: 1,
}

const REGIONS: readonly FreightRegion[] = [MATRIZ, BARRETOS, SEM_TRUCK]

function idsOf(regions: readonly FreightRegion[]): readonly string[] {
  return regions.map((region) => region.id)
}

function createStorage(seed?: string): TableColumnStorage & { value: null | string } {
  return {
    value: seed ?? null,
    getItem() {
      return this.value
    },
    setItem(_key: string, value: string) {
      this.value = value
    },
  }
}

describe('fleet freight region table contract', () => {
  test('cycles the header through ascending, descending and back to the natural order', () => {
    const first = nextFreightRegionSortState(null, 'code')
    const second = nextFreightRegionSortState(first, 'code')
    const third = nextFreightRegionSortState(second, 'code')

    expect(first).toEqual({ column: 'code', direction: 'asc' })
    expect(second).toEqual({ column: 'code', direction: 'desc' })
    expect(third).toBeNull()
    expect(nextFreightRegionSortState(second, 'truck')).toEqual({
      column: 'truck',
      direction: 'asc',
    })
    for (const freightClass of FREIGHT_VEHICLE_CLASSES) {
      expect(FREIGHT_REGION_SORT_COLUMNS).toContain(freightClass)
    }
  })

  /** Rota sem valor para a classe é falta de cadastro, não R$ 0,00: ela vai ao fim nas duas direções. */
  test('sorts the class column by money and keeps the route without that rate last', () => {
    const ascending = sortFreightRegions({
      regions: REGIONS,
      sort: { column: 'truck', direction: 'asc' },
    })
    const descending = sortFreightRegions({
      regions: REGIONS,
      sort: { column: 'truck', direction: 'desc' },
    })

    expect(idsOf(ascending)).toEqual(['region-matriz', 'region-barretos', 'region-sem-truck'])
    expect(idsOf(descending)).toEqual(['region-barretos', 'region-matriz', 'region-sem-truck'])
    expect(idsOf(sortFreightRegions({ regions: REGIONS, sort: null }))).toEqual(idsOf(REGIONS))
    expect(rateOfRegion(MATRIZ, 'truck')).toBe('703.9700')
    expect(rateOfRegion(SEM_TRUCK, 'truck')).toBeNull()
  })

  test('sorts by the number of cities and by the zone as numbers, not as text', () => {
    const byCities = sortFreightRegions({
      regions: REGIONS,
      sort: { column: 'cities', direction: 'desc' },
    })

    expect(idsOf(byCities)).toEqual(['region-barretos', 'region-matriz', 'region-sem-truck'])
    expect(
      idsOf(
        sortFreightRegions({ regions: REGIONS, sort: { column: 'zone', direction: 'asc' } }),
      )[0],
    ).toBe('region-matriz')
  })

  /** A cidade é digitada como se fala: quem procura "sertaozinho" acha SERTÃOZINHO. */
  test('searches route and city without accent and accepts more than one value per filter', () => {
    const byCity = filterFreightRegions({
      filters: { ...EMPTY_FREIGHT_REGION_TABLE_FILTERS, cityQuery: 'sertaozinho' },
      regions: REGIONS,
    })
    const byQuery = filterFreightRegions({
      filters: { ...EMPTY_FREIGHT_REGION_TABLE_FILTERS, query: 'ribeirao' },
      regions: REGIONS,
    })
    const byZone = filterFreightRegions({
      filters: { ...EMPTY_FREIGHT_REGION_TABLE_FILTERS, zones: [1] },
      regions: REGIONS,
    })
    const byClass = filterFreightRegions({
      filters: { ...EMPTY_FREIGHT_REGION_TABLE_FILTERS, classes: ['van'] },
      regions: REGIONS,
    })

    expect(idsOf(byCity)).toEqual(['region-barretos'])
    expect(idsOf(byQuery)).toEqual(['region-matriz'])
    expect(idsOf(byZone)).toEqual(['region-barretos', 'region-sem-truck'])
    expect(idsOf(byClass)).toEqual(['region-sem-truck'])
    expect(
      idsOf(
        filterFreightRegions({ filters: EMPTY_FREIGHT_REGION_TABLE_FILTERS, regions: REGIONS }),
      ),
    ).toEqual(idsOf(REGIONS))
  })

  test('counts the active filters and offers only the zones that exist', () => {
    const filters = {
      ...EMPTY_FREIGHT_REGION_TABLE_FILTERS,
      cityQuery: '  ',
      query: 'barretos',
      statuses: ['inactive'] as const,
      zones: [0, 1],
    }

    expect(countActiveFreightRegionFilters(EMPTY_FREIGHT_REGION_TABLE_FILTERS)).toBe(0)
    expect(countActiveFreightRegionFilters(filters)).toBe(3)
    expect(collectFreightRegionFilterOptions(REGIONS).zones).toEqual([0, 1])
  })

  test('describes every active filter as a removable pill and clears it by field', () => {
    const filters = {
      ...EMPTY_FREIGHT_REGION_TABLE_FILTERS,
      cityQuery: 'pontal',
      classes: ['truck'] as const,
      query: 'barretos',
      statuses: ['active', 'inactive'] as const,
      zones: [1],
    }
    const pills = describeFreightRegionFilterPills(filters)

    expect(pills.map((pill) => pill.field)).toEqual([
      'query',
      'cityQuery',
      'zones',
      'statuses',
      'classes',
    ])
    expect(pills[2]?.value).toBe('1')
    expect(pills[3]?.valueKeys?.length).toBe(2)
    expect(clearFreightRegionFilterField(filters, 'statuses').statuses).toEqual([])
    expect(clearFreightRegionFilterField(filters, 'query').query).toBe('')
    // Toda pílula tem de saber se apagar: campo sem caminho de volta é filtro preso na tela
    for (const field of FREIGHT_REGION_PILL_FIELDS) {
      expect(
        countActiveFreightRegionFilters(clearFreightRegionFilterField(filters, field)),
      ).toBeLessThan(5)
    }
  })

  test('keeps the column order and visibility in the browser storage', () => {
    const storage = createStorage()
    const [first, second] = FREIGHT_REGION_COLUMN_KEYS
    if (first === undefined || second === undefined) throw new Error('COLUMNS_MISSING')

    const preferences = {
      order: reorderFreightRegionColumns(FREIGHT_REGION_COLUMN_KEYS, second, 'up'),
      visibility: { ...allVisible(), [first]: false },
    }
    writeFreightRegionColumnPreferences({ preferences, storage })
    const stored = readFreightRegionColumnPreferences(storage)

    expect(stored.order[0]).toBe(second)
    expect(stored.visibility[first]).toBe(false)
    expect(readFreightRegionColumnPreferences(null).order).toEqual(FREIGHT_REGION_COLUMN_KEYS)
    expect(FREIGHT_REGION_COLUMN_KEYS).toContain('cities')
  })

  /** Ponto e vírgula e vírgula decimal: é o que a planilha em pt-BR abre sem assistente. */
  test('exports the selected routes as a spreadsheet the operator can open', () => {
    const csv = buildFreightRegionCsv({
      header: Object.fromEntries(
        FREIGHT_REGION_EXPORT_COLUMNS.map((column) => [column, column]),
      ) as Record<(typeof FREIGHT_REGION_EXPORT_COLUMNS)[number], string>,
      regions: [MATRIZ],
    })

    expect(csv).toContain('"code";"name"')
    expect(csv).toContain('"703,9700"')
    expect(csv).toContain('"RIBEIRÃO PRETO/SP"')
    expect(FREIGHT_REGION_EXPORT_FILE_NAME).toBe('regioes-frete.csv')
    expect(buildFreightRegionCityList([MATRIZ, BARRETOS])).toBe(
      'RIBEIRÃO PRETO/SP\nPONTAL/SP\nSERTÃOZINHO/SP',
    )
  })

  test('builds the table on the design system, with sorted headers and mass selection', async () => {
    const list = await readApplicationFile(LIST_PATH)
    const filters = await readApplicationFile(FILTERS_PATH)
    const panel = await readApplicationFile(PANEL_PATH)
    const columnsMenu = await readApplicationFile(COLUMNS_MENU_PATH)
    const selectionBar = await readApplicationFile(SELECTION_BAR_PATH)

    expect(list).toContain('aria-sort')
    expect(list).toContain('styles.srOnly')
    expect(list).toContain("from '@/components/ui/checkbox'")
    expect(filters).toContain("from '@/components/ui/filter-pills'")
    expect(panel).toContain("from '@/components/ui/count-badge'")
    expect(panel).toContain('FleetTableSkeleton')
    expect(columnsMenu).toContain('moveColumn')
    expect(selectionBar).toContain('clearSelection')
  })
})

function allVisible(): Record<(typeof FREIGHT_REGION_COLUMN_KEYS)[number], boolean> {
  return Object.fromEntries(FREIGHT_REGION_COLUMN_KEYS.map((column) => [column, true])) as Record<
    (typeof FREIGHT_REGION_COLUMN_KEYS)[number],
    boolean
  >
}
