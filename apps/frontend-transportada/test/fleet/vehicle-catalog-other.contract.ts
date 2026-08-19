/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const FLEET = [
  { brand: 'Volvo', model: 'FH 540' },
  { brand: 'VOLVO', model: 'FH 460' },
  { brand: 'Randon', model: 'SR Graneleiro' },
  { brand: 'Randon', model: 'sr graneleiro' },
  { brand: '', model: '' },
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function loadChoices(): Promise<CatalogChoicesModule> {
  return loadFutureModule<CatalogChoicesModule>(
    '../../src/modules/fleet/shared/vehicleCatalogChoices.service',
  )
}

describe('fleet vehicle catalog "other" contract', () => {
  /**
   * O catálogo FIPE não tem tudo: implemento, marca regional e cavalo antigo ficam de fora. Sem
   * saída o operador trava numa lista que não contém o veículo que está com o CRLV na mão.
   */
  test('offers an escape from the list instead of trapping the vehicle outside the catalog', async () => {
    const { VEHICLE_CATALOG_OTHER_VALUE } = await loadChoices()
    const [field, modelFields] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleCatalogField.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleModelFields.component.tsx'),
    ])

    expect(VEHICLE_CATALOG_OTHER_VALUE).toBe('__outro__')
    expect(field).toContain('VEHICLE_CATALOG_OTHER_VALUE')
    expect(field).toContain("t('catalogOtherOption')")
    // Escolher "Outro" por engano não pode ser sem volta: a lista continua a um clique
    expect(field).toContain("t('catalogBackToList')")
    expect(modelFields).toContain('<VehicleCatalogField')
  })

  /** O sentinela é gatilho de digitação, nunca marca: gravá-lo põe `__outro__` no MDF-e. */
  test('never lets the sentinel reach the form state as a name', async () => {
    const { VEHICLE_CATALOG_OTHER_VALUE, buildVehicleCatalogChoices } = await loadChoices()
    const choices = buildVehicleCatalogChoices({
      catalog: [{ code: '103', name: 'Volvo' }],
      registered: ['Randon'],
      selected: '',
    })

    expect(choices.map((choice) => choice.value)).not.toContain(VEHICLE_CATALOG_OTHER_VALUE)
    const field = await readApplicationFile(
      'src/modules/fleet/components/VehicleCatalogField.component.tsx',
    )
    expect(field).toContain("onChange('')")
  })

  /**
   * A marca digitada à mão hoje é opção amanhã. Sem isso cada veículo fora do catálogo é redigitado
   * do zero, e "RANDON" e "Randon" viram duas marcas na mesma frota.
   */
  test('pulls the off-catalog names already in the fleet into the next listing', async () => {
    const { buildVehicleCatalogChoices, readRegisteredVehicleBrands } = await loadChoices()

    expect(readRegisteredVehicleBrands(FLEET)).toEqual(['Randon', 'Volvo'])

    const choices = buildVehicleCatalogChoices({
      catalog: [
        { code: '102', name: 'Scania' },
        { code: '103', name: 'Volvo' },
      ],
      registered: readRegisteredVehicleBrands(FLEET),
      selected: '',
    })

    // Catálogo primeiro, na ordem do provedor; a frota entra só com o que ele não tem
    expect(choices).toEqual([
      { label: 'Scania', value: 'Scania' },
      { label: 'Volvo', value: 'Volvo' },
      { label: 'Randon', value: 'Randon' },
    ])
  })

  /** Modelo fora do catálogo pertence a uma marca: oferecer os da frota inteira é oferecer ruído. */
  test('scopes the fleet models to the chosen brand', async () => {
    const { readRegisteredVehicleModels } = await loadChoices()

    expect(readRegisteredVehicleModels({ brand: 'volvo', vehicles: FLEET })).toEqual([
      'FH 460',
      'FH 540',
    ])
    expect(readRegisteredVehicleModels({ brand: ' RANDON ', vehicles: FLEET })).toEqual([
      'SR Graneleiro',
    ])
    expect(readRegisteredVehicleModels({ brand: '', vehicles: FLEET })).toEqual([])
    expect(readRegisteredVehicleModels({ brand: 'Iveco', vehicles: FLEET })).toEqual([])
  })

  /** Ficha antiga não pode abrir em branco: a marca gravada aparece escolhida mesmo fora do catálogo. */
  test('keeps a stored name visible even when neither the catalog nor the fleet lists it', async () => {
    const { buildVehicleCatalogChoices } = await loadChoices()

    expect(
      buildVehicleCatalogChoices({
        catalog: [{ code: '103', name: 'Volvo' }],
        registered: [],
        selected: 'Facchini',
      }),
    ).toEqual([
      { label: 'Volvo', value: 'Volvo' },
      { label: 'Facchini', value: 'Facchini' },
    ])
    // A mesma marca com outra caixa não vira segunda opção
    expect(
      buildVehicleCatalogChoices({
        catalog: [{ code: '103', name: 'Volvo' }],
        registered: [],
        selected: 'VOLVO',
      }),
    ).toEqual([{ label: 'Volvo', value: 'Volvo' }])
    expect(
      buildVehicleCatalogChoices({ catalog: undefined, registered: [], selected: '' }),
    ).toEqual([])
  })

  /** Select com uma opção só ("Outro") é escolha falsa: sem nome nenhum o campo já abre digitável. */
  test('opens typing straight away when there is nothing to list', async () => {
    const { resolveVehicleCatalogEntryMode } = await loadChoices()
    const listed = { choiceCount: 3, isDisabled: false, isLoading: false, isTyping: false }

    expect(resolveVehicleCatalogEntryMode(listed)).toBe('list')
    expect(resolveVehicleCatalogEntryMode({ ...listed, isTyping: true })).toBe('text')
    expect(resolveVehicleCatalogEntryMode({ ...listed, choiceCount: 0 })).toBe('text')
    // Carregando e bloqueado por rodado continuam sendo lista: o motivo já está dito na tela
    expect(resolveVehicleCatalogEntryMode({ ...listed, choiceCount: 0, isLoading: true })).toBe(
      'list',
    )
    expect(resolveVehicleCatalogEntryMode({ ...listed, choiceCount: 0, isDisabled: true })).toBe(
      'list',
    )
  })

  /**
   * Duas dobras de nome divergentes é a frota discordando de si mesma: a lista mostraria "Randon"
   * e "RANDON" separadas enquanto a herança de ficha técnica trataria as duas como a mesma marca.
   */
  test('folds names by one rule shared with the brand defaults', async () => {
    const { normalizeVehicleCatalogName } = await loadChoices()
    const defaults = await readApplicationFile(
      'src/modules/fleet/shared/vehicleBrandDefaults.service.ts',
    )

    expect(normalizeVehicleCatalogName('  volvo   trucks ')).toBe('VOLVO TRUCKS')
    expect(defaults).toContain('normalizeVehicleCatalogName')
    expect(defaults).not.toContain('function normalizeBrand')
  })

  /** A lista da frota vem da própria listagem: sem os veículos em mãos o campo não tem o que somar. */
  test('hands the registered fleet to the field that builds the list', async () => {
    const form = await readApplicationFile('src/modules/fleet/components/VehicleForm.component.tsx')
    const modelFields = await readApplicationFile(
      'src/modules/fleet/components/VehicleModelFields.component.tsx',
    )

    expect(form).toMatch(/<VehicleModelFields[\s\S]*?vehicles={vehicles}[\s\S]*?\/>/)
    expect(modelFields).toContain('readRegisteredVehicleBrands')
    expect(modelFields).toContain('readRegisteredVehicleModels')
  })

  test('names the escape in both locales', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      for (const key of ['catalogOtherOption', 'catalogBackToList']) {
        expect(typeof dictionary[key]).toBe('string')
      }
    }
  })
})

type CatalogChoice = Readonly<{ label: string; value: string }>

type CatalogChoicesModule = {
  readonly VEHICLE_CATALOG_OTHER_VALUE: string
  readonly buildVehicleCatalogChoices: (
    input: Readonly<{
      catalog: readonly Readonly<{ code: string; name: string }>[] | undefined
      registered: readonly string[]
      selected: string
    }>,
  ) => readonly CatalogChoice[]
  readonly normalizeVehicleCatalogName: (value: string) => string
  readonly readRegisteredVehicleBrands: (
    vehicles: readonly Readonly<{ brand: string }>[],
  ) => readonly string[]
  readonly readRegisteredVehicleModels: (
    input: Readonly<{
      brand: string
      vehicles: readonly Readonly<{ brand: string; model: string }>[]
    }>,
  ) => readonly string[]
  readonly resolveVehicleCatalogEntryMode: (
    input: Readonly<{
      choiceCount: number
      isDisabled: boolean
      isLoading: boolean
      isTyping: boolean
    }>,
  ) => string
}
