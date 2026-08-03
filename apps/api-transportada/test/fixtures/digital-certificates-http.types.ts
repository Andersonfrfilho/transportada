/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CertificatePurpose } from '../../src/database/digital-certificate.schema'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'

export type CertificateCursor = {
  readonly createdAt: Date
  readonly id: string
}

export type CertificateMetadata = {
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly id: string
  readonly purpose: CertificatePurpose
  readonly status: 'active' | 'retired'
  readonly validFrom: Date
  readonly version: bigint
}

export type ListCertificatesCall = {
  readonly context: CompanyContext
  readonly cursor?: CertificateCursor
  readonly limit: number
}

export type ListCertificatesResult = {
  readonly items: readonly CertificateMetadata[]
  readonly nextCursor?: CertificateCursor
}

export type ReplaceCertificateCall = {
  readonly certificate: Uint8Array
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly password: Uint8Array
  readonly purpose: CertificatePurpose
}

export type RetireCertificateCall = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly purpose: CertificatePurpose
}

export type ReplaceCertificateResult = {
  readonly certificate: CertificateMetadata
  readonly replayed: boolean
}

export type RouteDependencies = {
  readonly listCertificates: {
    execute(input: ListCertificatesCall): Promise<ListCertificatesResult>
  }
  readonly replaceCertificate: {
    execute(input: ReplaceCertificateCall): Promise<ReplaceCertificateResult>
  }
  readonly retireCertificate: {
    execute(input: RetireCertificateCall): Promise<CertificateMetadata | null>
  }
}
