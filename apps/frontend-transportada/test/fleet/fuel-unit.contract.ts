/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const COST_SERVICE_PATH = '../../src/modules/fleet/shared/fleetVehicleCost.service'
const FUEL_CATALOG_PATH = '../../src/modules/shared/fuel.constant'
const COST_FIELDS_PATH = 'src/modules/fleet/components/VehicleCostFields.component.tsx'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readDictionary(fileName: string): Promise<Record<string, unknown>> {
  const locale = await readApplicationFile(`src/modules/fleet/locales/${fileName}`)
  return JSON.parse(locale) as Record<string, unknown>
}

function readNestedLabel(dictionary: Record<string, unknown>, key: string): string | undefined {
  const [group, entry] = key.split('.')
  const values = dictionary[group ?? ''] as Record<string, string> | undefined
  return values?.[entry ?? '']
}

describe('fleet fuel unit contract', () => {
  /**
   * O veículo a GNV anda com metro cúbico. Rótulo fixo em "km/l" e "R$/litro" põe o número certo
   * debaixo da unidade errada — e é o operador que paga a conta ao conferir contra a nota do posto.
   */
  test('labels consumption and price by the unit of the selected fuel', async () => {
    const { resolveFuelLabelKeys } = await loadFutureModule<FleetFuelLabelModule>(COST_SERVICE_PATH)

    expect(resolveFuelLabelKeys('diesel-s10')).toEqual({
      averageConsumption: 'consumptionByUnit.litre',
      fuelPricePerUnit: 'fuelPriceByUnit.litre',
    })
    expect(resolveFuelLabelKeys('gnv')).toEqual({
      averageConsumption: 'consumptionByUnit.cubic-metre',
      fuelPricePerUnit: 'fuelPriceByUnit.cubic-metre',
    })
  })

  test('resolves a label pair for every product of the catalog, in both dictionaries', async () => {
    const { resolveFuelLabelKeys } = await loadFutureModule<FleetFuelLabelModule>(COST_SERVICE_PATH)
    const { FUEL_TYPES } = await loadFutureModule<FuelCatalogModule>(FUEL_CATALOG_PATH)
    const [pt, en] = await Promise.all([
      readDictionary('fleet.locale.json'),
      readDictionary('fleet.en.locale.json'),
    ])

    for (const { product } of FUEL_TYPES) {
      const keys = resolveFuelLabelKeys(product)
      for (const dictionary of [pt, en]) {
        expect(typeof readNestedLabel(dictionary, keys.averageConsumption)).toBe('string')
        expect(typeof readNestedLabel(dictionary, keys.fuelPricePerUnit)).toBe('string')
      }
      // O produto também é opção do select, e opção sem rótulo aparece como a chave crua na tela
      expect(typeof (pt['fuelOption'] as Record<string, string>)[product]).toBe('string')
      expect(typeof (en['fuelOption'] as Record<string, string>)[product]).toBe('string')
    }
  })

  test('spells the unit the operator reads on the pump', async () => {
    const pt = await readDictionary('fleet.locale.json')

    expect(readNestedLabel(pt, 'consumptionByUnit.litre')).toContain('km/l')
    expect(readNestedLabel(pt, 'consumptionByUnit.cubic-metre')).toContain('km/m³')
    expect(readNestedLabel(pt, 'fuelPriceByUnit.litre')).toContain('litro')
    expect(readNestedLabel(pt, 'fuelPriceByUnit.cubic-metre')).toContain('m³')
    // "litro" solto no rótulo do metro cúbico é o erro que este contrato existe para pegar
    expect(readNestedLabel(pt, 'consumptionByUnit.cubic-metre')).not.toContain('km/l ')
    expect(readNestedLabel(pt, 'fuelPriceByUnit.cubic-metre')).not.toContain('litro')
  })

  test('takes the two labels from the resolver instead of a fixed key', async () => {
    const costFields = await readApplicationFile(COST_FIELDS_PATH)

    expect(costFields).toContain('resolveFuelLabelKeys')
    // Chave fixa é o que faz o rótulo mentir quando o combustível muda
    expect(costFields).not.toContain("t('averageConsumption')")
    expect(costFields).not.toContain("t('fuelPricePerUnit')")
  })
})

type FuelProductContract = string

type FleetFuelLabelModule = {
  readonly resolveFuelLabelKeys: (product: FuelProductContract) => Readonly<{
    averageConsumption: string
    fuelPricePerUnit: string
  }>
}

type FuelCatalogModule = {
  readonly FUEL_TYPES: readonly Readonly<{ product: FuelProductContract; unit: string }>[]
}
