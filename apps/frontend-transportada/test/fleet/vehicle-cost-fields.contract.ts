/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  loadFutureModule,
  NO_COSTS_VEHICLE_DETAIL,
  VEHICLE_BODY,
  VEHICLE_COST_DRAFT,
  VEHICLE_COSTS_UPDATED_AT,
  VEHICLE_DETAIL,
  VEHICLE_MONTHLY_FIXED_COST,
  type FleetVehicleCostFieldsContract,
  type FleetVehicleDetailContract,
} from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const COST_SERVICE_PATH = '../../src/modules/fleet/shared/fleetVehicleCost.service'
const FORM_SERVICE_PATH = '../../src/modules/fleet/shared/fleetForm.service'
const TABLE_SERVICE_PATH = '../../src/modules/fleet/shared/fleetVehicleTable.service'
const VALIDATION_PATH = '../../src/modules/fleet/shared/fleetResponse.validation'
const NOT_INFORMED = 'nao informado'
const COLOR_LABEL = 'Branca'

/** O contrato é "moeda em pt-BR", não o espaço que o `Intl` escolhe entre símbolo e número. */
const currencyFormatter = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet vehicle cost fields contract', () => {
  test('reads the six cost fields from the api and rejects a payload without them', async () => {
    const { createFleetResponseAdapters } =
      await loadFutureModule<FleetAdaptersModule>(VALIDATION_PATH)
    const adapters = createFleetResponseAdapters()

    expect(adapters.vehicleFromApi(VEHICLE_DETAIL)).toEqual(VEHICLE_DETAIL)
    // Veículo sem custo informado é o caso comum: zeros no corpo, derivados nulos
    expect(adapters.vehicleFromApi(NO_COSTS_VEHICLE_DETAIL)).toEqual(NO_COSTS_VEHICLE_DETAIL)

    const { costPerKilometer, ...withoutCostPerKilometer } = VEHICLE_DETAIL
    expect(costPerKilometer).toBe('1.2500')
    expect(() => adapters.vehicleFromApi(withoutCostPerKilometer)).toThrow('FLEET_RESPONSE_INVALID')
    expect(() => adapters.vehicleFromApi({ ...VEHICLE_DETAIL, acquisitionAmount: 150000 })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() => adapters.vehicleFromApi({ ...VEHICLE_DETAIL, monthlyFixedCost: 2400 })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() => adapters.vehicleFromApi({ ...VEHICLE_DETAIL, costsUpdatedAt: 0 })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
  })

  test('sends every cost field in the api scale, with zero for what was left blank', async () => {
    const { createVehicleDraft, toVehicleBody } =
      await loadFutureModule<FleetFormModule>(FORM_SERVICE_PATH)

    expect(toVehicleBody(createVehicleDraft())).toMatchObject(VEHICLE_COST_DRAFT)

    const typed = createVehicleDraft({
      acquisitionAmount: '150.000,50',
      annualInsuranceAmount: '3600',
      averageConsumption: '2,567',
      costPerKilometer: '1,25',
    })
    expect(toVehicleBody(typed)).toMatchObject({
      acquisitionAmount: '150000.5000',
      annualInsuranceAmount: '3600.0000',
      annualVehicleTaxAmount: '0.0000',
      // Terceira casa digitada arredonda para a escala do consumo, em vez de recusar o cadastro
      averageConsumption: '2.57',
      costPerKilometer: '1.2500',
      monthlyInstallmentAmount: '0.0000',
    })
  })

  test('brings the costs back for editing and shows zero as an empty field', async () => {
    const { toVehicleFormState } = await loadFutureModule<FleetFormModule>(FORM_SERVICE_PATH)

    expect(toVehicleFormState(VEHICLE_DETAIL)).toMatchObject({
      acquisitionAmount: '150000,00',
      annualInsuranceAmount: '3600,00',
      annualVehicleTaxAmount: '1200,00',
      averageConsumption: '2,50',
      // Custo por km é decimal de quatro casas por natureza — arredondar na tela esconderia dígito
      costPerKilometer: '1,2500',
      monthlyInstallmentAmount: '2000,00',
    })
    expect(toVehicleFormState(NO_COSTS_VEHICLE_DETAIL)).toMatchObject({
      acquisitionAmount: '',
      annualInsuranceAmount: '',
      annualVehicleTaxAmount: '',
      averageConsumption: '',
      costPerKilometer: '',
      monthlyInstallmentAmount: '',
    })
  })

  test('derives the monthly fixed cost by the same rule the api applies', async () => {
    const { deriveMonthlyFixedCost } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    expect(deriveMonthlyFixedCost(VEHICLE_BODY)).toBe(VEHICLE_MONTHLY_FIXED_COST)
    expect(deriveMonthlyFixedCost(VEHICLE_COST_DRAFT)).toBe(null)
    // 100 ÷ 12 não fecha na escala: arredonda meio para cima, como o domínio da API
    expect(
      deriveMonthlyFixedCost({ ...VEHICLE_COST_DRAFT, annualVehicleTaxAmount: '100.0000' }),
    ).toBe('8.3333')
    // Consumo e valor de aquisição não entram no custo fixo mensal
    expect(
      deriveMonthlyFixedCost({
        ...VEHICLE_COST_DRAFT,
        acquisitionAmount: '150000.0000',
        averageConsumption: '2.50',
      }),
    ).toBe(null)
  })

  test('summarizes the costs in currency and calls zero "not informed"', async () => {
    const { summarizeVehicleCosts } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    expect(summarizeVehicleCosts(VEHICLE_BODY)).toEqual({
      costPerKilometer: currencyFormatter.format(1.25),
      monthlyFixedCost: currencyFormatter.format(2400),
    })
    expect(summarizeVehicleCosts(VEHICLE_COST_DRAFT)).toEqual({
      costPerKilometer: null,
      monthlyFixedCost: null,
    })
  })

  test('offers cost columns hidden by default and formats their cells', async () => {
    const { readFleetVehicleColumnPreferences, readFleetVehicleColumnValue } =
      await loadFutureModule<FleetVehicleTableModule>(TABLE_SERVICE_PATH)

    const preferences = readFleetVehicleColumnPreferences(null)
    expect(preferences.order).toEqual([
      'brand',
      'model',
      'modelYear',
      'axleCount',
      'color',
      'costPerKilometer',
      'monthlyFixedCost',
    ])
    expect(preferences.visibility.costPerKilometer).toBe(false)
    expect(preferences.visibility.monthlyFixedCost).toBe(false)

    expect(
      readFleetVehicleColumnValue({
        column: 'monthlyFixedCost',
        colorLabel: COLOR_LABEL,
        notInformedLabel: NOT_INFORMED,
        vehicle: VEHICLE_DETAIL,
      }),
    ).toBe(currencyFormatter.format(2400))
    expect(
      readFleetVehicleColumnValue({
        column: 'costPerKilometer',
        colorLabel: COLOR_LABEL,
        notInformedLabel: NOT_INFORMED,
        vehicle: NO_COSTS_VEHICLE_DETAIL,
      }),
    ).toBe(NOT_INFORMED)
    expect(
      readFleetVehicleColumnValue({
        column: 'monthlyFixedCost',
        colorLabel: COLOR_LABEL,
        notInformedLabel: NOT_INFORMED,
        vehicle: NO_COSTS_VEHICLE_DETAIL,
      }),
    ).toBe(NOT_INFORMED)
    expect(
      readFleetVehicleColumnValue({
        column: 'color',
        colorLabel: COLOR_LABEL,
        notInformedLabel: NOT_INFORMED,
        vehicle: VEHICLE_DETAIL,
      }),
      // A célula mostra o nome traduzido: a coluna guardaria "branca" e a tela é bilíngue
    ).toBe(COLOR_LABEL)
  })

  test('renders the cost block last in the form, with the six fields and the read summary', async () => {
    const [form, costFields] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleForm.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleCostFields.component.tsx'),
    ])

    const blocks = [
      'VehicleIdentityFields',
      'VehicleModelFields',
      'VehicleOperationFields',
      'VehicleOwnerFields',
      'VehicleCostFields',
    ]
    const positions = blocks.map((block) => form.indexOf(`<${block}`))
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
    expect(positions.at(-1)).toBeGreaterThan(0)

    expect(costFields).toContain("t('vehicleCostLegend')")
    for (const field of [
      'acquisitionAmount',
      'annualInsuranceAmount',
      'annualVehicleTaxAmount',
      'averageConsumption',
      'costPerKilometer',
      'monthlyInstallmentAmount',
    ]) {
      expect(costFields).toContain(`t('${field}')`)
      expect(costFields).toContain(`{ ${field} }`)
    }
    expect(costFields).toContain('summarizeTypedVehicleCosts')
    expect(costFields).toContain("t('costNotInformed')")
    expect(costFields).toContain('costsUpdatedAt')
  })

  /**
   * É o defeito relatado: "Valor de aquisição (R$) (opcional)" quebra em duas linhas e
   * "Prestação mensal" não, então os dois campos da mesma fileira começavam em alturas diferentes.
   */
  test('lines up every field of a row by subgrid, whatever the label length', async () => {
    const styles = await readApplicationFile('src/modules/fleet/styles/fleet.module.css')

    expect(styles).toContain('grid-template-rows: subgrid')
    // Rótulo, campo e dica: três trilhos, senão a dica de "Número de frota" desalinha a fileira.
    expect(styles).toContain('grid-row: span 3')
    expect(styles).toContain('row-gap: var(--space-1)')
    // O rótulo desce até o campo: no trilho compartilhado, o curto flutuaria longe dele.
    expect(styles).toMatch(/\.fieldGrid label > span \{\s*align-self: end/)
  })

  test('names every cost label and the summary in both locales', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      for (const key of [
        'acquisitionAmount',
        'annualInsuranceAmount',
        'annualVehicleTaxAmount',
        'averageConsumption',
        'costNotInformed',
        'costPerKilometer',
        'costSummaryTitle',
        'costsUpdatedAt',
        'monthlyFixedCost',
        'monthlyInstallmentAmount',
        'vehicleCostLegend',
        'vehicleCostHint',
      ]) {
        expect(typeof dictionary[key]).toBe('string')
      }
      const columns = dictionary.columns as Record<string, unknown> | undefined
      expect(typeof columns?.costPerKilometer).toBe('string')
      expect(typeof columns?.monthlyFixedCost).toBe('string')
    }
  })

  test('keeps the reference date of the costs beside the summary', () => {
    expect(VEHICLE_DETAIL.costsUpdatedAt).toBe(VEHICLE_COSTS_UPDATED_AT)
    expect(NO_COSTS_VEHICLE_DETAIL.costsUpdatedAt).toBe(null)
  })
})

type FleetVehicleCostSummaryContract = Readonly<{
  costPerKilometer: null | string
  monthlyFixedCost: null | string
}>

type FleetCostModule = {
  readonly deriveMonthlyFixedCost: (fields: FleetVehicleCostFieldsContract) => null | string
  readonly summarizeVehicleCosts: (
    fields: FleetVehicleCostFieldsContract,
  ) => FleetVehicleCostSummaryContract
}

type FleetVehicleFormStateContract = Record<string, string>

type FleetFormModule = {
  readonly createVehicleDraft: (
    input?: Readonly<Record<string, unknown>>,
  ) => FleetVehicleFormStateContract
  readonly toVehicleBody: (state: FleetVehicleFormStateContract) => Record<string, unknown>
  readonly toVehicleFormState: (
    vehicle: FleetVehicleDetailContract,
  ) => FleetVehicleFormStateContract
}

type FleetAdaptersModule = {
  readonly createFleetResponseAdapters: () => {
    readonly vehicleFromApi: (input: unknown) => unknown
  }
}

type FleetVehicleColumnKeyContract =
  | 'axleCount'
  | 'brand'
  | 'color'
  | 'costPerKilometer'
  | 'model'
  | 'modelYear'
  | 'monthlyFixedCost'

type FleetVehicleTableModule = {
  readonly readFleetVehicleColumnPreferences: (storage: null) => Readonly<{
    order: readonly FleetVehicleColumnKeyContract[]
    visibility: Readonly<Record<FleetVehicleColumnKeyContract, boolean>>
  }>
  readonly readFleetVehicleColumnValue: (input: {
    readonly colorLabel: string
    readonly column: FleetVehicleColumnKeyContract
    readonly notInformedLabel: string
    readonly vehicle: FleetVehicleDetailContract
  }) => string
}
