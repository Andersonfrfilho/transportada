/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

type FreightVehicleClass = 'three_quarter' | 'toco' | 'truck' | 'utility' | 'van' | 'vuc'

type FreightClassModule = {
  readonly FREIGHT_CLASS_BY_WHEEL_TYPE: Readonly<Record<string, FreightVehicleClass>>
  readonly suggestFreightClass: (input: {
    readonly current: '' | FreightVehicleClass
    readonly nextWheelType: string
    readonly previousWheelType: string
  }) => '' | FreightVehicleClass
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function loadFreightClass(): Promise<FreightClassModule> {
  return loadFutureModule<FreightClassModule>(
    '../../src/modules/fleet/shared/vehicleFreightClass.service',
  )
}

describe('fleet vehicle freight class contract', () => {
  /**
   * O rodado do MDF-e e a classe da tabela de frete não são a mesma lista: VUC e 3/4 não existem
   * no rodado, e "Outros" não diz classe nenhuma. A sugestão cobre só o que tem tradução exata.
   */
  test('suggests the class only for the wheel types that name one', async () => {
    const { FREIGHT_CLASS_BY_WHEEL_TYPE, suggestFreightClass } = await loadFreightClass()

    expect(FREIGHT_CLASS_BY_WHEEL_TYPE).toEqual({
      '01': 'truck',
      '02': 'toco',
      '04': 'van',
      '05': 'utility',
    })
    for (const wheelType of ['03', '06']) {
      expect(
        suggestFreightClass({ current: '', nextWheelType: wheelType, previousWheelType: '' }),
      ).toBe('')
    }
  })

  test('fills the empty class when the operator picks the wheel type', async () => {
    const { suggestFreightClass } = await loadFreightClass()

    expect(suggestFreightClass({ current: '', nextWheelType: '01', previousWheelType: '' })).toBe(
      'truck',
    )
  })

  /** Sugerir é oferecer, não decidir: VUC e 3/4 só entram à mão, e a mão manda. */
  test('never overwrites a class the operator chose by hand', async () => {
    const { suggestFreightClass } = await loadFreightClass()

    expect(
      suggestFreightClass({ current: 'vuc', nextWheelType: '01', previousWheelType: '' }),
    ).toBe('vuc')
    expect(
      suggestFreightClass({ current: 'three_quarter', nextWheelType: '02', previousWheelType: '' }),
    ).toBe('three_quarter')
  })

  /**
   * Corrigir o rodado corrige a sugestão que ele mesmo pôs — senão trocar 01 por 02 deixa "Truck"
   * num toco, e o valor pago ao motorista sai da linha errada da tabela.
   */
  test('follows the wheel type while the class is still the previous suggestion', async () => {
    const { suggestFreightClass } = await loadFreightClass()

    expect(
      suggestFreightClass({ current: 'truck', nextWheelType: '02', previousWheelType: '01' }),
    ).toBe('toco')
    expect(
      suggestFreightClass({ current: 'truck', nextWheelType: '', previousWheelType: '01' }),
    ).toBe('')
    expect(
      suggestFreightClass({ current: 'truck', nextWheelType: '02', previousWheelType: '05' }),
    ).toBe('truck')
  })

  /** A API pede o campo no corpo: sem ele o `strict()` da rota recusa o cadastro inteiro. */
  test('carries the class through the form state and the request body', async () => {
    const { EMPTY_VEHICLE_FORM, toVehicleBody } = await loadFutureModule<{
      readonly EMPTY_VEHICLE_FORM: Record<string, unknown>
      readonly toVehicleBody: (state: Record<string, unknown>) => Record<string, unknown>
    }>('../../src/modules/fleet/shared/fleetForm.service')

    expect(EMPTY_VEHICLE_FORM.freightClass).toBe('')
    const body = toVehicleBody({ ...EMPTY_VEHICLE_FORM, freightClass: 'toco', role: 'traction' })
    expect(body.freightClass).toBe('toco')
    // Implemento não puxa frete: a classe é do veículo que traciona
    const trailer = toVehicleBody({ ...EMPTY_VEHICLE_FORM, freightClass: 'toco', role: 'trailer' })
    expect(trailer.freightClass).toBe('')
  })

  test('reads the class back from the saved vehicle', async () => {
    const { toVehicleFormState } = await loadFutureModule<{
      readonly toVehicleFormState: (vehicle: Record<string, unknown>) => Record<string, unknown>
    }>('../../src/modules/fleet/shared/fleetForm.service')
    const { VEHICLE_DETAIL } = await import('./fleet.fixture')

    const state = toVehicleFormState({ ...VEHICLE_DETAIL, freightClass: 'truck' })
    expect(state.freightClass).toBe('truck')
  })

  test('the field sits beside the wheel type, with the reason the lists differ', async () => {
    const [identity, locale, english] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(identity).toContain('FREIGHT_VEHICLE_CLASSES')
    expect(identity).toContain("t('freightClassField')")
    expect(identity).toContain("t('freightClassHint')")
    for (const file of [locale, english]) {
      const messages = JSON.parse(file) as Record<string, unknown>
      expect(messages.freightClassField).toBeString()
      expect(messages.freightClassHint).toBeString()
      expect(messages.freightClassUnset).toBeString()
    }
  })

  /** A sugestão mora no `patch`: o campo é do formulário, não de quem desenha o select. */
  test('suggests from the form hook, so every wheel type change goes through one rule', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleForm.hook.ts')

    expect(hook).toContain('suggestFreightClass')
    expect(hook).toContain('values.wheelType')
  })

  test('rejects a vehicle whose class is outside the freight table', async () => {
    const { createFleetResponseAdapters } = await loadFutureModule<{
      readonly createFleetResponseAdapters: () => {
        readonly vehicleFromApi: (input: unknown) => unknown
      }
    }>('../../src/modules/fleet/shared/fleetResponse.validation')
    const { VEHICLE_DETAIL } = await import('./fleet.fixture')
    const adapters = createFleetResponseAdapters()

    expect(() => adapters.vehicleFromApi({ ...VEHICLE_DETAIL, freightClass: 'bitrem' })).toThrow()
    expect(adapters.vehicleFromApi(VEHICLE_DETAIL)).toBeDefined()
  })
})
