/* Copyright (c) 2026 Ada Technology. MIT License. */

export const COMPANY_SETTINGS_TAB_IDS = [
  'company',
  'certificates',
  'distribution',
  'fuel',
  'nfse',
] as const

export type CompanySettingsTabId = (typeof COMPANY_SETTINGS_TAB_IDS)[number]

export const COMPANY_SETTINGS_PANELS = [
  'settingsForm',
  'logo',
  'certificates',
  'scheduledDistribution',
  'distributionCursor',
  'fuelPrices',
  'nfseCredential',
  'nfseProfiles',
] as const

export type CompanySettingsPanel = (typeof COMPANY_SETTINGS_PANELS)[number]

export const COMPANY_SETTINGS_TAB_PANELS: Readonly<
  Record<CompanySettingsTabId, readonly CompanySettingsPanel[]>
> = {
  certificates: ['certificates'],
  company: ['settingsForm', 'logo'],
  distribution: ['scheduledDistribution', 'distributionCursor'],
  fuel: ['fuelPrices'],
  nfse: ['nfseCredential', 'nfseProfiles'],
}

/**
 * De qual consulta cada painel tira o que mostra. É essa tabela que amarra a aba ao dado: painel
 * numa aba cuja consulta está desligada abriria com o campo vazio mesmo havendo cadastro gravado.
 */
export const COMPANY_SETTINGS_PANEL_SOURCE: Readonly<
  Record<CompanySettingsPanel, CompanySettingsDataSource>
> = {
  certificates: 'companySettings',
  distributionCursor: 'distributionCursor',
  fuelPrices: 'fuelPrices',
  logo: 'companySettings',
  nfseCredential: 'nfse',
  nfseProfiles: 'nfse',
  scheduledDistribution: 'scheduledDistribution',
  settingsForm: 'companySettings',
}

export type CompanySettingsDataSource =
  | 'companySettings'
  | 'distributionCursor'
  | 'fuelPrices'
  | 'nfse'
  | 'scheduledDistribution'

export type CompanySettingsDataScope = Readonly<Record<CompanySettingsDataSource, boolean>>

/** Aba desconhecida — endereço antigo, digitação, estado velho — abre a primeira, não uma tela vazia. */
export function resolveCompanySettingsTab(value: string | null | undefined): CompanySettingsTabId {
  return COMPANY_SETTINGS_TAB_IDS.find((id) => id === value) ?? 'company'
}

/**
 * O cabeçalho, o painel de sinais dos certificados e o estado de gravação leem `companySettings` em
 * toda aba: ele fica sempre ligado. As demais consultas só sobem quando a aba delas está aberta —
 * era a montagem simultânea das nove que fazia a tela custar tudo para mostrar uma coisa só.
 */
export function resolveCompanySettingsDataScope(
  tab: CompanySettingsTabId,
): CompanySettingsDataScope {
  const sources = new Set(
    COMPANY_SETTINGS_TAB_PANELS[tab].map((panel) => COMPANY_SETTINGS_PANEL_SOURCE[panel]),
  )
  return {
    companySettings: true,
    distributionCursor: sources.has('distributionCursor'),
    fuelPrices: sources.has('fuelPrices'),
    nfse: sources.has('nfse'),
    scheduledDistribution: sources.has('scheduledDistribution'),
  }
}
