/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
  settingsPanelsOf,
  settingsTabsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PAGE_PATH = 'src/modules/fleet/pages/FleetWorkspace.page.tsx'
const PANEL_PATH = 'src/modules/fleet/components/TollBoothChargePanel.component.tsx'
const HOOK_PATH = 'src/modules/fleet/hooks/useTollBoothCharges.hook.ts'
const LOCALE_PATH = 'src/modules/fleet/locales/fleet.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/fleet/locales/fleet.en.locale.json'

const PANEL_LABEL_KEYS = [
  'title',
  'hint',
  'empty',
  'loadError',
  'unnamed',
  'operator',
  'operatorUnknown',
  'unknown',
  'effectiveManual',
  'effectiveAutomatic',
  'mapTariff',
  'adjustedBy',
  'manualFieldLabel',
  'automaticFieldLabel',
  'observedOnFieldLabel',
  'save',
  'clear',
  'saved',
  'error',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('fleet toll booth charge tab contract (spec 095 item 4)', () => {
  test('a tarifa de pedágio mora na frota, ao lado do combustível', () => {
    expect(SETTINGS_PANEL_PLACEMENT.tollBoothCharges).toEqual({
      module: 'fleet',
      source: 'tollBoothCharges',
      tab: 'tolls',
    })
    expect(settingsTabsOf('fleet')).toEqual(['fuel', 'tolls', 'regions'])
    expect(settingsPanelsOf('fleet', 'tolls')).toEqual(['tollBoothCharges'])
  })

  test('a consulta de pedágio sobe só na aba de pedágio', () => {
    expect(resolveSettingsDataScope('fleet', 'tolls').tollBoothCharges).toBe(true)
    expect(resolveSettingsDataScope('fleet', 'fuel').tollBoothCharges).toBe(false)
    expect(resolveSettingsDataScope('fleet', 'vehicles').tollBoothCharges).toBe(false)
    expect(resolveSettingsDataScope('fleet', 'tolls').companySettings).toBe(false)
  })

  test('o painel e o hook moram na frota', async () => {
    const panel = await readApplicationFile(PANEL_PATH)
    const hook = await readApplicationFile(HOOK_PATH)

    expect(panel).toContain('export function TollBoothChargePanel')
    expect(hook).toContain('export function useTollBoothCharges')
  })

  /** Aba ausente, não desabilitada: quem não pode configurar não vê que a configuração existe. */
  test('a aba de pedágio só entra na lista com settings.manage', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('...(canManageSettings ? [fuelTab, tollTab] : [])')
  })

  test('o hook recebe permissão e aba aberta no mesmo enabled', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('enabled: canManageSettings && settingsScope.tollBoothCharges')
  })

  test('as praças chegam ao painel vindas da consulta', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('charges={tollBoothCharges.query.data}')
    expect(page).toContain('loading={tollBoothCharges.query.isLoading}')
  })

  // As sem tarifa e as com R$ 0,00 são o motivo da página existir — a ordem sai do servidor
  test('lista vazia é ausência de viagem vista, nunca "nada a corrigir"', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain('tollBoothCharges.empty')
  })

  test('cada campo carrega a própria origem — catálogo ou ajuste manual', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain('chargePerAxleSource')
    expect(panel).toContain('chargePerAxleAutomaticSource')
    expect(panel).toContain('tollBoothCharges.source.')
  })

  // A limpeza apaga o ajuste inteiro e devolve o catálogo — nunca grava zero
  test('a ação de remover só existe onde há ajuste da transportadora', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain("source === 'manual'")
    expect(panel).toContain('tollBoothCharges.clear')
    expect(panel).toContain('onClear')
  })

  test('o painel entra na tela com esqueleto e sem controle fora do design system', async () => {
    const [panel, hook] = await Promise.all([
      readApplicationFile(PANEL_PATH),
      readApplicationFile(HOOK_PATH),
    ])

    expect(panel).toContain('Skeleton')
    expect(panel).toContain('Icon')
    expect(panel).not.toContain('<svg')
    expect(panel).not.toContain('<select')
    expect(panel).not.toContain("type='checkbox'")
    expect(panel).not.toContain('type="checkbox"')
    expect(panel).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const method of ['adjustTollBoothCharge', 'clearTollBoothCharge', 'getTollBoothCharges']) {
      expect(hook).toContain(method)
    }
  })

  test('a data da tarifa usa o calendário do design system, nunca o campo de data nativo', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain('FleetDateField')
    expect(panel).not.toContain('type="date"')
    expect(panel).not.toContain("type='date'")
  })

  test('traduz cada rótulo do painel nos dois pacotes de tradução', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)
      const tollBoothCharges = locale['tollBoothCharges'] as Record<string, unknown>
      const source = tollBoothCharges['source'] as Record<string, unknown>

      for (const key of PANEL_LABEL_KEYS) expect(tollBoothCharges[key]).toBeString()
      for (const value of ['catalog', 'manual']) expect(source[value]).toBeString()

      const tabs = locale['tabs'] as Record<string, string>
      expect(typeof tabs['tolls']).toBe('string')
    }

    const portuguese = await readLocale(LOCALE_PATH)
    expect((portuguese['tabs'] as Record<string, string>)['tolls']).toBe('Pedágio')

    const panel = await readApplicationFile(PANEL_PATH)
    expect(panel).toContain("useTranslation('fleet')")
  })
})
