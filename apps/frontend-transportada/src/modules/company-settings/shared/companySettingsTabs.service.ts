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
  'tollBoothCharges',
  'freightRegions',
  'nfseCredential',
  'nfseProfiles',
  'deliveryProof',
  'federalTaxes',
  'driverAllowance',
  'occurrenceTypeCatalog',
  'contractorMail',
  'cameraMeasurement',
  'entryKindCatalog',
  'quickReplies',
] as const

export type SettingsPanel = (typeof SETTINGS_PANELS)[number]

export const SETTINGS_PANEL_MODULES = [
  'company-settings',
  'delivery-clients',
  'fleet',
  'nfe-workspace',
  'nfse-invoice',
  'trip',
] as const

export type SettingsPanelModule = (typeof SETTINGS_PANEL_MODULES)[number]

export type SettingsDataSource =
  | 'cameraMeasurementSettings'
  | 'cargoSettings'
  | 'cargoVolumeFactors'
  | 'companyContacts'
  | 'companySettings'
  | 'contractorMailSettings'
  | 'deliveryProofSettings'
  | 'distributionCursor'
  | 'driverAllowanceSettings'
  | 'entryKindCatalog'
  | 'federalTaxes'
  | 'freightRegions'
  | 'fuelPrices'
  | 'landing'
  | 'nfse'
  | 'occurrenceTypeCatalog'
  | 'quickReplies'
  | 'scheduledDistribution'
  | 'tollBoothCharges'

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
   * Spec 152 D14 — o interruptor mora na aba onde o conferente já está: é lá que "Medir esta
   * caixa" aparece ou some, e é lá que quem administra configurações vê o efeito do que ligou.
   */
  cameraMeasurement: { module: 'nfe-workspace', source: 'cameraMeasurementSettings', tab: 'boxes' },
  /**
   * Spec 077 — o fator de cubagem mora **ao lado do peso padrão**: os dois estimam a mesma coisa a
   * partir do mesmo `qVol` da nota, e separá-los faria o operador procurar em dois lugares por duas
   * metades da mesma configuração.
   */
  cargoVolume: { module: 'nfe-workspace', source: 'cargoVolumeFactors', tab: 'imports' },
  cargoWeight: { module: 'nfe-workspace', source: 'cargoSettings', tab: 'imports' },
  certificates: { module: 'company-settings', source: 'companySettings', tab: 'certificates' },
  /**
   * Spec 143 — o painel entra na tela onde as contratantes são cadastradas (`delivery-clients`),
   * numa aba própria: é onde o administrador já está quando pensa em "como falo com quem eu
   * transporto para". A tela não tinha abas até aqui — ganhou uma para hospedar isto ao lado da
   * lista de clientes.
   */
  contractorMail: { module: 'delivery-clients', source: 'contractorMailSettings', tab: 'mail' },
  /**
   * Spec 082 (D4, ADR-0057) — o formulário do comprovante se decide **na tela de viagens**: é onde a
   * entrega aparece e onde o operador confere o que o motorista colheu. Configuração perto do efeito.
   */
  deliveryProof: { module: 'trip', source: 'deliveryProofSettings', tab: 'proof' },
  distributionCursor: { module: 'nfe-workspace', source: 'distributionCursor', tab: 'imports' },
  /**
   * Spec 143 D7 — mesmo molde de `federalTaxes`: aba própria em Configurações da empresa, ao lado
   * do regime federal, porque é outro valor da empresa inteira, não do módulo de frota.
   */
  driverAllowance: {
    module: 'company-settings',
    source: 'driverAllowanceSettings',
    tab: 'driverAllowance',
  },
  freightRegions: { module: 'fleet', source: 'freightRegions', tab: 'regions' },
  fuelPrices: { module: 'fleet', source: 'fuelPrices', tab: 'fuel' },
  /** Spec 095 item 4 — o painel gêmeo de combustível: aba própria, ao lado dela. */
  tollBoothCharges: { module: 'fleet', source: 'tollBoothCharges', tab: 'tolls' },
  /**
   * O catálogo morava na tela de viagens, numa aba chamada "Avisos" — nome que descrevia só o
   * efeito colateral (o e-mail) e escondia o que a tela realmente é: o **cadastro** do catálogo
   * (nome, etapa, interruptor de aviso, modelo de e-mail). Isto não é "configuração perto do
   * efeito": é cadastro da empresa, e mora em Configurações como os demais.
   */
  occurrenceTypeCatalog: {
    module: 'company-settings',
    source: 'occurrenceTypeCatalog',
    tab: 'occurrenceTypes',
  },
  /**
   * Spec 169 RF7: o cadastro mora perto do efeito — a mesma aba financeira de Configurações onde
   * o operador já pensa em dinheiro da viagem, não junto do catálogo de ocorrências.
   */
  entryKindCatalog: {
    module: 'company-settings',
    source: 'entryKindCatalog',
    tab: 'entryKinds',
  },
  /**
   * Spec 183 T701 (RF12): cadastro da empresa, como o catálogo de tipos de ocorrência — mora em
   * Configurações, e o efeito aparece no compositor de cada aba da conversa.
   */
  quickReplies: { module: 'company-settings', source: 'quickReplies', tab: 'quickReplies' },
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
  /**
   * Spec 126 — o regime federal e o PIS/COFINS moram em Configurações, numa aba própria: o dado é
   * da empresa inteira e fica ao lado do CRT, que é de onde a sugestão sai.
   */
  federalTaxes: { module: 'company-settings', source: 'federalTaxes', tab: 'taxes' },
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
    cameraMeasurementSettings: sources.has('cameraMeasurementSettings'),
    cargoSettings: sources.has('cargoSettings'),
    cargoVolumeFactors: sources.has('cargoVolumeFactors'),
    companyContacts: sources.has('companyContacts'),
    companySettings: module === 'company-settings' || sources.has('companySettings'),
    contractorMailSettings: sources.has('contractorMailSettings'),
    deliveryProofSettings: sources.has('deliveryProofSettings'),
    distributionCursor: sources.has('distributionCursor'),
    driverAllowanceSettings: sources.has('driverAllowanceSettings'),
    entryKindCatalog: sources.has('entryKindCatalog'),
    federalTaxes: sources.has('federalTaxes'),
    freightRegions: sources.has('freightRegions'),
    fuelPrices: sources.has('fuelPrices'),
    landing: sources.has('landing'),
    nfse: sources.has('nfse'),
    occurrenceTypeCatalog: sources.has('occurrenceTypeCatalog'),
    quickReplies: sources.has('quickReplies'),
    scheduledDistribution: sources.has('scheduledDistribution'),
    tollBoothCharges: sources.has('tollBoothCharges'),
  }
}

export const COMPANY_SETTINGS_TAB_IDS = [
  'company',
  'site',
  'certificates',
  'taxes',
  'driverAllowance',
  'occurrenceTypes',
  'entryKinds',
  'quickReplies',
] as const

export type CompanySettingsTabId = (typeof COMPANY_SETTINGS_TAB_IDS)[number]

/** Aba desconhecida — endereço antigo, digitação, estado velho — abre a primeira, não uma tela vazia. */
export function resolveCompanySettingsTab(value: string | null | undefined): CompanySettingsTabId {
  return COMPANY_SETTINGS_TAB_IDS.find((id) => id === value) ?? 'company'
}

export const COMPANY_SETTINGS_TAB_PARAMETER = 'tab'

/**
 * A lacuna "regime federal não declarado" do razão de valoração leva a
 * `/company-settings?tab=taxes` — sem ler a query no início, a tela sempre abriria em **Empresa** e
 * o link cairia na aba errada. `?tab=` ausente ou fora de `COMPANY_SETTINGS_TAB_IDS` cai em
 * `resolveCompanySettingsTab`, que já resolve para `'company'`.
 */
export function parseCompanySettingsTabParameter(search: string): CompanySettingsTabId {
  return resolveCompanySettingsTab(new URLSearchParams(search).get(COMPANY_SETTINGS_TAB_PARAMETER))
}

export function resolveCompanySettingsDataScope(tab: CompanySettingsTabId): SettingsDataScope {
  return resolveSettingsDataScope('company-settings', tab)
}
