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
const EXPORT_HOOK = 'src/modules/nfe-workspace/hooks/useCameraMeasurementExport.hook.ts'
const EXPORT_CLIENT = 'src/modules/nfe-workspace/shared/cameraMeasurementExportClient.service.ts'
const EXPORT_SERVICE = 'src/modules/nfe-workspace/shared/cameraMeasurementExport.service.ts'
const VALIDATION_SERVICE = 'src/modules/nfe-workspace/shared/cameraMeasurementValidation.service.ts'
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

/**
 * T12 (R6/R8): o painel ganha o export CSV do período e o resumo da validação — mesma permissão
 * `settings.manage` do interruptor (D14), mesma aba `boxes`.
 */
describe('export e resumo da validação (spec 152 T12, R6/R8)', () => {
  test('o painel usa o serviço puro de resumo e o construtor de CSV', () => {
    const panel = read(PANEL)

    expect(panel).toContain('CameraMeasurementValidationSummary')
    expect(panel).toContain(
      "import type { CameraMeasurementExportEntry } from '../shared/cameraMeasurementValidation.service'",
    )
  })

  test('o resumo diz o veredito em texto e ícone, nunca só por cor', () => {
    const panel = read(PANEL)

    expect(panel).toContain('VERDICT_ICON')
    expect(panel).toContain('<Icon name={VERDICT_ICON[summary.verdict]} />')
  })

  /**
   * ⚠️ **Leitura fora do protocolo tem que aparecer.** `cameraOnlyCount` era calculado e nunca
   * chegava à tela: o ramo vazio saía por `readingCount === 0` antes de qualquer coisa, e uma sessão
   * inteira medida sem conferir com a fita ficava idêntica a "ninguém mediu" (2ª revisão, item A-a).
   * A contagem aparece nos dois ramos, dizendo que são leituras não conferidas e fora da conta.
   */
  test('as leituras camera puras aparecem na tela, no ramo vazio e ao lado do total', () => {
    const panel = read(PANEL)

    expect(panel).toContain('summary.cameraOnlyCount')
    expect(panel).toContain('cameraMeasurementValidationCameraOnly')
    /** O mesmo nó nos dois ramos — o vazio e o normal —, nunca só no de baixo. */
    expect(panel.match(/\{cameraOnlyHint\}/gu)?.length).toBe(2)
    expect(panel).not.toContain('if (summary.readingCount === 0) {\n    return <p')
  })

  test('o rótulo das leituras camera puras existe nos dois idiomas, acentuado', () => {
    for (const path of LOCALE_PATHS) {
      expect(typeof readLocale(path)['cameraMeasurementValidationCameraOnly']).toBe('string')
    }
    expect(
      readLocale(LOCALE_PATHS[0] as string)['cameraMeasurementValidationCameraOnly'],
    ).toContain('câmera')
  })

  test('a taxa de margem mostra quantas leituras têm margem conhecida (D17/T10)', () => {
    const panel = read(PANEL)

    expect(panel).toContain('cameraMeasurementValidationWithinMargin')
    expect(panel).toContain('withinMarginKnownCount')
  })

  test('o export CSV existe, sem descrição do produto, com as colunas do spike', () => {
    const service = read(EXPORT_SERVICE)

    expect(service).toContain('export function buildCameraMeasurementCsv')
    expect(service).toContain('CAMERA_MEASUREMENT_EXPORT_COLUMNS')
    expect(service).not.toContain('description')
  })

  test('o resumo (puro, sem I/O) calcula as duas taxas de R6', () => {
    const service = read(VALIDATION_SERVICE)

    expect(service).toContain('export function summarizeCameraMeasurementValidation')
    expect(service).toContain('VALIDATION_WITHIN_TEN_MILLIMETRE_TARGET_RATE')
    expect(service).toContain('VALIDATION_WITHIN_MARGIN_TARGET_RATE')
  })

  test('o hook consulta a rota do export com settings.manage, paginada por cursor', () => {
    const client = read(EXPORT_CLIENT)
    const hook = read(EXPORT_HOOK)

    expect(client).toContain('/nfe-package-box-measurements')
    expect(hook).toContain('useInfiniteQuery')
    expect(hook).toContain('summarizeCameraMeasurementValidation')
  })

  test('a página passa o export e o resumo ao painel, com a mesma permissão do interruptor', () => {
    const page = read(PAGE)

    expect(page).toContain('useCameraMeasurementExport')
    expect(page).toContain('canManageSettings && settingsScope.cameraMeasurementSettings')
    expect(page).toContain('buildCameraMeasurementCsv')
  })

  test('os rótulos do export e do resumo existem, acentuados, nos dois pacotes de tradução', () => {
    for (const path of LOCALE_PATHS) {
      const locale = readLocale(path)

      expect(typeof locale['cameraMeasurementValidationTitle']).toBe('string')
      expect(typeof locale['cameraMeasurementValidationExport']).toBe('string')
      expect(typeof locale['cameraMeasurementValidationWithinTen']).toBe('string')
      expect(typeof locale['cameraMeasurementValidationWithinMargin']).toBe('string')
      expect(typeof locale['cameraMeasurementValidationVerdictGo']).toBe('string')
      expect(typeof locale['cameraMeasurementValidationVerdictNoGo']).toBe('string')
    }
  })
})
