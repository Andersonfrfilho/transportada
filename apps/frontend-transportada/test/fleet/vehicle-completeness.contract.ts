/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  INCOMPLETE_TRACTION_VEHICLE_BODY,
  loadFutureModule,
  VEHICLE_BODY,
  type FleetVehicleBodyContract,
} from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet vehicle completeness contract', () => {
  // Veiculo de tracao sem rodado continua salvavel — bloquear quebraria o cadastro rapido por placa
  test('never blocks saving a traction vehicle without a wheel type', async () => {
    const { EMPTY_VEHICLE_FORM, toVehicleBody } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )

    expect(EMPTY_VEHICLE_FORM.wheelType).toBe('')
    expect(toVehicleBody({ ...EMPTY_VEHICLE_FORM, role: 'traction' }).wheelType).toBe('')
  })

  test('keeps an empty wheel type empty when loading a vehicle into the form', async () => {
    const { toVehicleFormState } = await loadFutureModule<FleetFormModule>(
      '../../src/modules/fleet/shared/fleetForm.service',
    )

    const state = toVehicleFormState({
      ...INCOMPLETE_TRACTION_VEHICLE_BODY,
      createdAt: '2026-07-28T12:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000914',
      status: 'active',
      updatedAt: '2026-07-28T12:00:00.000Z',
      version: '1',
    })

    expect(state.wheelType).toBe('')
  })

  test('flags only a traction vehicle without a wheel type as incomplete for the MDF-e', async () => {
    const { isVehicleIncompleteForMdfe } = await loadFutureModule<FleetCompletenessModule>(
      '../../src/modules/fleet/shared/vehicleCompleteness.service',
    )

    expect(isVehicleIncompleteForMdfe(INCOMPLETE_TRACTION_VEHICLE_BODY)).toBe(true)
    expect(isVehicleIncompleteForMdfe(VEHICLE_BODY)).toBe(false)
    expect(
      isVehicleIncompleteForMdfe({ ...INCOMPLETE_TRACTION_VEHICLE_BODY, role: 'trailer' }),
    ).toBe(false)
  })

  test('lets the wheel type field be cleared and hints that it is required to issue the MDF-e', async () => {
    const [fleetField, identityFields, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/FleetField.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(fleetField).toContain('clearable')
    expect(fleetField).toContain('placeholder')
    expect(identityFields).toContain('clearable')
    expect(identityFields).toContain("t('wheelTypeUnset')")
    expect(identityFields).toContain("t('wheelTypeRequiredHint')")
    expect(identityFields).toContain("state.wheelType === ''")

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      for (const key of ['wheelTypeUnset', 'wheelTypeRequiredHint', 'vehicleIncomplete']) {
        expect(typeof dictionary[key]).toBe('string')
      }
    }
  })

  test('marks an incomplete vehicle in the listing', async () => {
    const [vehicleList] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleList.component.tsx'),
    ])

    expect(vehicleList).toContain('isVehicleIncompleteForMdfe')
    expect(vehicleList).toContain("t('vehicleIncomplete')")
  })
})

type FleetVehicleFormStateContract = Record<string, unknown>

type FleetFormModule = {
  readonly EMPTY_VEHICLE_FORM: FleetVehicleFormStateContract
  readonly toVehicleBody: (state: FleetVehicleFormStateContract) => FleetVehicleBodyContract
  readonly toVehicleFormState: (
    vehicle: Record<string, unknown>,
  ) => FleetVehicleFormStateContract & { wheelType: string }
}

type FleetCompletenessModule = {
  readonly isVehicleIncompleteForMdfe: (vehicle: FleetVehicleBodyContract) => boolean
}
