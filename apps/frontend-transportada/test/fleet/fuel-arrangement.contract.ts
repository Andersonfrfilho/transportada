/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  FLEX_VEHICLE_BODY,
  FLEX_VEHICLE_DETAIL,
  loadFutureModule,
  VEHICLE_COST_DRAFT,
  VEHICLE_DETAIL,
  type FleetVehicleCostFieldsContract,
  type FleetVehicleDetailContract,
  type FleetVehicleFuelProductContract,
} from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ARRANGEMENT_SERVICE_PATH = '../../src/modules/fleet/shared/fuelArrangement.service'
const COST_SERVICE_PATH = '../../src/modules/fleet/shared/fleetVehicleCost.service'
const EXPORT_SERVICE_PATH = '../../src/modules/fleet/shared/vehicleSelectionExport.service'
const FUEL_CATALOG_PATH = '../../src/modules/shared/fuel.constant'
const TABLE_SERVICE_PATH = '../../src/modules/fleet/shared/fleetVehicleTable.service'
const VEHICLE_TABLE_PATH = '../../src/modules/fleet/shared/vehicleTable.service'

/**
 * Copiada **literalmente** de `api-transportada/test/fleet-domain/vehicle-cost.contract.ts`. A tela
 * refaz a conta que a API já fez, e é a média que o operador confere contra as duas notas do posto:
 * as duas contas divergirem por um centavo é o defeito que ninguém consegue explicar depois.
 */
const TWO_TANK_CASES = [
  // preço e consumo do primário, preço e consumo do secundário, parcela primária, secundária, média
  ['5.4800', '12.00', '4.2000', '8.00', '0.4567', '0.5250', '0.4909'],
  ['6.1230', '3.00', '0.7500', '2.00', '2.0410', '0.3750', '1.2080'],
  ['5.4801', '4.00', '5.4802', '4.00', '1.3700', '1.3701', '1.3701'],
] as const

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

describe('fleet fuel arrangement contract', () => {
  for (const [
    primaryPrice,
    primaryConsumption,
    secondaryPrice,
    secondaryConsumption,
    primaryParcel,
    secondaryParcel,
    average,
  ] of TWO_TANK_CASES) {
    test(`averages ${primaryPrice} over ${primaryConsumption} with ${secondaryPrice} over ${secondaryConsumption} as ${average}`, async () => {
      const { deriveCostPerKilometer } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

      expect(
        deriveCostPerKilometer({
          fields: { ...VEHICLE_COST_DRAFT, averageConsumption: primaryConsumption },
          fuelPricePerUnit: primaryPrice,
          secondaryFuel: {
            averageConsumption: secondaryConsumption,
            pricePerUnit: secondaryPrice,
          },
        }),
      ).toEqual({
        breakdown: { fuel: average, primaryFuel: primaryParcel, secondaryFuel: secondaryParcel },
        total: average,
      })
    })
  }

  /**
   * Dividir por dois com um tanque só cortaria o custo do veículo pela metade enquanto ninguém
   * termina o cadastro — e o segundo tanque sem preço é a energia esperando a tarifa da ANEEL.
   */
  test('keeps the single tank arithmetic while the second tank is not complete', async () => {
    const { deriveCostPerKilometer } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)
    const fields = { ...VEHICLE_COST_DRAFT, averageConsumption: '12.00' }
    const alone = { breakdown: { fuel: '0.4567' }, total: '0.4567' }

    expect(deriveCostPerKilometer({ fields, fuelPricePerUnit: '5.4800' })).toEqual(alone)
    expect(
      deriveCostPerKilometer({
        fields,
        fuelPricePerUnit: '5.4800',
        secondaryFuel: { averageConsumption: '8.00', pricePerUnit: null },
      }),
    ).toEqual(alone)
    expect(
      deriveCostPerKilometer({
        fields,
        fuelPricePerUnit: '5.4800',
        secondaryFuel: { averageConsumption: '0.00', pricePerUnit: '4.2000' },
      }),
    ).toEqual(alone)
  })

  /**
   * "Flex" e "Híbrido" são leitura do par, não coluna: o operador escolhe dois combustíveis, e é a
   * tela que sabe o nome disso. Com um tanque só o rótulo é o próprio produto — um veículo elétrico
   * é "Elétrico", e uma entrada `fuelArrangement.single` diria "Um combustível" numa coluna
   * chamada Combustível.
   */
  test('reads the arrangement from the pair and calls the single tank by the product it burns', async () => {
    const { resolveFuelArrangement, resolveFuelArrangementLabelKey } =
      await loadFutureModule<FuelArrangementModule>(ARRANGEMENT_SERVICE_PATH)

    const flex = { fuelType: 'gasolina-comum', secondaryFuelType: 'etanol-hidratado' } as const
    const hybrid = { fuelType: 'eletrico', secondaryFuelType: 'gasolina-comum' } as const
    const plugIn = { fuelType: 'gasolina-comum', secondaryFuelType: 'eletrico' } as const
    const electric = { fuelType: 'eletrico', secondaryFuelType: '' } as const
    const diesel = { fuelType: 'diesel-s10', secondaryFuelType: '' } as const

    expect(resolveFuelArrangement(flex)).toBe('flex')
    expect(resolveFuelArrangement(hybrid)).toBe('hybrid')
    expect(resolveFuelArrangement(plugIn)).toBe('hybrid')
    expect(resolveFuelArrangement(electric)).toBe('single')
    expect(resolveFuelArrangement(diesel)).toBe('single')

    expect(resolveFuelArrangementLabelKey(flex)).toBe('fuelArrangement.flex')
    expect(resolveFuelArrangementLabelKey(hybrid)).toBe('fuelArrangement.hybrid')
    expect(resolveFuelArrangementLabelKey(plugIn)).toBe('fuelArrangement.hybrid')
    expect(resolveFuelArrangementLabelKey(electric)).toBe('fuelOption.eletrico')
    expect(resolveFuelArrangementLabelKey(diesel)).toBe('fuelOption.diesel-s10')
  })

  test('names flex and hybrid in both dictionaries and leaves the single tank to the fuel catalogue', async () => {
    const { FUEL_TYPES } = await loadFutureModule<FuelCatalogModule>(FUEL_CATALOG_PATH)
    const { resolveFuelArrangementLabelKey } =
      await loadFutureModule<FuelArrangementModule>(ARRANGEMENT_SERVICE_PATH)
    const dictionaries = await Promise.all([
      readDictionary('fleet.locale.json'),
      readDictionary('fleet.en.locale.json'),
    ])

    for (const dictionary of dictionaries) {
      expect(typeof readNestedLabel(dictionary, 'fuelArrangement.flex')).toBe('string')
      expect(typeof readNestedLabel(dictionary, 'fuelArrangement.hybrid')).toBe('string')
      // O rótulo que a tela nunca pede é o que envelhece dizendo bobagem
      expect(readNestedLabel(dictionary, 'fuelArrangement.single')).toBeUndefined()
      expect(typeof dictionary.secondaryFuelType).toBe('string')
      expect(typeof dictionary.secondaryFuelNone).toBe('string')

      for (const { product } of FUEL_TYPES) {
        const key = resolveFuelArrangementLabelKey({ fuelType: product, secondaryFuelType: '' })
        expect(typeof readNestedLabel(dictionary, key)).toBe('string')
      }
    }
  })

  test('offers every product but the primary as the second tank', async () => {
    const { listSecondaryFuelOptions } =
      await loadFutureModule<FuelArrangementModule>(ARRANGEMENT_SERVICE_PATH)
    const { FUEL_TYPES } = await loadFutureModule<FuelCatalogModule>(FUEL_CATALOG_PATH)
    const catalogue = FUEL_TYPES.map(({ product }) => product)

    for (const product of catalogue) {
      const options = listSecondaryFuelOptions(product)
      // Produto repetido nos dois tanques não é flex: é o mesmo combustível contado duas vezes
      expect(options).not.toContain(product)
      expect(options).toEqual(catalogue.filter((candidate) => candidate !== product))
    }
  })

  /** As duas metades do CHECK do banco, ditas antes do 400 — e sem `previous`, para serem idempotentes. */
  test('clears the second consumption when the product leaves and the pair when the two collide', async () => {
    const { resolveSecondaryFuelDefaults } =
      await loadFutureModule<FuelArrangementModule>(ARRANGEMENT_SERVICE_PATH)

    expect(
      resolveSecondaryFuelDefaults({
        fuelType: 'gasolina-comum',
        secondaryAverageConsumption: '8,00',
        secondaryFuelType: '',
      }),
    ).toEqual({ secondaryAverageConsumption: '' })
    expect(
      resolveSecondaryFuelDefaults({
        fuelType: 'gasolina-comum',
        secondaryAverageConsumption: '8,00',
        secondaryFuelType: 'gasolina-comum',
      }),
    ).toEqual({ secondaryAverageConsumption: '', secondaryFuelType: '' })
    expect(
      resolveSecondaryFuelDefaults({
        fuelType: 'gasolina-comum',
        secondaryAverageConsumption: '8,00',
        secondaryFuelType: 'etanol-hidratado',
      }),
    ).toEqual({})
    expect(
      resolveSecondaryFuelDefaults({
        fuelType: 'gasolina-comum',
        secondaryAverageConsumption: '',
        secondaryFuelType: '',
      }),
    ).toEqual({})
  })

  test('shows the arrangement as a column of the fleet table, hidden like the other derived ones', async () => {
    const { readFleetVehicleColumnPreferences, readFleetVehicleColumnValue } =
      await loadFutureModule<FleetVehicleTableModule>(TABLE_SERVICE_PATH)
    const { VEHICLE_SORT_COLUMNS } = await loadFutureModule<VehicleTableModule>(VEHICLE_TABLE_PATH)
    const preferences = readFleetVehicleColumnPreferences(null)

    expect(preferences.order).toContain('fuelArrangement')
    expect(preferences.visibility.fuelArrangement).toBe(false)
    // O cabeçalho da tabela é ordenável por construção: coluna fora da lista de ordenação não compila
    expect(VEHICLE_SORT_COLUMNS).toContain('fuelArrangement')

    expect(
      readFleetVehicleColumnValue({
        colorLabel: 'Branca',
        column: 'fuelArrangement',
        fuelArrangementLabel: 'Flex',
        notInformedLabel: 'nao informado',
        vehicle: FLEX_VEHICLE_DETAIL,
      }),
    ).toBe('Flex')
  })

  test('sorts the arrangement column by the label the operator reads', async () => {
    const { sortVehicles } = await loadFutureModule<VehicleTableModule>(VEHICLE_TABLE_PATH)
    const fleet = [FLEX_VEHICLE_DETAIL, VEHICLE_DETAIL]
    const ascending = sortVehicles({
      sort: { column: 'fuelArrangement', direction: 'asc' },
      vehicles: fleet,
    })

    // `fuelArrangement.flex` antes de `fuelOption.diesel-s10`: a chave é estável, o rótulo é traduzido
    expect(ascending.map((vehicle) => vehicle.id)).toEqual([
      FLEX_VEHICLE_DETAIL.id,
      VEHICLE_DETAIL.id,
    ])
    expect(
      sortVehicles({ sort: { column: 'fuelArrangement', direction: 'desc' }, vehicles: fleet }).map(
        (vehicle) => vehicle.id,
      ),
    ).toEqual([VEHICLE_DETAIL.id, FLEX_VEHICLE_DETAIL.id])
  })

  /**
   * O arranjo sozinho perde quais dois combustíveis o veículo bebe, e o segundo produto sozinho não
   * diz que aquilo se chama flex. A planilha leva os dois.
   */
  test('exports the arrangement and the second product beside the first', async () => {
    const { buildVehicleSelectionCsv, VEHICLE_EXPORT_COLUMNS } =
      await loadFutureModule<VehicleExportModule>(EXPORT_SERVICE_PATH)

    expect(VEHICLE_EXPORT_COLUMNS).toContain('fuelArrangement')
    expect(VEHICLE_EXPORT_COLUMNS).toContain('secondaryFuelType')

    const header = Object.fromEntries(
      VEHICLE_EXPORT_COLUMNS.map((column) => [column, `head:${column}`]),
    ) as Record<string, string>
    const csv = buildVehicleSelectionCsv({
      labels: {
        header,
        translateValue: (input) => (input.value === '' ? '' : `t:${input.value}`),
      },
      vehicles: [FLEX_VEHICLE_DETAIL, VEHICLE_DETAIL],
    })
    const [, flexRow = '', singleRow = ''] = csv.split('\r\n')
    const cellOf = (row: string, column: string): string | undefined =>
      row.split(';')[VEHICLE_EXPORT_COLUMNS.indexOf(column)]

    expect(cellOf(flexRow, 'secondaryFuelType')).toBe('"t:etanol-hidratado"')
    // A coluna do arranjo devolve a chave inteira: ela alterna entre dois grupos por linha
    expect(cellOf(flexRow, 'fuelArrangement')).toBe('"t:fuelArrangement.flex"')
    expect(cellOf(singleRow, 'fuelArrangement')).toBe('"t:fuelOption.diesel-s10"')
    // Tanque único não tem segundo produto, e a célula vazia é o que a planilha mostra
    expect(cellOf(singleRow, 'secondaryFuelType')).toBe('""')
  })

  test('carries the second pair through the vehicle body without inventing a product', () => {
    expect(FLEX_VEHICLE_BODY.secondaryFuelType).toBe('etanol-hidratado')
    expect(FLEX_VEHICLE_BODY.secondaryFuelType).not.toBe(FLEX_VEHICLE_BODY.fuelType)
    expect(VEHICLE_DETAIL.secondaryFuelType).toBe('')
    expect(VEHICLE_DETAIL.secondaryFuelPrice).toBe(null)
  })
})

type FuelArrangementInputContract = Readonly<{
  fuelType: FleetVehicleFuelProductContract
  secondaryFuelType: '' | FleetVehicleFuelProductContract
}>

type FuelArrangementModule = {
  readonly listSecondaryFuelOptions: (
    primary: FleetVehicleFuelProductContract,
  ) => readonly FleetVehicleFuelProductContract[]
  readonly resolveFuelArrangement: (input: FuelArrangementInputContract) => string
  readonly resolveFuelArrangementLabelKey: (input: FuelArrangementInputContract) => string
  readonly resolveSecondaryFuelDefaults: (
    state: FuelArrangementInputContract & Readonly<{ secondaryAverageConsumption: string }>,
  ) => Readonly<Record<string, string>>
}

type DeriveCostPerKilometerInputContract = Readonly<{
  fields: FleetVehicleCostFieldsContract
  fuelPricePerUnit: null | string
  secondaryFuel?: Readonly<{ averageConsumption: string; pricePerUnit: null | string }>
}>

type FleetCostModule = {
  readonly deriveCostPerKilometer: (input: DeriveCostPerKilometerInputContract) => null | {
    readonly breakdown: Readonly<Record<string, string>>
    readonly total: string
  }
}

type FuelCatalogModule = {
  readonly FUEL_TYPES: readonly Readonly<{
    product: FleetVehicleFuelProductContract
    unit: string
  }>[]
}

type FleetVehicleTableModule = {
  readonly readFleetVehicleColumnPreferences: (storage: null) => Readonly<{
    order: readonly string[]
    visibility: Readonly<Record<string, boolean>>
  }>
  readonly readFleetVehicleColumnValue: (input: {
    readonly colorLabel: string
    readonly column: string
    readonly fuelArrangementLabel: string
    readonly notInformedLabel: string
    readonly vehicle: FleetVehicleDetailContract
  }) => string
}

type VehicleTableModule = {
  readonly sortVehicles: (input: {
    readonly sort: Readonly<{ column: string; direction: 'asc' | 'desc' }> | null
    readonly vehicles: readonly FleetVehicleDetailContract[]
  }) => readonly FleetVehicleDetailContract[]
  readonly VEHICLE_SORT_COLUMNS: readonly string[]
}

type VehicleExportModule = {
  readonly buildVehicleSelectionCsv: (input: {
    readonly labels: Readonly<{
      header: Record<string, string>
      translateValue: (input: Readonly<{ column: string; value: string }>) => string
    }>
    readonly vehicles: readonly FleetVehicleDetailContract[]
  }) => string
  readonly VEHICLE_EXPORT_COLUMNS: readonly string[]
}
