/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

const TAB_FORM_PATH = 'src/modules/fleet/components/DriverForm.component.tsx'
const DIALOG_PATH = 'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'

/** Os grupos que compõem a ficha: campo que só existe num deles é campo que some por caminho. */
const FIELD_GROUPS = [
  '<DriverPersonalFields',
  '<DriverAddressFields',
  '<DriverCoverageFields',
] as const

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

function labelKeysOf(source: string): readonly string[] {
  return [...source.matchAll(/(?<![\w-])label=\{t\('([^']+)'\)\}/g)]
    .map((match) => match[1] ?? '')
    .sort()
}

describe('driver form parity contract', () => {
  /**
   * O diálogo aberto pelo cadastro de veículo é a mesma ficha da aba de motoristas — ele cadastra
   * e corrige o mesmo registro. Rótulo presente num só dos dois é dado que o operador perde
   * dependendo de por onde abriu.
   */
  test('names the same fields in the tab and in the dialog', () => {
    expect(labelKeysOf(readSource(DIALOG_PATH))).toEqual(labelKeysOf(readSource(TAB_FORM_PATH)))
  })

  test('renders every field group in both forms', () => {
    for (const path of [TAB_FORM_PATH, DIALOG_PATH]) {
      const source = readSource(path)

      for (const group of FIELD_GROUPS) expect(source).toContain(group)
      expect(source).toContain("<legend>{t('driverIdentityLegend')}</legend>")
      expect(source).toContain("<legend>{t('driverVehiclesLegend')}</legend>")
    }
  })

  /** Um controlador só: cópia à mão do estado é como a cobertura da edição ficou para trás. */
  test('drives both forms with the same controller', () => {
    for (const path of [TAB_FORM_PATH, DIALOG_PATH]) {
      const source = readSource(path)

      expect(source).toContain("import { useDriverForm } from '../hooks/useDriverForm.hook'")
      expect(source).toContain('useDriverForm({')
      expect(source).not.toContain('useState<FleetDriverFormState>')
    }
  })
})
