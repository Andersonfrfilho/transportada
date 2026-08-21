/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { VEHICLE_TYPES } from '@/modules/shared/vehicleType.constant'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet vehicle type contract', () => {
  /**
   * O campo nasceu de dois vizinhos que pediam a mesma coisa — o rodado do MDF-e e a classe da
   * tabela de frete. Um campo só é o contrato: dois selects lado a lado é o defeito que ele fechou.
   */
  test('the identity block asks the type once, and only for the traction', async () => {
    const identity = await readApplicationFile(
      'src/modules/fleet/components/VehicleIdentityFields.component.tsx',
    )

    expect(identity).toContain('VEHICLE_TYPES')
    expect(identity).toContain("t('vehicleType')")
    expect(identity).toContain('optionLabelKey="vehicleTypeOption"')
    expect(identity).not.toContain('FREIGHT_VEHICLE_CLASSES')
    expect(identity).not.toContain('wheelType')
    expect(identity.match(/FleetSelectField/g)?.length).toBeGreaterThan(0)
  })

  /** Sem o tipo o MDF-e não sai e a tabela de frete não sabe qual coluna paga — a tela diz isso. */
  test('names both consequences of leaving the type empty', async () => {
    const [identity, locale, english] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(identity).toContain("t('vehicleTypeRequiredHint')")
    expect(identity).toContain("t('vehicleTypeHint')")
    for (const file of [locale, english]) {
      const messages = JSON.parse(file) as Record<string, unknown>
      expect(messages.vehicleType).toBeString()
      expect(messages.vehicleTypeUnset).toBeString()
      expect(messages.vehicleTypeRequiredHint).toBeString()
      expect(messages.vehicleTypeHint).toBeString()
      expect(messages.freightClassField).toBeUndefined()
      expect(messages.wheelTypeOption).toBeUndefined()
      expect(Object.keys(messages.vehicleTypeOption as Record<string, unknown>).sort()).toEqual(
        [...VEHICLE_TYPES].sort(),
      )
    }
  })

  /** A API pede o campo no corpo: sem ele o `strict()` da rota recusa o cadastro inteiro. */
  test('carries the type through the form state and the request body', async () => {
    const { EMPTY_VEHICLE_FORM, toVehicleBody } = await loadFutureModule<{
      readonly EMPTY_VEHICLE_FORM: Record<string, unknown>
      readonly toVehicleBody: (state: Record<string, unknown>) => Record<string, unknown>
    }>('../../src/modules/fleet/shared/fleetForm.service')

    expect(EMPTY_VEHICLE_FORM.vehicleType).toBe('')
    const body = toVehicleBody({ ...EMPTY_VEHICLE_FORM, role: 'traction', vehicleType: 'toco' })
    expect(body.vehicleType).toBe('toco')
    // Implemento não traciona: o tipo é de quem puxa, e o `tpRod` sai dele
    const trailer = toVehicleBody({ ...EMPTY_VEHICLE_FORM, role: 'trailer', vehicleType: 'toco' })
    expect(trailer.vehicleType).toBe('')
    expect('freightClass' in body).toBe(false)
    expect('wheelType' in body).toBe(false)
  })

  test('reads the type back from the saved vehicle', async () => {
    const { toVehicleFormState } = await loadFutureModule<{
      readonly toVehicleFormState: (vehicle: Record<string, unknown>) => Record<string, unknown>
    }>('../../src/modules/fleet/shared/fleetForm.service')
    const { VEHICLE_DETAIL } = await import('./fleet.fixture')

    const state = toVehicleFormState({ ...VEHICLE_DETAIL, vehicleType: 'truck' })
    expect(state.vehicleType).toBe('truck')
  })

  /**
   * Com um campo só não há o que sugerir: o serviço de sugestão saiu junto, e o `patch` do
   * formulário voltou a ser só herança de marca. Sugestão sobrevivente escreveria em campo morto.
   */
  test('leaves no suggestion rule behind in the form hook', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleForm.hook.ts')

    expect(hook).not.toContain('suggestFreightClass')
    expect(hook).not.toContain('wheelType')
    expect(hook).toContain('resolveVehicleBrandDefaults')
  })

  test('rejects a vehicle whose type is outside the catalog', async () => {
    const { createFleetResponseAdapters } = await loadFutureModule<{
      readonly createFleetResponseAdapters: () => {
        readonly vehicleFromApi: (input: unknown) => unknown
      }
    }>('../../src/modules/fleet/shared/fleetResponse.validation')
    const { VEHICLE_DETAIL } = await import('./fleet.fixture')
    const adapters = createFleetResponseAdapters()

    expect(() => adapters.vehicleFromApi({ ...VEHICLE_DETAIL, vehicleType: 'bitrem' })).toThrow()
    expect(adapters.vehicleFromApi(VEHICLE_DETAIL)).toBeDefined()
  })
})
