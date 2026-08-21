/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import enLocale from '../../src/modules/fleet/locales/fleet.en.locale.json'
import ptBrLocale from '../../src/modules/fleet/locales/fleet.locale.json'

const OWNER_FIELDS_PATH = 'src/modules/fleet/components/VehicleOwnerFields.component.tsx'
const DIALOG_PATH = 'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'
const EDIT_KEYS = ['ownerDriverEditButton', 'ownerDriverEditHint', 'ownerDriverEditTitle'] as const

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('owner driver edit contract', () => {
  // Corrigir a ficha do agregado sem sair do veículo: sair perde o formulário pela metade
  test('the picker opens the driver dialog in edit mode', () => {
    const source = readSource(OWNER_FIELDS_PATH)

    expect(source).toContain("setDriverDialog({ mode: 'edit' })")
    expect(source).toContain('onUpdate={onUpdateDriver}')
    expect(source).toContain('disabled={selectedDriver === undefined}')
  })

  // A altura do botão sai do mesmo token do gatilho compacto do select, não de um rem literal
  /** O aviso de proprietário incompleto acrescentou o terceiro; os três abrem a mesma ficha. */
  test('every button that opens the driver dialog matches the compact select trigger', () => {
    const source = readSource(OWNER_FIELDS_PATH)
    const buttons = source
      .split('<Button')
      .slice(1)
      .filter((block) => block.slice(0, block.indexOf('</Button>')).includes('setDriverDialog('))

    expect(buttons).toHaveLength(3)
    for (const button of buttons) expect(button).toContain('size="sm"')
  })

  test('the hint button opens the ficha already at the missing field', () => {
    const source = readSource(OWNER_FIELDS_PATH)

    expect(source).toContain('resolveVehicleOwnerFixField')
    expect(source).toContain('ownerIncompleteFixButton')
    expect(source).toContain('focusField: ownerFixField')
  })

  // Sem ficha aberta o diálogo cadastra; com ficha ele corrige, e o rascunho não atravessa
  test('the dialog tells the two modes apart', () => {
    const source = readSource(DIALOG_PATH)

    expect(source).toContain('driver?: FleetDriverDetail')
    expect(source).toContain('ownerDriverEditTitle')
    expect(source).toContain('ownerDriverEditHint')
  })

  test('every edit label is translated in both locales', () => {
    for (const key of EDIT_KEYS) {
      expect(ptBrLocale).toHaveProperty(key)
      expect(enLocale).toHaveProperty(key)
    }
  })
})
