/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

const MAX_PAGE_LIMIT = 100
const SENSITIVE_KEY_PATTERN =
  /(?:xml|payload|content|storagekey|storage_key|certificate|password|privatekey|private_key|token)/i

export type OperationsContext = {
  readonly companyId: string
  readonly permissions: ReadonlySet<string>
  readonly userId: string
}

export type OperationsClockPort = {
  readonly now: () => Promise<string> | string
}

export type OperationsRepositoryPort = {
  readonly getSummary: (input: {
    readonly companyId: string
    readonly filters: Record<string, unknown>
  }) => Promise<Record<string, unknown>>
  readonly listAuditEvents: (input: OperationsPageQuery) => Promise<Record<string, unknown> | null>
  readonly listJobs: (input: OperationsPageQuery) => Promise<Record<string, unknown>>
  readonly listTimeline: (input: OperationsPageQuery) => Promise<Record<string, unknown> | null>
}

export type OperationsPageQuery = {
  readonly companyId: string
  readonly cursor: string | null
  readonly filters: Record<string, unknown>
  readonly limit: number
}

export type OperationsSummaryInput = {
  readonly context: OperationsContext
  readonly filters?: Record<string, unknown> | undefined
}

export type OperationsListInput = {
  readonly context: OperationsContext
  readonly cursor?: string | null | undefined
  readonly filters?: Record<string, unknown> | undefined
  readonly limit?: number | undefined
}

export function createOperationsUseCase(dependencies: {
  readonly clock: OperationsClockPort
  readonly repository: OperationsRepositoryPort
}): {
  readonly getSummary: (input: OperationsSummaryInput) => Promise<Record<string, unknown>>
  readonly listAuditEvents: (input: OperationsListInput) => Promise<Record<string, unknown>>
  readonly listJobs: (input: OperationsListInput) => Promise<Record<string, unknown>>
  readonly listTimeline: (input: OperationsListInput) => Promise<Record<string, unknown>>
} {
  return {
    getSummary: (input) => getSummary(dependencies, input),
    listAuditEvents: (input) => listAuditEvents(dependencies.repository, input),
    listJobs: (input) => listJobs(dependencies.repository, input),
    listTimeline: (input) => listTimeline(dependencies.repository, input),
  }
}

async function getSummary(
  dependencies: {
    readonly clock: OperationsClockPort
    readonly repository: OperationsRepositoryPort
  },
  input: OperationsSummaryInput,
): Promise<Record<string, unknown>> {
  assertPermission(input.context, 'operations.read', operationsForbiddenError)
  const summary = await dependencies.repository.getSummary({
    companyId: input.context.companyId,
    filters: input.filters ?? {},
  })

  return sanitizeValue({
    generatedAt: await dependencies.clock.now(),
    ...summary,
  }) as Record<string, unknown>
}

async function listTimeline(
  repository: OperationsRepositoryPort,
  input: OperationsListInput,
): Promise<Record<string, unknown>> {
  assertPermission(input.context, 'operations.read', operationsForbiddenError)
  const page = await repository.listTimeline({
    companyId: input.context.companyId,
    cursor: input.cursor ?? null,
    filters: input.filters ?? {},
    limit: normalizeLimit(input.limit),
  })
  if (page === null) throw timelineNotFoundError()
  return sanitizeValue(page) as Record<string, unknown>
}

async function listJobs(
  repository: OperationsRepositoryPort,
  input: OperationsListInput,
): Promise<Record<string, unknown>> {
  assertPermission(input.context, 'operations.read', operationsForbiddenError)
  const page = await repository.listJobs({
    companyId: input.context.companyId,
    cursor: input.cursor ?? null,
    filters: input.filters ?? {},
    limit: normalizeLimit(input.limit),
  })
  return sanitizeValue(page) as Record<string, unknown>
}

async function listAuditEvents(
  repository: OperationsRepositoryPort,
  input: OperationsListInput,
): Promise<Record<string, unknown>> {
  assertPermission(input.context, 'audit.read', auditForbiddenError)
  const page = await repository.listAuditEvents({
    companyId: input.context.companyId,
    cursor: input.cursor ?? null,
    filters: input.filters ?? {},
    limit: normalizeLimit(input.limit),
  })
  if (page === null) throw auditNotFoundError()
  return sanitizeValue(page) as Record<string, unknown>
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 1) return 25
  return Math.min(value, MAX_PAGE_LIMIT)
}

function assertPermission(
  context: OperationsContext,
  permission: string,
  createError: () => ApiError,
): void {
  if (!context.permissions.has(permission)) throw createError()
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item))
  if (value === null || typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    output[key] = sanitizeValue(item)
  }
  return output
}

function operationsForbiddenError(): ApiError {
  return new ApiError({
    code: 'OPERATIONS_READ_FORBIDDEN',
    message: 'Operations access denied',
    status: 403,
  })
}

function auditForbiddenError(): ApiError {
  return new ApiError({
    code: 'AUDIT_READ_FORBIDDEN',
    message: 'Audit access denied',
    status: 403,
  })
}

function timelineNotFoundError(): ApiError {
  return new ApiError({
    code: 'OPERATIONS_TIMELINE_NOT_FOUND',
    message: 'Operations timeline not found',
    status: 404,
  })
}

function auditNotFoundError(): ApiError {
  return new ApiError({
    code: 'AUDIT_EVENTS_NOT_FOUND',
    message: 'Audit events not found',
    status: 404,
  })
}
