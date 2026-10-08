/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseFiscalEnvironment } from '../../database/nfse-issuance-execution.schema.js'
import type { NfseExternalLinkFacts } from '../domain/nfse-reconciliation-outcome.policy.js'
import type { NfseProviderApiVersion } from '../../nfse-issuance/domain/nfse-provider-api-version.policy.js'

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
  readonly taxId: string
}

/**
 * O recorte bruto do banco. Campos opcionais existem porque a nota pode estar em qualquer estágio:
 * quem decide se ela é reconciliável é a política, com vocabulário fechado de razão.
 */
export type NfseReconciliationCandidate = {
  readonly attemptId?: string
  readonly companyId: string
  readonly credential?: NfseReconciliationCredential
  /** Presente quando a última emissão é um vínculo; leva o valor congelado a conferir no portal. */
  readonly externalLink?: NfseExternalLinkFacts
  readonly invoiceId: string
  readonly nextStatusCheckAt?: Date
  /** Versão da última emissão da nota; a consulta e os documentos falam a mesma API. */
  readonly providerApiVersion: NfseProviderApiVersion
  readonly providerDocumentId?: string
  readonly status: NfseReconciliationInvoiceStatus
}

export type NfseReconciliationCandidateSourcePort = {
  listCandidates(input: {
    readonly environment: NfseFiscalEnvironment
    readonly limit: number
  }): Promise<readonly NfseReconciliationCandidate[]>
}
