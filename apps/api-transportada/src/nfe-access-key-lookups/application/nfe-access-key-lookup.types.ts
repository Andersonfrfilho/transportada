/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  NfeAccessKeyLookupReason,
  NfeAccessKeyLookupStatus,
} from '../../database/nfe.schema.js'
import type {
  IdempotencyFingerprintPort,
  NfeFiscalEnvironment,
} from '../../nfe-imports/application/nfe-import.types.js'

export type { IdempotencyFingerprintPort, NfeFiscalEnvironment }

export type AccessKeyLookupView = {
  readonly documentId: string | null
  readonly id: string
  readonly notBefore: string | null
  readonly reason: NfeAccessKeyLookupReason | null
  readonly status: NfeAccessKeyLookupStatus
}

export type AccessKeyLookupLocator = {
  readonly accessKey: string
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
}

export type RequestAccessKeyLookupParams = {
  readonly accessKey: string
  readonly context: CompanyContext
  readonly correlationId: string
}

export type RequestAccessKeyLookupResult =
  | {
      readonly kind: 'created'
      readonly lookup: { readonly id: string; readonly status: 'queued' }
    }
  | { readonly kind: 'existing'; readonly lookup: AccessKeyLookupView }
  | { readonly kind: 'found'; readonly documentId: string }

export type GetAccessKeyLookupParams = {
  readonly context: CompanyContext
  readonly lookupId: string
}

export type ClaimAccessKeyLookupParams = AccessKeyLookupLocator & {
  readonly correlationId: string
  readonly requestedByUserId: string
}

export type CreateLookupImportParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly requestFingerprint: string
  readonly requestedByUserId: string
}

export type AttachLookupImportParams = {
  readonly companyId: string
  readonly importId: string
  readonly lookupId: string
}

export type AccessKeyLookupOutboxParams = {
  readonly actorUserId: string
  readonly aggregateId: string
  readonly aggregateType: 'nfe_import'
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: 'transportada.nfe.access-key.requested'
  readonly eventVersion: 1
  readonly payload: {
    readonly companyId: string
    readonly importId: string
    readonly lookupId: string
  }
}

export type RequestAccessKeyLookupTransactionPort = {
  attachImport(input: AttachLookupImportParams): Promise<void>
  /** `null` quando já existe busca ativa para a chave: quem perdeu a corrida lê a vencedora. */
  claimLookup(input: ClaimAccessKeyLookupParams): Promise<string | null>
  createImport(input: CreateLookupImportParams): Promise<string>
  findActiveLookup(input: AccessKeyLookupLocator): Promise<AccessKeyLookupView | null>
  findDocumentId(input: {
    readonly accessKey: string
    readonly companyId: string
  }): Promise<string | null>
  findRecentRefusal(
    input: AccessKeyLookupLocator & { readonly finishedAfter: Date },
  ): Promise<AccessKeyLookupView | null>
  readFiscalEnvironment(input: { readonly companyId: string }): Promise<NfeFiscalEnvironment | null>
  saveOutbox(input: AccessKeyLookupOutboxParams): Promise<void>
}

export type RequestAccessKeyLookupUnitOfWorkPort = {
  execute<TResult>(
    operation: (transaction: RequestAccessKeyLookupTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}

export type AccessKeyLookupReaderPort = {
  findById(input: {
    readonly companyId: string
    readonly lookupId: string
  }): Promise<AccessKeyLookupView | null>
}

export type AccessKeyLookupClockPort = { now(): Date }
