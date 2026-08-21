/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { DRIVER_FOCUS_FIELDS } from '../../src/modules/fleet/shared/driverFieldFocus.service'
import {
  VEHICLE_OWNER_REQUIRED_FIELDS,
  listIncompleteVehicleOwnerFields,
  resolveVehicleOwnerFixField,
} from '../../src/modules/fleet/shared/vehicleOwner.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(fileName: string): Promise<Record<string, string>> {
  return Bun.file(new URL(`src/modules/fleet/locales/${fileName}`, APPLICATION_ROOT)).json()
}

const INCOMPLETE_OWNER = {
  ownerName: '',
  ownerRntrc: '',
  ownerState: '',
  ownerTaxId: '',
  ownership: 'third-party',
} as const

describe('vehicle owner fix contract', () => {
  test('names a driver field for every field of the owner group', () => {
    for (const field of VEHICLE_OWNER_REQUIRED_FIELDS) {
      const target = resolveVehicleOwnerFixField([field])
      if (target === undefined) throw new Error(`campo do grupo sem destino na ficha: ${field}`)
      expect(DRIVER_FOCUS_FIELDS).toContain(target)
    }
  })

  /** O aviso lista os campos na ordem do grupo; levar ao segundo faltando o primeiro é levar errado. */
  test('points at the first missing field, in the order the hint lists them', () => {
    expect(resolveVehicleOwnerFixField(listIncompleteVehicleOwnerFields(INCOMPLETE_OWNER))).toBe(
      'name',
    )
    expect(
      resolveVehicleOwnerFixField(
        listIncompleteVehicleOwnerFields({
          ...INCOMPLETE_OWNER,
          ownerName: 'Lazaro Matias Cipriano',
          ownerRntrc: '054941988',
          ownerTaxId: '44423659891',
        }),
      ),
    ).toBe('addressState')
    expect(resolveVehicleOwnerFixField([])).toBeUndefined()
  })

  /**
   * O botão só serve se o proprietário estiver na lista: com uma página só, o motorista de uma frota
   * de trinta ficava de fora justo quando o aviso aparece, e a ação nascia desabilitada.
   */
  test('loads every page of drivers for the owner picker', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useFleet.hook.ts')

    expect(hook).toContain('loadEveryDriver')
    expect(hook).toContain('FLEET_DRIVER_LOAD_LIMIT')
    expect(hook).toMatch(/loadEveryDriver[\s\S]{0,600}while \(cursor !== null/)
    expect(hook).toContain('driverDirectory')
  })

  /**
   * O filtro da aba Motoristas não pode recortar a lista do formulário de veículo: a consulta do
   * diretório vai sem filtro, e a chave idêntica faz o React Query reaproveitá-la quando não há filtro.
   */
  test('asks for the unfiltered directory and invalidates the whole family of driver queries', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useFleet.hook.ts')
    const workspace = await readApplicationFile('src/modules/fleet/pages/FleetWorkspace.page.tsx')

    expect(hook).toContain('JSON.stringify({})')
    expect(hook).toContain('queryKey: [FLEET_DRIVERS_QUERY_KEY, input.companyId]')
    expect(workspace).toContain('driverDirectory')
  })

  test('opens the driver record on the missing field instead of sending the operator away', async () => {
    const owner = await readApplicationFile(
      'src/modules/fleet/components/VehicleOwnerFields.component.tsx',
    )
    const dialog = await readApplicationFile(
      'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    )

    expect(owner).toContain('resolveVehicleOwnerFixField')
    expect(owner).toContain('ownerIncompleteFixButton')
    expect(owner).toContain('ownerIncompleteUnknownDriver')
    expect(dialog).toContain('focusField')
    expect(dialog).toContain('useDriverFieldFocus')
  })

  /**
   * Efeito de hook roda na ordem de declaração: declarado antes do foco do modal, o foco do campo
   * seria desfeito pelo próprio diálogo ao abrir.
   */
  test('declares the field focus after the modal focus so the field wins', async () => {
    const dialog = await readApplicationFile(
      'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    )
    const lines = dialog.split('\n')
    const modalLine = lines.findIndex((line) => line.includes('useModalDialog({'))
    const focusLine = lines.findIndex((line) => line.includes('useDriverFieldFocus({'))

    expect(modalLine).toBeGreaterThan(0)
    expect(focusLine).toBeGreaterThan(modalLine)
  })

  test('reveals the field it was asked for, input or select trigger', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useDriverFieldFocus.hook.ts')

    expect(hook).toContain('revealField')
    expect(hook).toContain('bindInput')
    expect(hook).toContain('bindTrigger')
    expect(hook).toContain('useEffect')
  })

  /** O gatilho do select é botão: sem referência exposta, a UF do endereço não podia receber foco. */
  test('lets the design system select hand its trigger to the caller', async () => {
    const select = await readApplicationFile('src/components/ui/select.tsx')
    const field = await readApplicationFile('src/modules/fleet/components/FleetField.component.tsx')
    const address = await readApplicationFile(
      'src/modules/fleet/components/DriverAddressFields.component.tsx',
    )

    expect(select).toContain('triggerRef')
    expect(field).toContain('triggerRef')
    expect(address).toContain('stateTriggerRef')
  })

  test('stops telling the operator to go to another screen', async () => {
    const [ptBr, en] = await Promise.all([
      readLocale('fleet.locale.json'),
      readLocale('fleet.en.locale.json'),
    ])

    for (const locale of [ptBr, en]) {
      expect(locale.ownerIncompleteFixButton).toBeTruthy()
      expect(locale.ownerIncompleteUnknownDriver).toBeTruthy()
      expect(locale.ownerIncompleteHint).toContain('{{fields}}')
    }

    expect(ptBr.ownerIncompleteHint).not.toContain('Motoristas')
    expect(ptBr.ownerIncompleteFeedback).not.toContain('Motoristas')
    expect(en.ownerIncompleteHint).not.toContain('Drivers')
    expect(en.ownerIncompleteFeedback).not.toContain('Drivers')
  })
})
