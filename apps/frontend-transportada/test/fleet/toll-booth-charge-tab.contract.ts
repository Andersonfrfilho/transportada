/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 095 item 4 (a tarifa mora na frota) + spec 154 T204 (a aba passa a listar o catálogo
 * inteiro, com busca, paginação e o cabeçalho de RF2/D5). Não afrouxa nenhuma asserção antiga —
 * as que descreviam a lista "só o que a operação já viu" foram atualizadas para a arquitetura nova,
 * decidida pela spec 154, e as demais (design system, permissão, dicionário completo) continuam
 * de pé.
 */
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
const ROW_PATH = 'src/modules/fleet/components/TollBoothChargeRow.component.tsx'
const SUMMARY_PATH = 'src/modules/fleet/components/TollBoothCatalogSummary.component.tsx'
const HOOK_PATH = 'src/modules/fleet/hooks/useTollBoothCharges.hook.ts'
const CATALOG_HOOK_PATH = 'src/modules/fleet/hooks/useTollBoothCatalog.hook.ts'
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

const CATALOG_LABEL_KEYS = [
  'searchLabel',
  'summaryTotal',
  'summaryObservedOn',
  'pendingCount',
  'searchEmpty',
  'unknownCatalog',
  'previousPage',
  'nextPage',
  'pageOfTotal',
] as const

const CATALOG_STATUS_KEYS = ['empty', 'stale', 'current'] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readCombinedComponentSource(): Promise<string> {
  const [panel, row, summary] = await Promise.all([
    readApplicationFile(PANEL_PATH),
    readApplicationFile(ROW_PATH),
    readApplicationFile(SUMMARY_PATH),
  ])
  return `${panel}\n${row}\n${summary}`
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('fleet toll booth charge tab contract (spec 095 item 4, spec 154 T204)', () => {
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

  test('o painel, a linha e os hooks moram na frota', async () => {
    const [panel, row, hook, catalogHook] = await Promise.all([
      readApplicationFile(PANEL_PATH),
      readApplicationFile(ROW_PATH),
      readApplicationFile(HOOK_PATH),
      readApplicationFile(CATALOG_HOOK_PATH),
    ])

    expect(panel).toContain('export function TollBoothChargePanel')
    expect(row).toContain('export function TollBoothChargeRow')
    expect(hook).toContain('export function useTollBoothCharges')
    expect(catalogHook).toContain('export function useTollBoothCatalog')
  })

  /** Aba ausente, não desabilitada: quem não pode configurar não vê que a configuração existe. */
  test('a aba de pedágio só entra na lista com settings.manage', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('...(canManageSettings ? [fuelTab, tollTab] : [])')
  })

  test('o hook do catálogo abre na mesma condição da aba de pedágio', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('const tollBoothCharges = useTollBoothCharges()')
    expect(page).toContain('enabled: canManageSettings && settingsScope.tollBoothCharges')
  })

  // Spec 154 T204 — aceite 1: o painel passa a ler o catálogo inteiro, não só as praças vistas.
  test('as praças chegam ao painel vindas do catálogo, com busca e paginação do servidor', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('catalog={tollBoothCatalog.query.data}')
    expect(page).toContain('loading={tollBoothCatalog.query.isLoading}')
    expect(page).toContain('search={tollBoothCatalog.search}')
    expect(page).toContain('onSearchChange={tollBoothCatalog.setSearch}')
    expect(page).toContain('onPageChange={tollBoothCatalog.setPage}')
  })

  // A busca é do servidor (D2): o termo entra na queryKey, depois de repousar, e reinicia a página.
  test('a busca dispara a consulta com search e volta para a primeira página', async () => {
    const catalogHook = await readApplicationFile(CATALOG_HOOK_PATH)

    expect(catalogHook).toContain("debouncedSearch === '' ? {} : { search: debouncedSearch }")
    expect(catalogHook).toContain('queryKey = [TOLL_BOOTH_CATALOG_QUERY_KEY')
    expect(catalogHook).toContain('setSearch(value)')
    expect(catalogHook).toContain('setPage(1)')
  })

  // D2: page/perPage do servidor — trocar de página não é paginação em memória.
  test('a troca de página passa page ao cliente do catálogo', async () => {
    const [catalogHook, client] = await Promise.all([
      readApplicationFile(CATALOG_HOOK_PATH),
      readApplicationFile('src/modules/fleet/shared/tollBoothCatalogClient.service.ts'),
    ])

    expect(catalogHook).toContain('setPage')
    expect(client).toContain("search.set('page', String(input.page))")
    expect(client).toContain("search.set('perPage', String(input.perPage))")
  })

  // RF2/D5: total, data, estado do catálogo e a pendência de tarifa por eixo — os quatro dados.
  test('o cabeçalho mostra total, data, estado do catálogo e a pendência de tarifa por eixo', async () => {
    const summary = await readApplicationFile(SUMMARY_PATH)

    expect(summary).toContain('tollBoothCharges.catalog.summaryTotal')
    expect(summary).toContain('tollBoothCharges.catalog.summaryObservedOn')
    expect(summary).toContain('tollBoothCharges.catalog.status.${summary.status}')
    expect(summary).toContain('tollBoothCharges.catalog.pendingCount')
  })

  // Caso extremo da spec: catálogo vazio é ausência de dado, nunca "sem pedágio".
  test('catálogo vazio mostra a frase própria de "nunca carregado"', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain("catalog.summary.status === 'empty'")
    expect(panel).toContain('tollBoothCharges.catalog.status.empty')
  })

  // Caso extremo: busca sem resultado nunca é indistinguível de "nada a corrigir".
  test('busca sem resultado nomeia a data do catálogo, nunca lista vazia muda', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain('tollBoothCharges.catalog.searchEmpty')
    expect(panel).toContain('tollBoothCharges.empty')
  })

  // D1: o ajuste de praça que o catálogo não conhece mais continua aparecendo, marcado, editável.
  test('praça sem catálogo (catalogKnown: false) aparece marcada e continua editável', async () => {
    const row = await readApplicationFile(ROW_PATH)

    expect(row).toContain('entry.catalogKnown')
    expect(row).toContain('tollBoothCharges.catalog.unknownCatalog')
    // A marca não esconde o formulário de ajuste — ele é renderizado incondicionalmente abaixo.
    expect(row).toContain('onAdjust')
  })

  test('cada campo carrega a própria origem — catálogo ou ajuste manual', async () => {
    const row = await readApplicationFile(ROW_PATH)

    expect(row).toContain('chargePerAxleSource')
    expect(row).toContain('chargePerAxleAutomaticSource')
    expect(row).toContain('tollBoothCharges.source.')
  })

  // A limpeza apaga o ajuste inteiro e devolve o catálogo — nunca grava zero
  test('a ação de remover só existe onde há ajuste da transportadora', async () => {
    const row = await readApplicationFile(ROW_PATH)

    expect(row).toContain("source === 'manual'")
    expect(row).toContain('tollBoothCharges.clear')
    expect(row).toContain('onClear')
  })

  test('o painel entra na tela com esqueleto e sem controle fora do design system', async () => {
    const [combined, hook] = await Promise.all([
      readCombinedComponentSource(),
      readApplicationFile(HOOK_PATH),
    ])

    expect(combined).toContain('Skeleton')
    expect(combined).toContain('Icon')
    expect(combined).not.toContain('<svg')
    expect(combined).not.toContain('<select')
    expect(combined).not.toContain("type='checkbox'")
    expect(combined).not.toContain('type="checkbox"')
    expect(combined).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const method of ['adjustTollBoothCharge', 'clearTollBoothCharge']) {
      expect(hook).toContain(method)
    }
  })

  test('a data da tarifa usa o calendário do design system, nunca o campo de data nativo', async () => {
    const row = await readApplicationFile(ROW_PATH)

    expect(row).toContain('FleetDateField')
    expect(row).not.toContain('type="date"')
    expect(row).not.toContain("type='date'")
  })

  test('a edição de ajuste é a mesma mutação de sempre, e invalida o catálogo também', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain(
      "import { TOLL_BOOTH_CATALOG_QUERY_KEY } from './useTollBoothCatalog.hook'",
    )
    expect(hook).toContain('invalidateQueries({ queryKey: [TOLL_BOOTH_CATALOG_QUERY_KEY] })')
  })

  test('traduz cada rótulo do painel e do catálogo nos dois pacotes de tradução', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)
      const tollBoothCharges = locale['tollBoothCharges'] as Record<string, unknown>
      const source = tollBoothCharges['source'] as Record<string, unknown>
      const catalog = tollBoothCharges['catalog'] as Record<string, unknown>
      const status = catalog['status'] as Record<string, unknown>

      for (const key of PANEL_LABEL_KEYS) expect(tollBoothCharges[key]).toBeString()
      for (const value of ['catalog', 'manual']) expect(source[value]).toBeString()
      for (const key of CATALOG_LABEL_KEYS) expect(catalog[key]).toBeString()
      for (const key of CATALOG_STATUS_KEYS) expect(status[key]).toBeString()

      const tabs = locale['tabs'] as Record<string, string>
      expect(typeof tabs['tolls']).toBe('string')
    }

    const portuguese = await readLocale(LOCALE_PATH)
    expect((portuguese['tabs'] as Record<string, string>)['tolls']).toBe('Pedágio')

    const panel = await readApplicationFile(PANEL_PATH)
    expect(panel).toContain("useTranslation('fleet')")
  })
})
