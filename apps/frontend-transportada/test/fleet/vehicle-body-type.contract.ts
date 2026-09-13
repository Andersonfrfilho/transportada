/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

type BodyTypeModule = Readonly<{
  isTractorUnitKind: (input: { role: string; vehicleType: string }) => boolean
  isVehicleBodyTypeMissing: (input: {
    bodyType: string
    role: string
    vehicleType: string
  }) => boolean
  resolveVehicleBodyTypeForKindChange: (input: {
    next: { role: string; vehicleType: string }
    previous: { role: string; vehicleType: string }
  }) => Record<string, string>
  VEHICLE_BODY_TYPE_OPTIONS: readonly string[]
}>

function loadBodyType(): Promise<BodyTypeModule> {
  return loadFutureModule<BodyTypeModule>(
    '../../src/modules/fleet/shared/fleetVehicleBodyType.service',
  )
}

/**
 * Feature 147 D1: `00` só é o cavalo mecânico (`role: 'traction'`, `vehicleType: 'tractor_unit'`).
 * Todo o resto — moto, carro, os demais tipos que carregam, e toda carreta (`role: 'trailer'`,
 * que tem `vehicleType` vazio) — é obrigado a escolher.
 */
describe('fleet vehicle body type contract', () => {
  test('only the tractor unit counts as the kind that never chooses a body type', async () => {
    const { isTractorUnitKind } = await loadBodyType()

    expect(isTractorUnitKind({ role: 'traction', vehicleType: 'tractor_unit' })).toBe(true)
    expect(isTractorUnitKind({ role: 'traction', vehicleType: 'truck' })).toBe(false)
    expect(isTractorUnitKind({ role: 'traction', vehicleType: '' })).toBe(false)
    // Carreta com resíduo de vehicleType de antes de trocar o papel: quem decide é o papel
    expect(isTractorUnitKind({ role: 'trailer', vehicleType: 'tractor_unit' })).toBe(false)
    expect(isTractorUnitKind({ role: 'trailer', vehicleType: '' })).toBe(false)
  })

  test('00 is never offered as a choice outside the tractor unit', async () => {
    const { VEHICLE_BODY_TYPE_OPTIONS } = await loadBodyType()

    expect(VEHICLE_BODY_TYPE_OPTIONS).not.toContain('00')
    expect(VEHICLE_BODY_TYPE_OPTIONS).toEqual(['01', '02', '03', '04', '05'])
  })

  test('turning into a tractor unit forces 00', async () => {
    const { resolveVehicleBodyTypeForKindChange } = await loadBodyType()

    expect(
      resolveVehicleBodyTypeForKindChange({
        next: { role: 'traction', vehicleType: 'tractor_unit' },
        previous: { role: 'traction', vehicleType: '' },
      }),
    ).toEqual({ bodyType: '00' })
  })

  /** Sair do cavalo limpa para vazio — nunca herda o `00` que só fazia sentido lá. */
  test('leaving the tractor unit clears the body type instead of keeping 00', async () => {
    const { resolveVehicleBodyTypeForKindChange } = await loadBodyType()

    expect(
      resolveVehicleBodyTypeForKindChange({
        next: { role: 'traction', vehicleType: 'truck' },
        previous: { role: 'traction', vehicleType: 'tractor_unit' },
      }),
    ).toEqual({ bodyType: '' })
    expect(
      resolveVehicleBodyTypeForKindChange({
        next: { role: 'trailer', vehicleType: 'tractor_unit' },
        previous: { role: 'traction', vehicleType: 'tractor_unit' },
      }),
    ).toEqual({ bodyType: '' })
  })

  test('does nothing when the kind does not change', async () => {
    const { resolveVehicleBodyTypeForKindChange } = await loadBodyType()

    expect(
      resolveVehicleBodyTypeForKindChange({
        next: { role: 'traction', vehicleType: 'truck' },
        previous: { role: 'traction', vehicleType: 'truck' },
      }),
    ).toEqual({})
    expect(
      resolveVehicleBodyTypeForKindChange({
        next: { role: 'traction', vehicleType: 'tractor_unit' },
        previous: { role: 'traction', vehicleType: 'tractor_unit' },
      }),
    ).toEqual({})
  })

  test('blocks submit without a body type outside the tractor unit', async () => {
    const { isVehicleBodyTypeMissing } = await loadBodyType()

    expect(isVehicleBodyTypeMissing({ bodyType: '', role: 'traction', vehicleType: 'truck' })).toBe(
      true,
    )
    // Ficha antiga com 00 num tipo que carrega (D2): continua incompleta até o operador escolher
    expect(
      isVehicleBodyTypeMissing({ bodyType: '00', role: 'traction', vehicleType: 'truck' }),
    ).toBe(true)
    expect(
      isVehicleBodyTypeMissing({ bodyType: '02', role: 'traction', vehicleType: 'truck' }),
    ).toBe(false)
    expect(
      isVehicleBodyTypeMissing({ bodyType: '00', role: 'traction', vehicleType: 'tractor_unit' }),
    ).toBe(false)
  })

  test('the form starts empty outside the tractor unit, never 00', async () => {
    const { EMPTY_VEHICLE_FORM } = await loadFutureModule<{
      readonly EMPTY_VEHICLE_FORM: Record<string, unknown>
    }>('../../src/modules/fleet/shared/fleetForm.service')

    expect(EMPTY_VEHICLE_FORM.bodyType).toBe('')
    expect(EMPTY_VEHICLE_FORM.vehicleType).toBe('')
  })

  /** O baú do segundo Volvo não é o do primeiro: herdar carroceria por marca inventaria baú. */
  test('brand inheritance never carries the body type along', async () => {
    const { VEHICLE_BRAND_DEFAULT_FIELDS, VEHICLE_BRAND_DEFAULT_BLANK } = await loadFutureModule<{
      readonly VEHICLE_BRAND_DEFAULT_BLANK: Record<string, string>
      readonly VEHICLE_BRAND_DEFAULT_FIELDS: readonly string[]
    }>('../../src/modules/fleet/shared/vehicleBrandDefaults.service')

    expect(VEHICLE_BRAND_DEFAULT_FIELDS).not.toContain('bodyType')
    expect(VEHICLE_BRAND_DEFAULT_BLANK.bodyType).toBeUndefined()
  })

  /** Campo escondido para o cavalo, e a opção `00` fora dele nem chega a existir na lista. */
  test('the field disappears for the tractor unit and never offers 00 elsewhere', async () => {
    const component = await readApplicationFile(
      'src/modules/fleet/components/VehicleOperationFields.component.tsx',
    )

    expect(component).toContain('isTractorUnitKind(state)')
    expect(component).toContain('VEHICLE_BODY_TYPE_OPTIONS')
    expect(component).not.toContain('MDFE_BODY_TYPE')
  })

  test('blocks the submit before the API 400', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleForm.hook.ts')

    expect(hook).toContain('isVehicleBodyTypeMissing')
    expect(hook).toContain('bodyTypeRequired')
  })

  /** Os dois códigos novos da API viram rótulo pt-BR acentuado, como todo erro do módulo. */
  test('maps the two new API error codes to accented pt-BR labels', async () => {
    const { FLEET_FEEDBACK_KEY_BY_ERROR } = await loadFutureModule<{
      readonly FLEET_FEEDBACK_KEY_BY_ERROR: Record<string, string>
    }>('../../src/modules/fleet/shared/fleet.constant')
    const [locale, english] = await Promise.all([
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    const requiredKey = FLEET_FEEDBACK_KEY_BY_ERROR.FLEET_VEHICLE_BODY_TYPE_REQUIRED
    const notApplicableKey = FLEET_FEEDBACK_KEY_BY_ERROR.FLEET_VEHICLE_BODY_TYPE_NOT_APPLICABLE
    expect(requiredKey).toBeString()
    expect(notApplicableKey).toBeString()

    for (const file of [locale, english]) {
      const messages = JSON.parse(file) as Record<string, unknown>
      expect(messages[requiredKey as string]).toBeString()
      expect(messages[notApplicableKey as string]).toBeString()
      expect(messages.bodyTypeUnset).toBeString()
    }
  })
})
