/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AuditEvent,
  OperationsJob,
  OperationsPage,
  OperationsSummary,
  OperationsTimelineEvent,
} from './operationsClient.service'

const SENSITIVE_KEY_PATTERN =
  /(?:xml|payload|content|storagekey|storage_key|certificate|password|privatekey|private_key|token|companyid|companyId)/i

function validationError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function rejectExtraKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
): void {
  if (
    Object.keys(value).some((key) => !allowedKeys.includes(key) || SENSITIVE_KEY_PATTERN.test(key))
  ) {
    throw validationError(code)
  }
}

function mapStringMap(
  value: unknown,
  code:
    | 'OPERATIONS_INVALID_AUDIT_RESPONSE'
    | 'OPERATIONS_INVALID_JOBS_RESPONSE'
    | 'OPERATIONS_INVALID_SUMMARY_RESPONSE'
    | 'OPERATIONS_INVALID_TIMELINE_RESPONSE',
): Readonly<Record<string, string>> {
  if (!isRecord(value)) throw validationError(code)
  const entries = Object.entries(value)
  if (entries.some(([key, item]) => SENSITIVE_KEY_PATTERN.test(key) || !isString(item))) {
    throw validationError(code)
  }
  const mapped: Record<string, string> = {}
  for (const [key, item] of entries) {
    if (!isString(item)) {
      throw validationError(code)
    }
    mapped[key] = item
  }
  return Object.freeze(mapped)
}

export function createOperationsResponseAdapters() {
  return {
    auditPageFromApi(input: unknown): OperationsPage<AuditEvent> {
      return mapPage(input, mapAuditEvent, 'OPERATIONS_INVALID_AUDIT_RESPONSE')
    },
    jobsPageFromApi(input: unknown): OperationsPage<OperationsJob> {
      return mapPage(input, mapJob, 'OPERATIONS_INVALID_JOBS_RESPONSE')
    },
    summaryFromApi(input: unknown): OperationsSummary {
      if (!isRecord(input) || !isRecord(input.data)) {
        throw validationError('OPERATIONS_INVALID_SUMMARY_RESPONSE')
      }
      return mapSummary(input.data)
    },
    timelinePageFromApi(input: unknown): OperationsPage<OperationsTimelineEvent> {
      return mapPage(input, mapTimelineEvent, 'OPERATIONS_INVALID_TIMELINE_RESPONSE')
    },
  }
}

function mapPage<TEntity>(
  input: unknown,
  mapper: (item: unknown) => TEntity,
  code:
    | 'OPERATIONS_INVALID_AUDIT_RESPONSE'
    | 'OPERATIONS_INVALID_JOBS_RESPONSE'
    | 'OPERATIONS_INVALID_TIMELINE_RESPONSE',
): OperationsPage<TEntity> {
  if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) {
    throw validationError(code)
  }
  const nextCursor = input.page.nextCursor
  if (nextCursor !== null && !isString(nextCursor)) {
    throw validationError(code)
  }
  return {
    items: input.data.map(mapper),
    nextCursor,
  }
}

function mapSummary(input: unknown): OperationsSummary {
  if (!isRecord(input)) throw validationError('OPERATIONS_INVALID_SUMMARY_RESPONSE')
  rejectExtraKeys(
    input,
    ['generatedAt', 'modules', 'recentErrors'],
    'OPERATIONS_INVALID_SUMMARY_RESPONSE',
  )
  if (
    !isString(input.generatedAt) ||
    !Array.isArray(input.modules) ||
    !Array.isArray(input.recentErrors)
  ) {
    throw validationError('OPERATIONS_INVALID_SUMMARY_RESPONSE')
  }
  return {
    generatedAt: input.generatedAt,
    modules: input.modules.map(mapModuleSummary),
    recentErrors: input.recentErrors.map(mapRecentError),
  }
}

function mapModuleSummary(input: unknown): OperationsSummary['modules'][number] {
  if (!isRecord(input)) throw validationError('OPERATIONS_INVALID_SUMMARY_RESPONSE')
  rejectExtraKeys(
    input,
    ['failed', 'module', 'pending', 'processing', 'retryScheduled', 'succeeded'],
    'OPERATIONS_INVALID_SUMMARY_RESPONSE',
  )
  if (
    !isNumber(input.failed) ||
    !isString(input.module) ||
    !isNumber(input.pending) ||
    !isNumber(input.processing) ||
    !isNumber(input.retryScheduled) ||
    !isNumber(input.succeeded)
  ) {
    throw validationError('OPERATIONS_INVALID_SUMMARY_RESPONSE')
  }
  return {
    failed: input.failed,
    module: input.module,
    pending: input.pending,
    processing: input.processing,
    retryScheduled: input.retryScheduled,
    succeeded: input.succeeded,
  }
}

function mapRecentError(input: unknown): OperationsSummary['recentErrors'][number] {
  if (!isRecord(input)) throw validationError('OPERATIONS_INVALID_SUMMARY_RESPONSE')
  rejectExtraKeys(
    input,
    ['code', 'correlationId', 'message', 'module', 'occurredAt'],
    'OPERATIONS_INVALID_SUMMARY_RESPONSE',
  )
  if (
    !isString(input.code) ||
    !isString(input.correlationId) ||
    !isString(input.message) ||
    !isString(input.module) ||
    !isString(input.occurredAt)
  ) {
    throw validationError('OPERATIONS_INVALID_SUMMARY_RESPONSE')
  }
  return {
    code: input.code,
    correlationId: input.correlationId,
    message: input.message,
    module: input.module,
    occurredAt: input.occurredAt,
  }
}

function mapTimelineEvent(input: unknown): OperationsTimelineEvent {
  if (!isRecord(input)) throw validationError('OPERATIONS_INVALID_TIMELINE_RESPONSE')
  rejectExtraKeys(
    input,
    ['action', 'correlationId', 'entityId', 'entityType', 'metadata', 'occurredAt', 'result'],
    'OPERATIONS_INVALID_TIMELINE_RESPONSE',
  )
  if (
    !isString(input.action) ||
    !isString(input.correlationId) ||
    !isString(input.entityId) ||
    !isString(input.entityType) ||
    !isString(input.occurredAt) ||
    !['allowed', 'denied', 'failed'].includes(String(input.result))
  ) {
    throw validationError('OPERATIONS_INVALID_TIMELINE_RESPONSE')
  }
  return {
    action: input.action,
    correlationId: input.correlationId,
    entityId: input.entityId,
    entityType: input.entityType,
    metadata: mapStringMap(input.metadata, 'OPERATIONS_INVALID_TIMELINE_RESPONSE'),
    occurredAt: input.occurredAt,
    result: input.result as OperationsTimelineEvent['result'],
  }
}

function mapJob(input: unknown): OperationsJob {
  if (!isRecord(input)) throw validationError('OPERATIONS_INVALID_JOBS_RESPONSE')
  rejectExtraKeys(
    input,
    [
      'attemptCount',
      'correlationId',
      'entityId',
      'entityType',
      'id',
      'lastErrorCode',
      'lastErrorMessage',
      'metadata',
      'module',
      'nextAttemptAt',
      'status',
      'updatedAt',
    ],
    'OPERATIONS_INVALID_JOBS_RESPONSE',
  )
  if (
    !isNumber(input.attemptCount) ||
    !isString(input.correlationId) ||
    !isString(input.entityId) ||
    !isString(input.entityType) ||
    !isString(input.id) ||
    !isString(input.lastErrorCode) ||
    !isString(input.lastErrorMessage) ||
    !isString(input.module) ||
    (input.nextAttemptAt !== null && !isString(input.nextAttemptAt)) ||
    !isString(input.updatedAt) ||
    ![
      'cancelled',
      'dead_letter',
      'failed',
      'pending',
      'processing',
      'retry_scheduled',
      'succeeded',
    ].includes(String(input.status))
  ) {
    throw validationError('OPERATIONS_INVALID_JOBS_RESPONSE')
  }
  mapStringMap(input.metadata ?? {}, 'OPERATIONS_INVALID_JOBS_RESPONSE')
  return {
    attemptCount: input.attemptCount,
    correlationId: input.correlationId,
    entityId: input.entityId,
    entityType: input.entityType,
    id: input.id,
    lastErrorCode: input.lastErrorCode,
    lastErrorMessage: input.lastErrorMessage,
    module: input.module,
    nextAttemptAt: input.nextAttemptAt,
    status: input.status as OperationsJob['status'],
    updatedAt: input.updatedAt,
  }
}

function mapAuditEvent(input: unknown): AuditEvent {
  if (!isRecord(input)) throw validationError('OPERATIONS_INVALID_AUDIT_RESPONSE')
  rejectExtraKeys(
    input,
    [
      'action',
      'actorUserId',
      'correlationId',
      'createdAt',
      'id',
      'metadata',
      'permission',
      'reason',
      'result',
      'targetId',
      'targetType',
    ],
    'OPERATIONS_INVALID_AUDIT_RESPONSE',
  )
  if (
    !isString(input.action) ||
    !isString(input.actorUserId) ||
    !isString(input.correlationId) ||
    !isString(input.createdAt) ||
    !isString(input.id) ||
    !isString(input.permission) ||
    !isString(input.reason) ||
    !isString(input.targetId) ||
    !isString(input.targetType) ||
    !['allowed', 'denied', 'failed'].includes(String(input.result))
  ) {
    throw validationError('OPERATIONS_INVALID_AUDIT_RESPONSE')
  }
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    createdAt: input.createdAt,
    id: input.id,
    metadata: mapStringMap(input.metadata, 'OPERATIONS_INVALID_AUDIT_RESPONSE'),
    permission: input.permission,
    reason: input.reason,
    result: input.result as AuditEvent['result'],
    targetId: input.targetId,
    targetType: input.targetType,
  }
}
