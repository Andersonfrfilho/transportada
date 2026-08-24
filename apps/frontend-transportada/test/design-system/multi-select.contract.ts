/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  filterMultiSelectOptions,
  resolveMultiSelectSelection,
  toggleMultiSelectValue,
} from '../../src/components/ui/multiSelect.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const COMPONENT_PATH = 'src/components/ui/multi-select.tsx'
const STYLES_PATH = 'src/components/ui/multi-select.module.css'
const DRIVER_FIELD_PATH = 'src/modules/fleet/components/DriverVehicleLinkField.component.tsx'

const OPTIONS = [
  { description: 'Volvo FH 540 · Tração', label: 'ABC1D23', value: 'v1' },
  { description: 'Randon SR · Implemento', label: 'XYZ4E56', value: 'v2' },
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('design system multi select contract', () => {
  /** Quem procura pelo modelo não sabe a placa — é por isso que procura. */
  test('searches the plate and the model, ignoring accent and case', () => {
    expect(filterMultiSelectOptions({ options: OPTIONS, query: 'volvo' })).toEqual([OPTIONS[0]!])
    expect(filterMultiSelectOptions({ options: OPTIONS, query: 'xyz4' })).toEqual([OPTIONS[1]!])
    expect(filterMultiSelectOptions({ options: OPTIONS, query: 'TRACAO' })).toEqual([OPTIONS[0]!])
    expect(filterMultiSelectOptions({ options: OPTIONS, query: '  ' })).toEqual(OPTIONS)
  })

  test('toggles a value without dropping the rest of the selection', () => {
    expect(toggleMultiSelectValue({ value: 'v2', values: ['v1'] })).toEqual(['v1', 'v2'])
    expect(toggleMultiSelectValue({ value: 'v1', values: ['v1', 'v2'] })).toEqual(['v2'])
  })

  /** Vínculo gravado cujo veículo saiu do catálogo tem de continuar visível para ser desfeito. */
  test('keeps a selected value that no longer has an option', () => {
    expect(resolveMultiSelectSelection({ options: OPTIONS, values: ['v2', 'gone'] })).toEqual([
      OPTIONS[1]!,
      { label: 'gone', value: 'gone' },
    ])
  })

  test('keeps the panel in a portal, searchable and driven by keyboard', async () => {
    const component = await readApplicationFile(COMPONENT_PATH)

    for (const contract of [
      'createPortal',
      'useFloatingLayer',
      'role="listbox"',
      'aria-multiselectable',
      'role="option"',
      'aria-selected',
      'aria-activedescendant',
      'role="combobox"',
      'resolveSelectSearchKey',
      'stopPropagation()',
    ]) {
      expect(component).toContain(contract)
    }
  })

  /** Escolher três veículos é um gesto só: fechar a cada clique devolveria o atrito da lista. */
  test('leaves the panel open while options are toggled', async () => {
    const component = await readApplicationFile(COMPONENT_PATH)

    expect(component).toMatch(/function toggle\(value: string\): void \{\s*onChange\(/)
    expect(component).not.toMatch(/toggle\([^)]*\)\s*\n\s*close\(\)/)
  })

  /** O quadrado dentro da linha é desenho de estado — dois alvos de clique se anulariam. */
  test('routes the click of an option through the row alone', async () => {
    const styles = await readApplicationFile(STYLES_PATH)

    expect(styles).toContain('pointer-events: none')
    expect(styles).toContain('var(--color-')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\brgba?\(/)
  })

  /** É o defeito relatado: uma caixa por veículo empurrava o resto da ficha para fora da tela. */
  test('links driver vehicles through the multi select instead of a checkbox grid', async () => {
    const [field, form, dialog] = await Promise.all([
      readApplicationFile(DRIVER_FIELD_PATH),
      readApplicationFile('src/modules/fleet/components/DriverForm.component.tsx'),
      readApplicationFile('src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'),
    ])

    expect(field).toContain('MultiSelect')
    expect(field).toContain('vehicle.plate')
    expect(field).toContain('vehicle.model')
    for (const caller of [form, dialog]) {
      expect(caller).toContain('<DriverVehicleLinkField')
      expect(caller).not.toContain('vehicleLinkList')
    }
  })
})
