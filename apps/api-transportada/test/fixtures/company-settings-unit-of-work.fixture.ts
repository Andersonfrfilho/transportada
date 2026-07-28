/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  COMPANY_ID,
  EXPECTED_SETTINGS_RESULT,
  type CompanySettings,
} from './company-settings-application.fixture'

export type SafeCompanySettingsResult = typeof EXPECTED_SETTINGS_RESULT

export type FingerprintInput = {
  readonly fields: readonly Uint8Array[]
  readonly operation: string
}

export type IdempotencyFingerprintPort = {
  create(input: FingerprintInput): Promise<string>
}

type IdempotencyRecord = {
  readonly companyId: string
  readonly fingerprint: string
  readonly idempotencyKey: string
  readonly operation: string
  readonly response: SafeCompanySettingsResult
}

type AuditRecord = {
  readonly action: string
  readonly actorUserId: string
  readonly afterSnapshot: Readonly<Record<string, unknown>>
  readonly beforeSnapshot: Readonly<Record<string, unknown>> | null
  readonly companyId: string
  readonly correlationId: string
  readonly entityId: string
  readonly entityType: string
}

type SaveSettingsInput = {
  readonly companyId: string
  readonly settings: CompanySettings
}

export type CompanySettingsTransactionPort = {
  appendAudit(record: AuditRecord): Promise<void>
  findActiveCertificateCnpj(input: { readonly companyId: string }): Promise<string | null>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<IdempotencyRecord | null>
  saveIdempotency(record: IdempotencyRecord): Promise<void>
  saveSettings(input: SaveSettingsInput): Promise<SafeCompanySettingsResult>
}

export type CompanySettingsUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: CompanySettingsTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export class CompanySettingsUnitOfWorkFixture implements CompanySettingsUnitOfWorkPort {
  public readonly audits: AuditRecord[] = []
  public readonly idempotencyLookupInputs: Array<{
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }> = []
  public readonly idempotencyRecords: IdempotencyRecord[] = []
  public readonly saveInputs: SaveSettingsInput[] = []
  public auditError: Error | undefined
  public idempotencyError: Error | undefined
  public saveError: Error | undefined
  public activeCertificateCnpj: string | null = null
  public settings: SafeCompanySettingsResult | null = null

  public async execute<TResult>(
    operation: (transaction: CompanySettingsTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    const snapshot = {
      audits: this.audits.length,
      idempotencyLookupInputs: this.idempotencyLookupInputs.length,
      idempotencyRecords: this.idempotencyRecords.length,
      saveInputs: this.saveInputs.length,
      settings: this.settings,
    }

    try {
      return await operation(this)
    } catch (error) {
      this.audits.length = snapshot.audits
      this.idempotencyLookupInputs.length = snapshot.idempotencyLookupInputs
      this.idempotencyRecords.length = snapshot.idempotencyRecords
      this.saveInputs.length = snapshot.saveInputs
      this.settings = snapshot.settings
      throw error
    }
  }

  public async appendAudit(record: AuditRecord): Promise<void> {
    if (this.auditError) throw this.auditError
    this.audits.push(structuredClone(record))
  }

  public async findActiveCertificateCnpj(): Promise<string | null> {
    return this.activeCertificateCnpj
  }

  public async findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<IdempotencyRecord | null> {
    this.idempotencyLookupInputs.push(structuredClone(input))
    return (
      this.idempotencyRecords.find(
        (record) =>
          record.companyId === input.companyId &&
          record.idempotencyKey === input.idempotencyKey &&
          record.operation === input.operation,
      ) ?? null
    )
  }

  public async saveIdempotency(record: IdempotencyRecord): Promise<void> {
    if (this.idempotencyError) throw this.idempotencyError
    this.idempotencyRecords.push(structuredClone(record))
  }

  public async saveSettings(input: SaveSettingsInput): Promise<SafeCompanySettingsResult> {
    if (this.saveError) throw this.saveError
    this.saveInputs.push(structuredClone(input))
    this.settings = structuredClone(EXPECTED_SETTINGS_RESULT)
    return this.settings
  }
}

export function createFingerprintFixture(): {
  readonly inputs: FingerprintInput[]
  readonly port: IdempotencyFingerprintPort
} {
  const inputs: FingerprintInput[] = []
  return {
    inputs,
    port: {
      async create(input) {
        inputs.push(structuredClone(input))
        const encodedInput = JSON.stringify({
          fields: input.fields.map((field) => Buffer.from(field).toString('base64url')),
          operation: input.operation,
        })
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encodedInput))
        return Buffer.from(digest).toString('base64url')
      },
    },
  }
}

export function expectOnlyAuthenticatedCompany(fixture: CompanySettingsUnitOfWorkFixture): void {
  const scopedRecords = [
    ...fixture.saveInputs,
    ...fixture.idempotencyLookupInputs,
    ...fixture.idempotencyRecords,
    ...fixture.audits,
  ]
  for (const record of scopedRecords) {
    if (record.companyId !== COMPANY_ID) {
      throw new Error('The unauthenticated company reached persistence')
    }
  }
}
