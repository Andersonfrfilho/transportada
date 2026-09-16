/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
  settingsPanelsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const ROOT = new URL('../..', import.meta.url)
const PANEL = 'src/modules/nfe-workspace/components/CameraMeasurementSettingsPanel.component.tsx'
const HOOK = 'src/modules/nfe-workspace/hooks/useCargoSettings.hook.ts'
const CLIENT = 'src/modules/company-settings/shared/companySettingsClient.service.ts'
const PAGE = 'src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx'
const LOCALE_PATHS = [
  'src/modules/nfe-workspace/locales/nfeWorkspace.locale.json',
  'src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json',
]

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), 'utf8')
}

function readLocale(path: string): Record<string, unknown> {
  return JSON.parse(read(path)) as Record<string, unknown>
}

/**
 * Spec 152 T4 (D14): o interruptor por empresa mora na aba onde o conferente já está — é ela que
 * mostra ou esconde "Medir esta caixa". T12 estende este contrato com o selo experimental completo
 * e o resumo da validação.
 */
describe('o painel do interruptor da medida pela câmera (spec 152 D14)', () => {
  test('mora na aba de caixas do nfe-workspace, nunca na de configurações gerais', () => {
    expect(SETTINGS_PANEL_PLACEMENT.cameraMeasurement).toEqual({
      module: 'nfe-workspace',
      source: 'cameraMeasurementSettings',
      tab: 'boxes',
    })
  })

  test('a aba de caixas liga a consulta do painel, e a de importações não', () => {
    const boxes = resolveSettingsDataScope('nfe-workspace', 'boxes')
    const imports = resolveSettingsDataScope('nfe-workspace', 'imports')

    expect(boxes.cameraMeasurementSettings).toBe(true)
    expect(imports.cameraMeasurementSettings).toBe(false)
    expect(settingsPanelsOf('nfe-workspace', 'boxes')).toContain('cameraMeasurement')
  })

  test('o painel, o cliente e o hook existem com os nomes esperados', () => {
    expect(read(PANEL)).toContain('export function CameraMeasurementSettingsPanel')
    expect(read(CLIENT)).toContain('setCameraMeasurementEnabled')
    expect(read(HOOK)).toContain('cameraMeasurementMutation')
  })

  test('só quem administra configurações vê o painel na tela de notas', () => {
    const page = read(PAGE)

    expect(page).toContain('<CameraMeasurementSettingsPanel')
    expect(page).toContain('canManageSettings && (')
    expect(page).toContain('settingsScope.cameraMeasurementSettings')
  })

  test('os rótulos existem, acentuados, nos dois pacotes de tradução', () => {
    for (const path of LOCALE_PATHS) {
      const locale = readLocale(path)

      expect(typeof locale['cameraMeasurementTitle']).toBe('string')
      expect(typeof locale['cameraMeasurementHint']).toBe('string')
      expect(typeof locale['cameraMeasurementOn']).toBe('string')
      expect(typeof locale['cameraMeasurementOff']).toBe('string')
      expect(typeof locale['cameraMeasurementEnable']).toBe('string')
      expect(typeof locale['cameraMeasurementDisable']).toBe('string')
    }
  })

  /** Estado nunca só por cor (CLAUDE.md): o texto muda entre ligado e desligado, não só a classe. */
  test('o estado ligado/desligado é dito em texto, não só em cor', () => {
    const panel = read(PANEL)

    expect(panel).toContain("t(enabled ? 'cameraMeasurementOn' : 'cameraMeasurementOff')")
  })
})
