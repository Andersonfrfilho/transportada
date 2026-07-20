/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type FiscalEnvironment = 'homologation' | 'production'
export type TaxRegime = '1' | '2' | '3'

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
  readonly expectedVersion: bigint | null
  readonly profile: CompanyFiscalProfileInput
}

export type CompanySettingsResult = {
  readonly cte: {
    readonly environment: FiscalEnvironment
    readonly nextNumber: bigint
    readonly series: bigint
    readonly version: bigint
  }
  readonly profile: CompanyFiscalProfileInput & {
    readonly version: bigint
  }
}

export type CompanySettingsReaderPort = {
  findByCompanyId(input: { readonly companyId: string }): Promise<CompanySettingsResult | null>
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
