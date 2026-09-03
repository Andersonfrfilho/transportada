/* Copyright (c) 2026 Ada Technology. MIT License. */

export const SETTINGS_PANELS = [
  'cargoVolume',
  'cargoWeight',
  'settingsForm',
  'logo',
  'landing',
  'companyContacts',
  'certificates',
  'scheduledDistribution',
  'distributionCursor',
  'fuelPrices',
  'freightRegions',
  'nfseCredential',
  'nfseProfiles',
  'occurrenceNotifications',
] as const

export type SettingsPanel = (typeof SETTINGS_PANELS)[number]

export const SETTINGS_PANEL_MODULES = [
  'company-settings',
  'fleet',
  'nfe-workspace',
  'nfse-invoice',
  'trip',
] as const

export type SettingsPanelModule = (typeof SETTINGS_PANEL_MODULES)[number]

export type SettingsDataSource =
  | 'cargoSettings'
  | 'cargoVolumeFactors'
  | 'companyContacts'
  | 'companySettings'
  | 'distributionCursor'
  | 'freightRegions'
  | 'fuelPrices'
  | 'landing'
  | 'nfse'
  | 'occurrenceNotifications'
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
  /**
   * Spec 077 — o fator de cubagem mora **ao lado do peso padrão**: os dois estimam a mesma coisa a
   * partir do mesmo `qVol` da nota, e separá-los faria o operador procurar em dois lugares por duas
   * metades da mesma configuração.
   */
  cargoVolume: { module: 'nfe-workspace', source: 'cargoVolumeFactors', tab: 'imports' },
  cargoWeight: { module: 'nfe-workspace', source: 'cargoSettings', tab: 'imports' },
  certificates: { module: 'company-settings', source: 'companySettings', tab: 'certificates' },
  distributionCursor: { module: 'nfe-workspace', source: 'distributionCursor', tab: 'imports' },
  freightRegions: { module: 'fleet', source: 'freightRegions', tab: 'regions' },
  fuelPrices: { module: 'fleet', source: 'fuelPrices', tab: 'fuel' },
  /**
   * Spec 079 — o aviso de ocorrência mora **na tela de viagens**, que é onde a ocorrência é
   * registrada e onde ela aparece. Numa tela de configurações genérica, quem liga o aviso estaria
   * longe do efeito dele — que é justamente o que a regra "configuração perto do efeito" evita.
   */
  occurrenceNotifications: {
    module: 'trip',
    source: 'occurrenceNotifications',
    tab: 'notifications',
  },
  /**
   * Spec 068 — os contatos e as redes moram na aba Site: é o mesmo cadastro público que a landing
   * publica, e é onde o operador já está quando pensa em "o que aparece para quem me procura". O
   * rodapé do e-mail do sistema lê a mesma lista.
   */
  companyContacts: { module: 'company-settings', source: 'companyContacts', tab: 'site' },
  landing: { module: 'company-settings', source: 'landing', tab: 'site' },
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
    cargoSettings: sources.has('cargoSettings'),
    cargoVolumeFactors: sources.has('cargoVolumeFactors'),
    companyContacts: sources.has('companyContacts'),
    companySettings: module === 'company-settings' || sources.has('companySettings'),
    distributionCursor: sources.has('distributionCursor'),
    freightRegions: sources.has('freightRegions'),
    fuelPrices: sources.has('fuelPrices'),
    landing: sources.has('landing'),
    nfse: sources.has('nfse'),
    occurrenceNotifications: sources.has('occurrenceNotifications'),
    scheduledDistribution: sources.has('scheduledDistribution'),
  }
}

export const COMPANY_SETTINGS_TAB_IDS = ['company', 'site', 'certificates'] as const

export type CompanySettingsTabId = (typeof COMPANY_SETTINGS_TAB_IDS)[number]

/** Aba desconhecida — endereço antigo, digitação, estado velho — abre a primeira, não uma tela vazia. */
export function resolveCompanySettingsTab(value: string | null | undefined): CompanySettingsTabId {
  return COMPANY_SETTINGS_TAB_IDS.find((id) => id === value) ?? 'company'
}

export function resolveCompanySettingsDataScope(tab: CompanySettingsTabId): SettingsDataScope {
  return resolveSettingsDataScope('company-settings', tab)
}
