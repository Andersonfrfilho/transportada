/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseCancellationMotive } from '../../database/nfse-issuance-execution.schema.js'
import type {
  NotaRpCancelOutcome,
  NotaRpCause,
  NotaRpDocumentKind,
  NotaRpDocumentOutcome,
  NotaRpFetch,
  NotaRpIssueOutcome,
  NotaRpRejection,
  NotaRpStatusOutcome,
} from './nota-rp-v2.client.js'

export type NotaRpV3Config = {
  readonly baseUrl: string
  readonly callbackBaseUrl: string
  /** Viaja dentro de `flags.webhook_url`; só é usado para ser redigido das mensagens. */
  readonly callbackToken: string
  readonly municipalRegistration: string
  readonly taxId: string
  readonly timeoutMilliseconds: number
  readonly token: string
}

export type NotaRpV3Dependencies = {
  readonly clock: () => Date
  readonly config: NotaRpV3Config
  readonly fetch: NotaRpFetch
}

export type NotaRpV3IssueParams = {
  readonly payload: Readonly<Record<string, unknown>>
  readonly providerDocumentId?: string
  readonly providerRequestKey: string
}

export type NotaRpV3CancelParams = {
  readonly cancellationMotive: NfseCancellationMotive
  readonly providerDocumentId: string
}

export type NotaRpV3DocumentParams = {
  readonly kind: NotaRpDocumentKind
  readonly providerDocumentId: string
}

export type NotaRpV3StatusParams = { readonly providerDocumentId: string }

export type NotaRpV3Client = {
  cancel(params: NotaRpV3CancelParams): Promise<NotaRpCancelOutcome>
  fetchDocument(params: NotaRpV3DocumentParams): Promise<NotaRpDocumentOutcome>
  fetchStatus(params: NotaRpV3StatusParams): Promise<NotaRpStatusOutcome>
  issue(params: NotaRpV3IssueParams): Promise<NotaRpIssueOutcome>
}

export type NotaRpV3Redact = (value: string) => string

export type NotaRpV3TransportResult =
  | { readonly cause: NotaRpCause; readonly kind: 'error' }
  | { readonly kind: 'http'; readonly response: Response }
  | { readonly kind: 'response'; readonly response: Response }

export type NotaRpV3EnvelopeOutcome =
  | { readonly cause: NotaRpCause; readonly kind: 'error' }
  | { readonly data: Readonly<Record<string, unknown>>; readonly kind: 'data' }
  | { readonly kind: 'rejected'; readonly rejection: NotaRpRejection }

export type NotaRpV3RequestParams = {
  readonly accept: string
  readonly body?: Readonly<Record<string, unknown>>
  readonly method: 'GET' | 'POST'
  readonly path: string
  readonly query?: Readonly<Record<string, string>>
}
