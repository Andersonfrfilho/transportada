/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type {
  NFSE_CREDENTIAL_STATUSES,
  NFSE_EMISSION_PROFILE_STATUSES,
  NFSE_FISCAL_ENVIRONMENTS,
  NFSE_ISS_EXIGIBILITIES,
  NFSE_PROVIDERS,
  NFSE_TAKERS,
} from '../../database/nfse.schema.js'

export type NfseCredentialStatus = (typeof NFSE_CREDENTIAL_STATUSES)[number]
export type NfseEmissionProfileStatus = (typeof NFSE_EMISSION_PROFILE_STATUSES)[number]
export type NfseFiscalEnvironment = (typeof NFSE_FISCAL_ENVIRONMENTS)[number]
export type NfseIssExigibility = (typeof NFSE_ISS_EXIGIBILITIES)[number]
export type NfseProvider = (typeof NFSE_PROVIDERS)[number]
export type NfseTaker = (typeof NFSE_TAKERS)[number]

export type NfseEmissionProfileSettings = {
  readonly chargeComponentLabel: string
  readonly cnaeCode: string
  readonly descriptionMaxLength: string
  readonly descriptionTemplate: string
  readonly freightRuleId: string
  readonly issExigibility: NfseIssExigibility
  readonly issRate: string
  readonly issWithheld: boolean
  readonly municipalTaxationCode: string
  readonly municipalityIbgeCode: string
  readonly municipalityName: string
  readonly name: string
  readonly nbsCode: string
  readonly observations: string
  readonly serviceListItem: string
  readonly taker: NfseTaker
}

export type NfseEmissionProfileDetail = NfseEmissionProfileSettings & {
  readonly companyId: string
  readonly createdAt: string
  readonly id: string
  readonly status: NfseEmissionProfileStatus
  readonly updatedAt: string
  readonly version: string
}

/**
 * A projeção que o diálogo de emissão enxerga. Quem emite escolhe o perfil e escreve a descrição;
 * alíquota, CNAE, item da lista e tomador são configuração da empresa e não atravessam por aqui.
 */
export type NfseEmissionProfileOption = {
  readonly descriptionTemplate: string
  readonly id: string
  readonly name: string
}

export type NfseEmissionProfileFilters = {
  readonly nameContains?: string | undefined
  readonly statusEq?: NfseEmissionProfileStatus | undefined
}

export type NfseEmissionProfilePage = {
  readonly items: readonly NfseEmissionProfileDetail[]
  readonly nextCursor: string | null
}

/**
 * A credencial sai daqui sem nenhum segredo: só o que a tela precisa para dizer se está
 * configurada. O token vive selado em `secret_envelope` e não é projetado em lugar nenhum.
 */
export type NfseProviderCredentialSummary = {
  readonly apiTokenConfigured: boolean
  readonly callbackTokenConfigured: boolean
  readonly createdAt: string
  readonly fiscalEnvironment: NfseFiscalEnvironment
  readonly id: string
  readonly municipalRegistration: string
  readonly provider: NfseProvider
  readonly status: NfseCredentialStatus
  readonly taxId: string
  readonly updatedAt: string
  readonly version: string
}

export type NfseProviderCredentialRecord = {
  readonly callbackTokenSha256: string
  readonly id: string
  readonly secretEnvelope: SecretEnvelopeV1
  readonly version: string
}

export type NfseProfileAuditEntry = {
  readonly action: string
  readonly after: Record<string, unknown> | null
  readonly before: Record<string, unknown> | null
  readonly companyId: string
  readonly correlationId: string
  readonly targetId: string
  readonly targetType: string
  readonly userId: string
}

export type NfseProfileTransactionPort = {
  appendAudit(input: NfseProfileAuditEntry): Promise<void>
  findCredential(input: {
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
  }): Promise<NfseProviderCredentialRecord | null>
  findCredentialSummary(input: {
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
  }): Promise<NfseProviderCredentialSummary | null>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{
    readonly fingerprint: string
    readonly response: NfseEmissionProfileDetail
  } | null>
  findProfile(input: {
    readonly companyId: string
    readonly profileId: string
  }): Promise<NfseEmissionProfileDetail | null>
  insertProfile(input: {
    readonly companyId: string
    readonly profileId: string
    readonly settings: NfseEmissionProfileSettings
    readonly userId: string
  }): Promise<NfseEmissionProfileDetail>
  listActiveProfileOptions(input: {
    readonly companyId: string
  }): Promise<readonly NfseEmissionProfileOption[]>
  listProfiles(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: NfseEmissionProfileFilters | undefined
    readonly limit: number
  }): Promise<NfseEmissionProfilePage>
  saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: NfseEmissionProfileDetail
  }): Promise<void>
  updateProfile(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly profileId: string
    readonly settings: NfseEmissionProfileSettings
  }): Promise<NfseEmissionProfileDetail | null>
  updateProfileStatus(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly profileId: string
    readonly status: NfseEmissionProfileStatus
  }): Promise<NfseEmissionProfileDetail | null>
  upsertCredential(input: {
    readonly callbackTokenSha256: string
    readonly companyId: string
    readonly credentialId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
    readonly municipalRegistration: string
    readonly provider: NfseProvider
    readonly secretEnvelope: SecretEnvelopeV1
    readonly status: NfseCredentialStatus
    readonly taxId: string
  }): Promise<NfseProviderCredentialSummary>
}

export type NfseProfileUnitOfWorkPort = {
  execute<TResponse>(
    operation: (transaction: NfseProfileTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse>
}

export type NfseProfileFingerprintPort = {
  create(input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }): Promise<string>
}

export type NfseProfileCompanyContext = {
  readonly companyId: string
  readonly userId: string
}
