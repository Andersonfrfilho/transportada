export const NFSE_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type NfseFiscalEnvironment = (typeof NFSE_FISCAL_ENVIRONMENTS)[number]

export const NFSE_CREDENTIAL_STATUSES = ['active', 'inactive'] as const
export type NfseCredentialStatus = (typeof NFSE_CREDENTIAL_STATUSES)[number]

export const NFSE_TAKERS = ['0', '3'] as const
export type NfseTaker = (typeof NFSE_TAKERS)[number]

export const NFSE_ISS_EXIGIBILITIES = ['1', '2', '3', '4', '5', '6', '7'] as const
export type NfseIssExigibility = (typeof NFSE_ISS_EXIGIBILITIES)[number]

/**
 * O resumo da credencial não tem campo de token: o servidor devolve só se está configurado, sem
 * máscara. Um campo a mais aqui seria um segredo a mais viajando pela rede.
 */
export type NfseProviderCredentialSummary = Readonly<{
  apiTokenConfigured: boolean
  callbackTokenConfigured: boolean
  createdAt: string
  fiscalEnvironment: NfseFiscalEnvironment
  id: string
  municipalRegistration: string
  provider: string
  status: NfseCredentialStatus
  taxId: string
  updatedAt: string
  version: string
}>

export type NfseEmissionProfileSettings = Readonly<{
  chargeComponentLabel: string
  cnaeCode: string
  descriptionMaxLength: string
  descriptionTemplate: string
  freightRuleId: null | string
  issExigibility: NfseIssExigibility
  issRate: string
  issWithheld: boolean
  municipalityIbgeCode: string
  municipalityName: string
  municipalTaxationCode: string
  name: string
  nbsCode: string
  observations: string
  serviceListItem: string
  taker: NfseTaker
}>

export type NfseEmissionProfile = NfseEmissionProfileSettings &
  Readonly<{
    companyId: string
    createdAt: string
    id: string
    status: 'active' | 'inactive'
    updatedAt: string
    version: string
  }>
