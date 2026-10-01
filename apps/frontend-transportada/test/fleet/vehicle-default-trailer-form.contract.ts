/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, VEHICLE_DETAIL } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TRAILER_ID = '00000000-0000-4000-8000-000000000916'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

type DefaultTrailerModule = Readonly<{
  resolveVehicleDefaultTrailerForKindChange: (input: {
    next: { role: string; vehicleType: string }
    previous: { role: string; vehicleType: string }
  }) => Record<string, string>
}>

function loadBodyType(): Promise<DefaultTrailerModule> {
  return loadFutureModule<DefaultTrailerModule>(
    '../../src/modules/fleet/shared/fleetVehicleBodyType.service',
  )
}

/**
 * Feature 147 D3: a ficha do cavalo escolhe a carreta padrão dele. O campo é vazio até o operador
 * escolher e só existe em `tractor_unit` — sair do cavalo apaga a escolha, nunca a carrega escondida
 * para um tipo que não tem o campo.
 */
describe('fleet vehicle default trailer form contract', () => {
  test('leaving the tractor unit clears the default trailer', async () => {
    const { resolveVehicleDefaultTrailerForKindChange } = await loadBodyType()

    expect(
      resolveVehicleDefaultTrailerForKindChange({
        next: { role: 'traction', vehicleType: 'truck' },
        previous: { role: 'traction', vehicleType: 'tractor_unit' },
      }),
    ).toEqual({ defaultTrailerVehicleId: '' })
    expect(
      resolveVehicleDefaultTrailerForKindChange({
        next: { role: 'trailer', vehicleType: 'tractor_unit' },
        previous: { role: 'traction', vehicleType: 'tractor_unit' },
      }),
    ).toEqual({ defaultTrailerVehicleId: '' })
  })

  test('turning into a tractor unit does not invent a trailer', async () => {
    const { resolveVehicleDefaultTrailerForKindChange } = await loadBodyType()

    expect(
      resolveVehicleDefaultTrailerForKindChange({
        next: { role: 'traction', vehicleType: 'tractor_unit' },
        previous: { role: 'traction', vehicleType: '' },
      }),
    ).toEqual({})
  })

  test('does nothing when the kind does not change', async () => {
    const { resolveVehicleDefaultTrailerForKindChange } = await loadBodyType()

    expect(
      resolveVehicleDefaultTrailerForKindChange({
        next: { role: 'traction', vehicleType: 'truck' },
        previous: { role: 'traction', vehicleType: 'truck' },
      }),
    ).toEqual({})
    expect(
      resolveVehicleDefaultTrailerForKindChange({
        next: { role: 'traction', vehicleType: 'tractor_unit' },
        previous: { role: 'traction', vehicleType: 'tractor_unit' },
      }),
    ).toEqual({})
  })

  test('the form starts empty, and the wire body sends null', async () => {
    const { EMPTY_VEHICLE_FORM, toVehicleBody } = await loadFutureModule<{
      readonly EMPTY_VEHICLE_FORM: Record<string, unknown>
      readonly toVehicleBody: (state: Record<string, unknown>) => Record<string, unknown>
    }>('../../src/modules/fleet/shared/fleetForm.service')

    expect(EMPTY_VEHICLE_FORM.defaultTrailerVehicleId).toBe('')
    expect(
      toVehicleBody({ ...EMPTY_VEHICLE_FORM, bodyType: '00', vehicleType: 'tractor_unit' })
        .defaultTrailerVehicleId,
    ).toBeNull()
    expect(
      toVehicleBody({
        ...EMPTY_VEHICLE_FORM,
        bodyType: '00',
        defaultTrailerVehicleId: TRAILER_ID,
        vehicleType: 'tractor_unit',
      }).defaultTrailerVehicleId,
    ).toBe(TRAILER_ID)
  })

  /** Ficha carregada: `null` da API vira `''` no formulário, para o select abrir sem escolha. */
  test('a loaded vehicle without a default trailer opens the form blank', async () => {
    const { toVehicleFormState } = await loadFutureModule<{
      readonly toVehicleFormState: (vehicle: Record<string, unknown>) => Record<string, unknown>
    }>('../../src/modules/fleet/shared/fleetForm.service')

    expect(toVehicleFormState(VEHICLE_DETAIL).defaultTrailerVehicleId).toBe('')
    expect(
      toVehicleFormState({ ...VEHICLE_DETAIL, defaultTrailerVehicleId: TRAILER_ID })
        .defaultTrailerVehicleId,
    ).toBe(TRAILER_ID)
  })

  /** O campo só existe na ficha do cavalo — fora dele nem o select aparece. */
  test('the field only appears for the tractor unit', async () => {
    const component = await readApplicationFile(
      'src/modules/fleet/components/VehicleOperationFields.component.tsx',
    )

    expect(component).toContain('isTractorUnitKind(state) ? (')
    expect(component).toContain('defaultTrailerVehicleId')
  })

  /** Os três códigos novos da API viram rótulo pt-BR acentuado, como todo erro do módulo. */
  test('maps the three new API error codes to accented pt-BR labels', async () => {
    const { FLEET_FEEDBACK_KEY_BY_ERROR } = await loadFutureModule<{
      readonly FLEET_FEEDBACK_KEY_BY_ERROR: Record<string, string>
    }>('../../src/modules/fleet/shared/fleet.constant')
    const [locale, english] = await Promise.all([
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    const requiresTractorKey =
      FLEET_FEEDBACK_KEY_BY_ERROR.FLEET_VEHICLE_DEFAULT_TRAILER_REQUIRES_TRACTOR
    const notATrailerKey = FLEET_FEEDBACK_KEY_BY_ERROR.FLEET_VEHICLE_DEFAULT_TRAILER_NOT_A_TRAILER
    const roleChangeBlockedKey = FLEET_FEEDBACK_KEY_BY_ERROR.FLEET_VEHICLE_ROLE_CHANGE_BLOCKED
    expect(requiresTractorKey).toBeString()
    expect(notATrailerKey).toBeString()
    expect(roleChangeBlockedKey).toBeString()

    for (const file of [locale, english]) {
      const messages = JSON.parse(file) as Record<string, unknown>
      expect(messages[requiresTractorKey as string]).toBeString()
      expect(messages[notATrailerKey as string]).toBeString()
      expect(messages[roleChangeBlockedKey as string]).toBeString()
      expect(messages.defaultTrailer).toBeString()
      expect(messages.defaultTrailerPlaceholder).toBeString()
    }
  })
})
