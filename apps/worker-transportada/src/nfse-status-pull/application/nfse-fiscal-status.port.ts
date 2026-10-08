/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseFiscalEnvironment } from '../../database/nfse-issuance-execution.schema.js'
import type { NfseProviderApiVersion } from '../../nfse-issuance/domain/nfse-provider-api-version.policy.js'
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
  readonly fiscalEnvironment: NfseFiscalEnvironment
  /** Vai no `X-AUTH-IM`. Não é segredo — o segredo é o token, e ele continua selado. */
  readonly municipalRegistration: string
  /** CNPJ em claro (`X-Auth-CNPJ` da v3). Não é segredo — o segredo é o token. */
  readonly taxId: string
}

export type NfseDocumentFetchFacts =
  | { readonly bytes: Uint8Array; readonly contentType: string; readonly status: 'ok' }
  | { readonly cause: NfseStatusFailureCause; readonly status: 'error' }

export type NfseStatusPort = {
  fetchDocument(input: {
    readonly credential: NfseCredentialAccess
    readonly kind: NfseDocumentKind
    readonly providerApiVersion: NfseProviderApiVersion
    readonly providerDocumentId: string
  }): Promise<NfseDocumentFetchFacts>
  fetchStatus(input: {
    readonly credential: NfseCredentialAccess
    readonly providerApiVersion: NfseProviderApiVersion
    readonly providerDocumentId: string
  }): Promise<NfseProviderStatusFacts>
}
