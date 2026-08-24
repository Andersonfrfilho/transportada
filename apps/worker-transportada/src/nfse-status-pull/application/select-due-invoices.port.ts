/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseFiscalEnvironment } from '../../database/nfse-issuance-execution.schema.js'

export type NfseReconciliationInvoiceStatus =
  | 'authorized'
  | 'cancellation_requested'
  | 'cancelled'
  | 'draft'
  | 'pending_authorization'
  | 'rejected'

export type NfseReconciliationCredential = {
  readonly credentialId: string
  readonly envelope: unknown
  readonly fiscalEnvironment: NfseFiscalEnvironment
  readonly municipalRegistration: string
  readonly status: 'active' | 'inactive'
}

/**
 * O recorte bruto do banco. Campos opcionais existem porque a nota pode estar em qualquer estágio:
 * quem decide se ela é reconciliável é a política, com vocabulário fechado de razão.
 */
export type NfseReconciliationCandidate = {
  readonly attemptId?: string
  readonly companyId: string
  readonly credential?: NfseReconciliationCredential
  readonly invoiceId: string
  readonly nextStatusCheckAt?: Date
  readonly providerDocumentId?: string
  readonly status: NfseReconciliationInvoiceStatus
}

export type NfseReconciliationCandidateSourcePort = {
  listCandidates(input: {
    readonly environment: NfseFiscalEnvironment
    readonly limit: number
  }): Promise<readonly NfseReconciliationCandidate[]>
}
