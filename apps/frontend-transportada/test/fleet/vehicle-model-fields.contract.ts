/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, VEHICLE_DETAIL } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet vehicle model fields contract', () => {
  test('places the model block between identity and operation in the vehicle form', async () => {
    const form = await readApplicationFile('src/modules/fleet/components/VehicleForm.component.tsx')

    const identityIndex = form.indexOf('<VehicleIdentityFields')
    const modelIndex = form.indexOf('<VehicleModelFields')
    const operationIndex = form.indexOf('<VehicleOperationFields')

    expect(identityIndex).toBeGreaterThan(-1)
    expect(modelIndex).toBeGreaterThan(identityIndex)
    expect(operationIndex).toBeGreaterThan(modelIndex)
  })

  test('asks for role and wheel type before the model block that depends on them', async () => {
    const [identity, operation, ptLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleOperationFields.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
    ])

    // O rodado resolve o segmento do catálogo: pedi-lo depois da marca é pedir para bloquear a lista
    expect(identity).toContain("t('role')")
    expect(identity).toContain("t('wheelType')")
    expect(operation).not.toContain("t('role')")
    expect(operation).not.toContain("t('wheelType')")

    // O aviso não manda o operador para outro bloco: o campo está acima, na mesma tela
    const dictionary = JSON.parse(ptLocale) as Record<string, string>
    expect(dictionary['brandCatalogWheelTypeHint']).not.toContain('Capacidade')
  })

  test('clears the model when the brand changes', async () => {
    const { applyVehicleBrand, createVehicleDraft } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const state = { ...createVehicleDraft(), brand: 'Volvo', model: 'FH 540' }

    expect(applyVehicleBrand(state, 'Scania')).toMatchObject({ brand: 'Scania', model: '' })
  })

  test('keeps the catalog name in the form and resolves the code only for the next query', async () => {
    const { resolveVehicleCatalogCode, toVehicleCatalogOptions } =
      await loadFutureModule<FleetFormModule>('../../src/modules/fleet/shared/fleetForm.service')
    const brands = [
      { code: '102', name: 'Scania' },
      { code: '103', name: 'Volvo' },
    ]

    // O cadastro e o MDF-e leem a marca como texto: gravar '103' entrega o código FIPE ao fiscal
    expect(toVehicleCatalogOptions(brands)).toEqual([
      { label: 'Scania', value: 'Scania' },
      { label: 'Volvo', value: 'Volvo' },
    ])
    expect(toVehicleCatalogOptions(undefined)).toEqual([])

    // O endpoint de modelos espera o código, e ele sai do nome escolhido
    expect(resolveVehicleCatalogCode({ items: brands, name: 'Volvo' })).toBe('103')
    expect(resolveVehicleCatalogCode({ items: brands, name: 'Iveco' })).toBe('')
    expect(resolveVehicleCatalogCode({ items: undefined, name: 'Volvo' })).toBe('')
  })

  test('asks the models endpoint for the resolved code instead of the chosen name', async () => {
    const modelFields = await readApplicationFile(
      'src/modules/fleet/components/VehicleModelFields.component.tsx',
    )

    expect(modelFields).toContain('resolveVehicleCatalogCode')
    expect(modelFields).toContain('toVehicleCatalogOptions')
    // `brand: state.brand` mandava o nome a um parâmetro de código: a lista de modelos voltava vazia
    expect(modelFields).not.toContain('brand: state.brand')
  })

  test('decides free text versus catalog by capability and role', async () => {
    const { canUseVehicleCatalogFields } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )

    expect(canUseVehicleCatalogFields({ role: 'traction', vehicleCatalogEnabled: true })).toBe(true)
    expect(canUseVehicleCatalogFields({ role: 'trailer', vehicleCatalogEnabled: true })).toBe(false)
    expect(canUseVehicleCatalogFields({ role: 'traction', vehicleCatalogEnabled: false })).toBe(
      false,
    )
  })

  test('resolves list, blocked list and free text from one rule', async () => {
    const { resolveVehicleCatalogFieldMode } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )
    const listed = {
      hasCatalogFailure: false,
      role: 'traction',
      vehicleCatalogEnabled: true,
      wheelType: '01',
    }

    expect(resolveVehicleCatalogFieldMode(listed)).toBe('list')
    // Sem rodado o provedor não tem segmento: a lista vem vazia, e vazia sem motivo lê como falha
    expect(resolveVehicleCatalogFieldMode({ ...listed, wheelType: '' })).toBe('blocked')
    // Decisão 4 da spec 035: provedor indisponível nunca impede cadastrar veículo
    expect(resolveVehicleCatalogFieldMode({ ...listed, hasCatalogFailure: true })).toBe('text')
    expect(resolveVehicleCatalogFieldMode({ ...listed, role: 'trailer' })).toBe('text')
    expect(resolveVehicleCatalogFieldMode({ ...listed, vehicleCatalogEnabled: false })).toBe('text')
  })

  test('reads the provider outage from the answer, not only from a rejected request', async () => {
    const { hasVehicleCatalogFailure } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )

    // O gateway da API engole a falha do provedor e responde 200 com source 'unavailable'
    expect(hasVehicleCatalogFailure({ isError: false, source: 'unavailable' })).toBe(true)
    expect(hasVehicleCatalogFailure({ isError: true, source: undefined })).toBe(true)
    expect(hasVehicleCatalogFailure({ isError: false, source: 'fipe' })).toBe(false)
    // Sem rodado o segmento não existe: é lista bloqueada, não provedor fora do ar
    expect(hasVehicleCatalogFailure({ isError: false, source: 'none' })).toBe(false)
  })

  test('says why the list is empty instead of leaving the select silent', async () => {
    const modelFields = await readApplicationFile(
      'src/modules/fleet/components/VehicleModelFields.component.tsx',
    )

    expect(modelFields).toContain('resolveVehicleCatalogFieldMode')
    expect(modelFields).toContain("t('brandCatalogWheelTypeHint')")
    expect(modelFields).toContain("t('brandCatalogUnavailableHint')")
    // Carregamento tem forma: select vazio durante a busca é indistinguível de catálogo sem marcas
    expect(modelFields).toContain('Skeleton')
    // Provedor fora do ar chega como resposta 200 com source 'unavailable', não como rejeição
    expect(modelFields).toContain('hasVehicleCatalogFailure')
    expect(modelFields).toContain('isError')
    expect(modelFields).toContain('brandsQuery.data?.source')
  })

  test('degrades to free text fields when the catalog is unavailable or the vehicle is a trailer', async () => {
    const modelFields = await readApplicationFile(
      'src/modules/fleet/components/VehicleModelFields.component.tsx',
    )

    expect(modelFields).toContain('VEHICLE_CATALOG_FIELD_MODE.TEXT')
    expect(modelFields).toContain('FleetField')
    expect(modelFields).toContain("label={t('brand')}")
    expect(modelFields).toContain("label={t('model')}")
  })

  /**
   * Cor é lista fechada. Em texto livre a mesma frota grava "branca", "BRANCO" e "prata metálico",
   * e nenhum filtro ou relatório volta a juntá-las. A lista é a tabela do Denatran mais os tons de
   * mercado que ela não nomeia — cor não vai em documento fiscal, então alargar não custa nada.
   */
  test('closes the color in a fixed list instead of leaving it free text', async () => {
    const { VEHICLE_COLOR } = await loadFutureModule<FleetTypesModule>(
      '../../src/modules/fleet/shared/fleet.types',
    )
    const [modelFields, colorField, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleModelFields.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleColorField.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(VEHICLE_COLOR).toEqual([
      'amarela',
      'azul',
      'azul_marinho',
      'bege',
      'branca',
      'champanhe',
      'cinza',
      'creme',
      'dourada',
      'fantasia',
      'grafite',
      'grena',
      'laranja',
      'marrom',
      'prata',
      'preta',
      'rosa',
      'roxa',
      'turquesa',
      'verde',
      'vermelha',
    ])
    expect(modelFields).toContain('<VehicleColorField')
    expect(modelFields).not.toContain('COLOR_MAX_LENGTH')
    expect(colorField).toContain('options={VEHICLE_COLOR')
    expect(colorField).toContain('colorOption.')
    // Continua opcional: o CRLV nem sempre está à mão na hora de cadastrar
    expect(colorField).toContain("placeholder={t('colorUnset')}")
    expect(colorField).toContain('clearable')

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, Record<string, string>>
      expect(typeof dictionary['colorUnset']).toBe('string')
      for (const color of VEHICLE_COLOR) {
        expect(typeof dictionary['colorOption']?.[color]).toBe('string')
      }
    }
  })

  /**
   * Vinte e um nomes de cor se leem devagar; o quadrado resolve de olho. A cor pintada é a do
   * veículo, não a do tema — por isso vive em token próprio, como as cores da placa Mercosul.
   */
  test('paints each color option with its own swatch token', async () => {
    const { VEHICLE_COLOR } = await loadFutureModule<FleetTypesModule>(
      '../../src/modules/fleet/shared/fleet.types',
    )
    const { VEHICLE_COLOR_SWATCH } = await loadFutureModule<FleetConstantModule>(
      '../../src/modules/fleet/shared/fleet.constant',
    )
    const [colorField, tokens] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleColorField.component.tsx'),
      readApplicationFile('src/styles/index.css'),
    ])

    expect(colorField).toContain('VEHICLE_COLOR_SWATCH')
    for (const color of VEHICLE_COLOR) {
      expect(VEHICLE_COLOR_SWATCH[color]).toBe(`var(--vehicle-color-${color})`)
      expect(tokens).toContain(`--vehicle-color-${color}:`)
    }
    // Cor literal no componente ou no módulo é o que o token existe para impedir
    expect(colorField).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  /** Cor gravada antes da lista fechada não casa com opção nenhuma: o select abriria em branco. */
  test('drops a stored color that is outside the list when filling the form', async () => {
    const { toVehicleFormState } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )

    expect(toVehicleFormState({ ...VEHICLE_DETAIL, color: 'Prata metálico' }).color).toBe('')
    expect(toVehicleFormState({ ...VEHICLE_DETAIL, color: 'branca' }).color).toBe('branca')
  })

  test('names the model block fields in both locales', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      for (const key of [
        'vehicleModelLegend',
        'brand',
        'brandCatalogUnavailableHint',
        'brandCatalogWheelTypeHint',
        'model',
        'modelYear',
        'color',
        'fleetNumber',
      ]) {
        expect(typeof dictionary[key]).toBe('string')
      }
    }
  })
})

type FleetVehicleFormStateContract = Record<string, unknown>

type FleetTypesModule = {
  readonly VEHICLE_COLOR: readonly string[]
}

type FleetConstantModule = {
  readonly VEHICLE_COLOR_SWATCH: Readonly<Record<string, string>>
}

type FleetFormModule = {
  readonly applyVehicleBrand: (
    state: FleetVehicleFormStateContract,
    brand: string,
  ) => FleetVehicleFormStateContract
  readonly canUseVehicleCatalogFields: (
    input: Readonly<{ role: string; vehicleCatalogEnabled: boolean }>,
  ) => boolean
  readonly createVehicleDraft: (input?: Record<string, unknown>) => FleetVehicleFormStateContract
  readonly hasVehicleCatalogFailure: (
    input: Readonly<{ isError: boolean; source: string | undefined }>,
  ) => boolean
  readonly resolveVehicleCatalogCode: (
    input: Readonly<{
      items: readonly Readonly<{ code: string; name: string }>[] | undefined
      name: string
    }>,
  ) => string
  readonly resolveVehicleCatalogFieldMode: (
    input: Readonly<{
      hasCatalogFailure: boolean
      role: string
      vehicleCatalogEnabled: boolean
      wheelType: string
    }>,
  ) => string
  readonly toVehicleCatalogOptions: (
    items: readonly Readonly<{ code: string; name: string }>[] | undefined,
  ) => readonly Readonly<{ label: string; value: string }>[]
  readonly toVehicleFormState: (
    vehicle: Record<string, unknown>,
  ) => Readonly<{ color: string }> & Record<string, unknown>
}
