/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteRetryPolicy } from '../../cte-issuance/domain/cte-retry.policy.js'
import type { MdfeInsuranceResponsibility } from '../../database/mdfe.schema.js'

export type FiscalEnvironment = 'homologation' | 'production'
export type TaxRegime = '1' | '2' | '3'

/** Defaults de empresa que o payload do MDF-e usa em infPag (rejeição 580) e seg (rejeição 698). */
export type CompanyMdfeDefaultsInput = {
  readonly bankBranch: string
  readonly bankCode: string
  readonly insurancePolicy: string
  readonly insuranceResponsibility: '' | MdfeInsuranceResponsibility
  readonly insurerName: string
  readonly insurerTaxId: string
  readonly pixKey: string
}

export type CompanyFiscalProfileInput = {
  readonly city: string
  readonly cityIbgeCode: string
  readonly cnpj: string
  readonly complement: string
  readonly district: string
  readonly email: string
  readonly legalName: string
  readonly municipalRegistration: string
  readonly number: string
  readonly phone: string
  readonly postalCode: string
  readonly rntrc: string
  readonly state: string
  readonly stateRegistration: string
  readonly street: string
  readonly taxRegime: TaxRegime
  readonly tradeName: string
}

export type CompanySettingsInput = {
  readonly cte: {
    readonly environment: FiscalEnvironment
    readonly nextNumber: bigint
    readonly series: bigint
  }
  readonly cteRetry: CteRetryPolicy
  readonly expectedVersion: bigint | null
  readonly mdfe: CompanyMdfeDefaultsInput
  readonly profile: CompanyFiscalProfileInput
}

export type CompanySettingsResult = {
  readonly cte: {
    readonly environment: FiscalEnvironment
    readonly nextNumber: bigint
    readonly series: bigint
    readonly version: bigint
  }
  readonly cteRetry: CteRetryPolicy
  readonly mdfe: CompanyMdfeDefaultsInput
  readonly profile: CompanyFiscalProfileInput & {
    readonly version: bigint
  }
}

export type CompanyProfileLookupResult = Readonly<{
  readonly city: string
  readonly cityIbgeCode: string
  readonly cnpj: string
  readonly complement: string
  readonly district: string
  readonly email: string
  readonly legalName: string
  readonly number: string
  readonly phone: string
  readonly postalCode: string
  readonly state: string
  readonly stateRegistration: string
  readonly street: string
  readonly tradeName: string
}>

export type CompanySettingsReaderPort = {
  findByCompanyId(input: { readonly companyId: string }): Promise<CompanySettingsResult | null>
}

export type CompanyProfileLookupPort = {
  lookupByCnpj(input: { readonly cnpj: string }): Promise<CompanyProfileLookupResult | null>
}

export type IdempotencyFingerprintPort = {
  create(input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }): Promise<string>
}

export type CompanySettingsAuditRecord = {
  readonly action: string
  readonly actorUserId: string
  readonly afterSnapshot: Readonly<Record<string, string>>
  readonly beforeSnapshot: Readonly<Record<string, string>> | null
  readonly companyId: string
  readonly correlationId: string
  readonly entityId: string
  readonly entityType: string
}

export type CompanySettingsIdempotencyRecord = {
  readonly companyId: string
  readonly fingerprint: string
  readonly idempotencyKey: string
  readonly operation: string
  readonly response: CompanySettingsResult
}

export type CompanySettingsTransactionPort = {
  appendAudit(record: CompanySettingsAuditRecord): Promise<void>
  findActiveCertificateCnpj(input: { readonly companyId: string }): Promise<string | null>
  findByCompanyId?(input: { readonly companyId: string }): Promise<CompanySettingsResult | null>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<CompanySettingsIdempotencyRecord | null>
  saveIdempotency(record: CompanySettingsIdempotencyRecord): Promise<void>
  saveSettings(input: {
    readonly companyId: string
    readonly settings: CompanySettingsInput
  }): Promise<CompanySettingsResult>
}

export type CompanySettingsUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: CompanySettingsTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
