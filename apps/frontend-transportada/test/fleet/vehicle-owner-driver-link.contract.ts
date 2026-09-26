/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type { FleetDriverVehicleLink } from '../../src/modules/fleet/shared/fleet.types'
import { appendDriverVehicle } from '../../src/modules/fleet/shared/driverVehicles.service'
import { resolveOwnerDriverToLink } from '../../src/modules/fleet/shared/vehicleOwner.service'
import {
  DRIVER_ID,
  DRIVER_OWNED_VEHICLE_ID,
  DRIVER_VEHICLE_LINKS,
  FLEX_VEHICLE_ID,
  VEHICLE_ID,
} from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const OWNER_TAX_ID = '39053344705'
const CHOICE = { driverId: DRIVER_ID, ownerTaxId: OWNER_TAX_ID } as const
const LINKS = DRIVER_VEHICLE_LINKS as unknown as readonly FleetDriverVehicleLink[]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('o motorista escolhido como proprietário fica vinculado ao veículo', () => {
  test('vincula o motorista que o operador cadastrou pela ficha do veículo', () => {
    expect(
      resolveOwnerDriverToLink({
        choice: CHOICE,
        state: { ownerTaxId: OWNER_TAX_ID, ownership: 'third_party' },
      }),
    ).toBe(DRIVER_ID)
  })

  test('não vincula sem escolha explícita, com veículo próprio, ou com proprietário trocado depois', () => {
    const state = { ownerTaxId: OWNER_TAX_ID, ownership: 'third_party' } as const

    expect(resolveOwnerDriverToLink({ choice: null, state })).toBeUndefined()
    expect(
      resolveOwnerDriverToLink({ choice: CHOICE, state: { ...state, ownership: 'own' } }),
    ).toBeUndefined()
    expect(
      resolveOwnerDriverToLink({
        choice: CHOICE,
        state: { ...state, ownerTaxId: '12345678000195' },
      }),
    ).toBeUndefined()
  })

  test('soma o veículo aos que o motorista já dirige, sem soltar nenhum', () => {
    const current = LINKS.map((link) => link.vehicle.id)

    expect(current).toContain(VEHICLE_ID)
    expect(current).toContain(DRIVER_OWNED_VEHICLE_ID)
    expect(appendDriverVehicle({ links: LINKS, vehicleId: FLEX_VEHICLE_ID })).toEqual([
      ...current,
      FLEX_VEHICLE_ID,
    ])
  })

  test('não reescreve a lista quando o veículo já está vinculado', () => {
    expect(appendDriverVehicle({ links: LINKS, vehicleId: VEHICLE_ID })).toBeUndefined()
  })

  test('a ficha do veículo grava o vínculo depois de salvar, a partir de uma leitura fresca', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleForm.hook.ts')
    const driverVehicles = await readApplicationFile(
      'src/modules/fleet/hooks/useDriverVehicles.hook.ts',
    )
    const workspace = await readApplicationFile('src/modules/fleet/pages/FleetWorkspace.page.tsx')

    expect(hook).toContain('resolveOwnerDriverToLink')
    expect(hook).toContain('onLinkOwnerDriver')
    expect(driverVehicles).toContain('staleTime: 0')
    expect(driverVehicles).toContain('appendDriverVehicle')
    expect(workspace).toContain('onLinkOwnerDriver={driverVehicles.linkVehicle}')
  })

  test('só o motorista cadastrado pelo diálogo vincula; escolher no seletor só preenche a posse', async () => {
    const owner = await readApplicationFile(
      'src/modules/fleet/components/VehicleOwnerFields.component.tsx',
    )
    const picker = owner.slice(owner.indexOf('function applyDriver'), owner.indexOf('return ('))
    const dialog = owner.slice(owner.indexOf('onCreated={'))

    expect(picker).toContain('form.patch(toVehicleOwnerFields(driver))')
    expect(picker).not.toContain('applyCreatedOwnerDriver')
    expect(dialog).toContain('applyCreatedOwnerDriver(driver)')
  })

  test('a falha do vínculo não vira erro: o veículo salvo fecha a ficha normalmente', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleForm.hook.ts')
    const link = hook.slice(
      hook.indexOf('async function linkCreatedOwnerDriver'),
      hook.indexOf('async function submit'),
    )

    expect(link).toContain('catch')
    expect(link).not.toContain('setFeedbackKey')
    expect(hook).not.toContain('ownerDriverLinkFailed')
  })
})
