/* Copyright (c) 2026 Ada Technology. MIT License. */
export const OPERATIONS_READ = 'operations.read'
export const AUDIT_READ = 'audit.read'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR = '2026-07-23T15:01:00.000Z::00000000-0000-4000-8000-000000000011'
export const TARGET_ID = '00000000-0000-4000-8000-000000000010'

export type OperationsPageContract<TEntity> = Readonly<{
  items: readonly TEntity[]
  nextCursor: null | string
}>

export type OperationsSummaryContract = Readonly<{
  generatedAt: string
  modules: readonly Readonly<{
    failed: number
    module: string
    pending: number
    processing: number
    retryScheduled: number
    succeeded: number
  }>[]
  recentErrors: readonly Readonly<{
    code: string
    correlationId: string
    message: string
    module: string
    occurredAt: string
  }>[]
}>

export type OperationsTimelineEventContract = Readonly<{
  action: string
  correlationId: string
  entityId: string
  entityType: string
  metadata: Readonly<Record<string, string>>
  occurredAt: string
  result: 'allowed' | 'denied' | 'failed'
}>

export type OperationsJobContract = Readonly<{
  attemptCount: number
  correlationId: string
  entityId: string
  entityType: string
  id: string
  lastErrorCode: string
  lastErrorMessage: string
  module: string
  nextAttemptAt: null | string
  status: 'dead_letter' | 'retry_scheduled'
  updatedAt: string
}>

export type AuditEventContract = Readonly<{
  action: string
  actorUserId: string
  correlationId: string
  createdAt: string
  id: string
  metadata: Readonly<Record<string, string>>
  permission: string
  reason: string
  result: 'allowed' | 'denied' | 'failed'
  targetId: string
  targetType: string
}>

export const OPERATIONS_SUMMARY = {
  generatedAt: '2026-07-23T15:00:00.000Z',
  modules: [
    {
      failed: 1,
      module: 'nfe',
      pending: 2,
      processing: 0,
      retryScheduled: 1,
      succeeded: 14,
    },
  ],
  recentErrors: [
    {
      code: 'SEFAZ_TIMEOUT',
      correlationId: 'correlation-operations-001',
      message: 'Timeout sanitized',
      module: 'cte_issuance',
      occurredAt: '2026-07-23T14:58:00.000Z',
    },
  ],
} as const satisfies OperationsSummaryContract

export const OPERATIONS_TIMELINE = {
  items: [
    {
      action: 'nfe_import_requested',
      correlationId: 'correlation-operations-001',
      entityId: TARGET_ID,
      entityType: 'nfe_import',
      metadata: { accessKeySuffix: '0010' },
      occurredAt: '2026-07-23T14:50:00.000Z',
      result: 'allowed',
    },
  ],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies OperationsPageContract<OperationsTimelineEventContract>

export const OPERATIONS_JOBS = {
  items: [
    {
      attemptCount: 3,
      correlationId: 'correlation-operations-001',
      entityId: TARGET_ID,
      entityType: 'cte_issuance',
      id: 'processing-job-001',
      lastErrorCode: 'TECHNICAL_TIMEOUT',
      lastErrorMessage: 'Provider timeout sanitized',
      module: 'cte_issuance',
      nextAttemptAt: '2026-07-23T15:05:00.000Z',
      status: 'retry_scheduled',
      updatedAt: '2026-07-23T15:00:00.000Z',
    },
  ],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies OperationsPageContract<OperationsJobContract>

export const AUDIT_EVENTS = {
  items: [
    {
      action: 'billing.invoice.cancel',
      actorUserId: 'user-001',
      correlationId: 'correlation-operations-001',
      createdAt: '2026-07-23T15:00:00.000Z',
      id: 'audit-log-001',
      metadata: {},
      permission: 'billing.manage',
      reason: 'Duplicidade operacional',
      result: 'allowed',
      targetId: TARGET_ID,
      targetType: 'billing_invoice',
    },
  ],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies OperationsPageContract<AuditEventContract>

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
