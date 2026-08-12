/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CronFiscalEnvironment } from '../../config/cron.constant.js'
import type {
  NfseProviderStatusFacts,
  NfseStatusFailureCause,
} from '../domain/nfse-reconciliation-outcome.policy.js'

export type NfseDocumentKind = 'pdf' | 'xml'

/** O envelope segue selado até a borda: quem abre é o gateway, na chamada, e nunca a aplicação. */
export type NfseCredentialAccess = {
  readonly companyId: string
  readonly credentialId: string
  readonly envelope: unknown
  readonly fiscalEnvironment: CronFiscalEnvironment
}

export type NfseDocumentFetchFacts =
  | { readonly bytes: Uint8Array; readonly contentType: string; readonly status: 'ok' }
  | { readonly cause: NfseStatusFailureCause; readonly status: 'error' }

export type NfseStatusPort = {
  fetchDocument(input: {
    readonly credential: NfseCredentialAccess
    readonly kind: NfseDocumentKind
    readonly providerDocumentId: string
  }): Promise<NfseDocumentFetchFacts>
  fetchStatus(input: {
    readonly credential: NfseCredentialAccess
    readonly providerDocumentId: string
  }): Promise<NfseProviderStatusFacts>
}
