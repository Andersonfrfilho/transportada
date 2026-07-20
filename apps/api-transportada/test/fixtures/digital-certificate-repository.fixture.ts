/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DigitalCertificateAuditRecord,
  DigitalCertificateIdempotencyRecord,
  DigitalCertificateRepositoryPort,
  DigitalCertificateTransactionPort,
  RotateDigitalCertificateInput,
} from './digital-certificate-port.fixture'
import {
  COMPANY_CNPJ,
  COMPANY_ID,
  expectedResult,
  type PersistedCertificate,
  syntheticEnvelope,
} from './digital-certificate-application.fixture'

type FailurePoint = 'audit' | 'idempotency' | 'replace'

export class DigitalCertificateRepositoryFixture implements DigitalCertificateRepositoryPort {
  public readonly audits: DigitalCertificateAuditRecord[] = []
  public readonly certificates: PersistedCertificate[] = []
  public readonly idempotencyRecords: DigitalCertificateIdempotencyRecord[] = []
  public readonly lookupCompanyIds: string[] = []
  public readonly lockCompanyIds: string[] = []
  public readonly replaceInputs: RotateDigitalCertificateInput[] = []
  public failure: FailurePoint | undefined
  private transactionTail: Promise<void> = Promise.resolve()

  public async execute<TResult>(
    operation: (transaction: DigitalCertificateTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    const previous = this.transactionTail
    let release = (): void => undefined
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    const snapshot = this.createSnapshot()
    try {
      return await operation(this.createTransaction())
    } catch (error) {
      this.restore({ snapshot })
      throw error
    } finally {
      release()
    }
  }

  public async findCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null> {
    this.lookupCompanyIds.push(input.companyId)
    return input.companyId === COMPANY_ID ? { cnpj: COMPANY_CNPJ } : null
  }

  public async findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<DigitalCertificateIdempotencyRecord | null> {
    return this.findStoredIdempotency(input)
  }

  public seedActive(): void {
    this.certificates.push({
      ...expectedResult(),
      companyId: COMPANY_ID,
      fingerprint: 'existing-fingerprint',
      secretEnvelope: syntheticEnvelope('existing'),
      validatedCnpj: COMPANY_CNPJ,
    })
  }

  private createTransaction(): DigitalCertificateTransactionPort {
    return {
      appendAudit: async (record) => this.appendAudit(record),
      findIdempotency: async (input) => this.findStoredIdempotency(input),
      lockCompanyProfile: async (input) => this.lockCompanyProfile(input),
      replaceCertificate: async (input) => this.replaceCertificate(input),
      saveIdempotency: async (record) => this.saveIdempotency(record),
    }
  }

  private async appendAudit(record: DigitalCertificateAuditRecord): Promise<void> {
    if (this.failure === 'audit') throw new Error('audit persistence unavailable')
    this.audits.push(structuredClone(record))
  }

  private async lockCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null> {
    this.lockCompanyIds.push(input.companyId)
    return input.companyId === COMPANY_ID ? { cnpj: COMPANY_CNPJ } : null
  }

  private async replaceCertificate(
    input: RotateDigitalCertificateInput,
  ): Promise<
    ReturnType<DigitalCertificateTransactionPort['replaceCertificate']> extends Promise<
      infer TResult
    >
      ? TResult
      : never
  > {
    if (this.failure === 'replace') throw new Error('certificate persistence unavailable')
    this.replaceInputs.push(structuredClone(input))
    const active = this.certificates.find(
      (certificate) =>
        certificate.companyId === input.companyId &&
        certificate.purpose === input.purpose &&
        certificate.status === 'active',
    )
    if (active) {
      Object.assign(active, { secretEnvelope: null, status: 'retired' as const })
    }
    const version =
      this.certificates
        .filter((certificate) => certificate.companyId === input.companyId)
        .reduce(
          (latest, certificate) => (certificate.version > latest ? certificate.version : latest),
          0n,
        ) + 1n
    const result = expectedResult({ id: input.certificateId, version })
    this.certificates.push({
      ...result,
      companyId: input.companyId,
      fingerprint: input.fingerprint,
      secretEnvelope: input.secretEnvelope,
      validatedCnpj: input.validatedCnpj,
    })
    return { previous: active ? safeResult(active) : null, result }
  }

  private async saveIdempotency(record: DigitalCertificateIdempotencyRecord): Promise<void> {
    if (this.failure === 'idempotency') throw new Error('idempotency persistence unavailable')
    this.idempotencyRecords.push(structuredClone(record))
  }

  private findStoredIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): DigitalCertificateIdempotencyRecord | null {
    return (
      this.idempotencyRecords.find(
        (record) =>
          record.companyId === input.companyId &&
          record.idempotencyKey === input.idempotencyKey &&
          record.operation === input.operation,
      ) ?? null
    )
  }

  private createSnapshot(): {
    readonly audits: DigitalCertificateAuditRecord[]
    readonly certificates: PersistedCertificate[]
    readonly idempotencyRecords: DigitalCertificateIdempotencyRecord[]
    readonly replaceInputs: RotateDigitalCertificateInput[]
  } {
    return structuredClone({
      audits: this.audits,
      certificates: this.certificates,
      idempotencyRecords: this.idempotencyRecords,
      replaceInputs: this.replaceInputs,
    })
  }

  private restore(input: {
    readonly snapshot: ReturnType<DigitalCertificateRepositoryFixture['createSnapshot']>
  }): void {
    replaceContents({ target: this.audits, values: input.snapshot.audits })
    replaceContents({ target: this.certificates, values: input.snapshot.certificates })
    replaceContents({
      target: this.idempotencyRecords,
      values: input.snapshot.idempotencyRecords,
    })
    replaceContents({ target: this.replaceInputs, values: input.snapshot.replaceInputs })
  }
}

function safeResult(certificate: PersistedCertificate) {
  const { expiresAt, id, purpose, validFrom, version } = certificate
  return { expiresAt, id, purpose, status: 'active' as const, validFrom, version }
}

function replaceContents<TValue>(input: {
  readonly target: TValue[]
  readonly values: readonly TValue[]
}): void {
  input.target.splice(0, input.target.length, ...structuredClone(input.values))
}
