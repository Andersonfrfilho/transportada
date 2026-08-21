/* Copyright (c) 2026 Ada Technology. MIT License. */

export const SETTINGS_PANELS = [
  'settingsForm',
  'logo',
  'certificates',
  'scheduledDistribution',
  'distributionCursor',
  'fuelPrices',
  'freightRegions',
  'nfseCredential',
  'nfseProfiles',
] as const

export type SettingsPanel = (typeof SETTINGS_PANELS)[number]

export const SETTINGS_PANEL_MODULES = [
  'company-settings',
  'fleet',
  'nfe-workspace',
  'nfse-invoice',
] as const

export type SettingsPanelModule = (typeof SETTINGS_PANEL_MODULES)[number]

export type SettingsDataSource =
  | 'companySettings'
  | 'distributionCursor'
  | 'freightRegions'
  | 'fuelPrices'
  | 'nfse'
  | 'scheduledDistribution'

export type SettingsDataScope = Readonly<Record<SettingsDataSource, boolean>>

export type SettingsPanelPlacement = Readonly<{
  module: SettingsPanelModule
  source: SettingsDataSource
  tab: string
}>

/**
 * O endereço de cada painel de configuração, em um lugar só: em que módulo ele mora, em que aba
 * daquele módulo, e de qual consulta ele tira o que mostra.
 *
 * As três informações juntas são o que garante o campo preenchido — painel numa aba cuja consulta
 * está desligada abriria vazio sobre um cadastro existente, e o operador regravaria por cima. Elas
 * moram juntas porque a garantia que interessa ("todo painel tem exatamente um endereço, e esse
 * endereço liga a consulta que o alimenta") só é assertável de um lugar que enxergue os quatro
 * módulos ao mesmo tempo.
 */
export const SETTINGS_PANEL_PLACEMENT: Readonly<Record<SettingsPanel, SettingsPanelPlacement>> = {
  certificates: { module: 'company-settings', source: 'companySettings', tab: 'certificates' },
  distributionCursor: { module: 'nfe-workspace', source: 'distributionCursor', tab: 'imports' },
  freightRegions: { module: 'fleet', source: 'freightRegions', tab: 'regions' },
  fuelPrices: { module: 'fleet', source: 'fuelPrices', tab: 'fuel' },
  logo: { module: 'company-settings', source: 'companySettings', tab: 'company' },
  nfseCredential: { module: 'nfse-invoice', source: 'nfse', tab: 'settings' },
  nfseProfiles: { module: 'nfse-invoice', source: 'nfse', tab: 'settings' },
  scheduledDistribution: {
    module: 'nfe-workspace',
    source: 'scheduledDistribution',
    tab: 'imports',
  },
  settingsForm: { module: 'company-settings', source: 'companySettings', tab: 'company' },
}

export function settingsPanelsOf(
  module: SettingsPanelModule,
  tab: string,
): readonly SettingsPanel[] {
  return SETTINGS_PANELS.filter(
    (panel) =>
      SETTINGS_PANEL_PLACEMENT[panel].module === module &&
      SETTINGS_PANEL_PLACEMENT[panel].tab === tab,
  )
}

/** Na ordem de declaração dos painéis — é ela que decide a ordem das abas na tela. */
export function settingsTabsOf(module: SettingsPanelModule): readonly string[] {
  const tabs: string[] = []
  for (const panel of SETTINGS_PANELS) {
    const placement = SETTINGS_PANEL_PLACEMENT[panel]
    if (placement.module === module && !tabs.includes(placement.tab)) tabs.push(placement.tab)
  }
  return tabs
}

/**
 * Só as consultas dos painéis da aba aberta sobem. A exceção é `companySettings` dentro do próprio
 * módulo de configurações: o cabeçalho, os sinais de certificado e o estado de gravação a leem em
 * toda aba. Fora dali ela segue a regra geral.
 */
export function resolveSettingsDataScope(
  module: SettingsPanelModule,
  tab: string,
): SettingsDataScope {
  const sources = new Set(
    settingsPanelsOf(module, tab).map((panel) => SETTINGS_PANEL_PLACEMENT[panel].source),
  )
  return {
    companySettings: module === 'company-settings' || sources.has('companySettings'),
    distributionCursor: sources.has('distributionCursor'),
    freightRegions: sources.has('freightRegions'),
    fuelPrices: sources.has('fuelPrices'),
    nfse: sources.has('nfse'),
    scheduledDistribution: sources.has('scheduledDistribution'),
  }
}

export const COMPANY_SETTINGS_TAB_IDS = ['company', 'certificates'] as const

export type CompanySettingsTabId = (typeof COMPANY_SETTINGS_TAB_IDS)[number]

/** Aba desconhecida — endereço antigo, digitação, estado velho — abre a primeira, não uma tela vazia. */
export function resolveCompanySettingsTab(value: string | null | undefined): CompanySettingsTabId {
  return COMPANY_SETTINGS_TAB_IDS.find((id) => id === value) ?? 'company'
}

export function resolveCompanySettingsDataScope(tab: CompanySettingsTabId): SettingsDataScope {
  return resolveSettingsDataScope('company-settings', tab)
}
