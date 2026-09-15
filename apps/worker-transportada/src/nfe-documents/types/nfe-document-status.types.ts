/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeXmlEvent } from '@adatechnology/fiscal-provider'

import type {
  NfeDocumentStatus,
  NfeDocumentStatusChangeCause,
  NfeEventOrigin,
  NfeFiscalEnvironment,
  NfeImportSource,
} from '../../database/nfe.schema.js'
import type { NfeDocumentStatusNotAppliedReason } from '../domain/nfe-document-status-transition.policy.js'
import type { NfeWriteTransaction } from './nfe-write-transaction.types.js'

export type NfeStatusProvenance = {
  readonly actorUserId: string | null
  readonly importId: string
  readonly origin: NfeEventOrigin
  readonly requestedByUserId: string | null
}

export type NfeStatusChangeRecord = {
  readonly cause: NfeDocumentStatusChangeCause
  readonly documentId: string
  readonly from: NfeDocumentStatus
  readonly to: NfeDocumentStatus
}

export type NfeStatusWarning =
  | {
      readonly code: 'nfe_event_status_not_applied'
      readonly eventId: string
      readonly eventType: string
      readonly reason: NfeDocumentStatusNotAppliedReason
    }
  | {
      readonly code: 'nfe_summary_status_inconsistent'
      readonly documentId: string
      readonly situation: string
    }

export type NfeStatusWriteResult = {
  readonly change: NfeStatusChangeRecord | null
  readonly warning: NfeStatusWarning | null
}

/** O trilho da distribuição conta evento novo × repetido; o resultado do status não diz isso. */
export type NfeEventWriteResult = NfeStatusWriteResult & { readonly inserted: boolean }

export type NfeDocumentStatusLogger = {
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
}

export type ResolveNfeEventOriginParams = {
  readonly importId: string
  readonly requestedByUserId: string
  readonly source: NfeImportSource
}

type KeyScopedParams = {
  readonly accessKey: string
  readonly companyId: string
  readonly tx: NfeWriteTransaction
}

export type LockAccessKeyParams = KeyScopedParams
export type ReadDocumentStatusParams = KeyScopedParams
export type FindPendingStatusFromEventsParams = KeyScopedParams

export type ReadDocumentStatusResult = {
  readonly documentId: string
  readonly status: NfeDocumentStatus
} | null

export type FindPendingStatusFromEventsResult = {
  readonly eventId: string
  readonly to: NfeDocumentStatus
} | null

export type ApplyStatusChangeParams = {
  readonly companyId: string
  readonly documentId: string
  readonly to: NfeDocumentStatus
  readonly tx: NfeWriteTransaction
}

/** Texto do `timestamptz` como o Postgres o devolve: `Date` truncaria os microssegundos. */
export type DatabaseTimestamp = string

export type ApplyStatusChangeResult =
  | { readonly changed: false }
  | { readonly changed: true; readonly changedAt: DatabaseTimestamp }

export type RecordStatusChangeParams = {
  readonly change: NfeStatusChangeRecord
  readonly changedAt: DatabaseTimestamp
  readonly companyId: string
  readonly eventId: string | null
  readonly provenance: NfeStatusProvenance
  readonly tx: NfeWriteTransaction
}

export type WriteEventWithStatusParams = {
  readonly companyId: string
  readonly environment?: NfeFiscalEnvironment
  readonly event: NfeXmlEvent
  readonly provenance: NfeStatusProvenance
  readonly sourceNsu?: string
  readonly tx: NfeWriteTransaction
  readonly xmlObjectId: string
}

export type ResolveInitialDocumentStatusParams = KeyScopedParams & {
  readonly xmlStatus: NfeDocumentStatus
}

export type ResolveInitialDocumentStatusResult = {
  readonly pendingEventId: string | null
  readonly status: NfeDocumentStatus
}

export type RecordDocumentInsertChangeParams = {
  readonly companyId: string
  readonly createdAt: DatabaseTimestamp
  readonly documentId: string
  readonly pendingEventId: string | null
  readonly provenance: NfeStatusProvenance
  readonly status: NfeDocumentStatus
  readonly tx: NfeWriteTransaction
  readonly xmlStatus: NfeDocumentStatus
}

export type ApplySummaryStatusParams = KeyScopedParams & {
  readonly provenance: NfeStatusProvenance
  readonly situation: string
}

export type LogNfeStatusWriteResultParams = {
  readonly companyId: string
  readonly logger: NfeDocumentStatusLogger
  readonly result: NfeStatusWriteResult | null
}
