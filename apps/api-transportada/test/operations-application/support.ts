import { expect } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'

export const COMPANY_CONTEXT = {
  companyId: 'company-001',
  membershipId: 'membership-001',
  permissions: new Set(['operations.read', 'audit.read']),
  userId: 'user-001',
} as const

export const OPERATIONS_ONLY_CONTEXT = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['operations.read']),
} as const

export const NO_OPERATIONS_CONTEXT = {
  ...COMPANY_CONTEXT,
  permissions: new Set<string>(),
} as const

export const OTHER_COMPANY_ID = 'other-company-001'
export const CORRELATION_ID = 'correlation-operations-001'
export const TARGET_ID = '00000000-0000-4000-8000-000000000010'
export const NEXT_CURSOR = '2026-07-23T15:01:00.000Z::00000000-0000-4000-8000-000000000011'
export const NOW = '2026-07-23T15:00:00.000Z'

export type OperationsUseCaseContract = {
  readonly getSummary: (input: Record<string, unknown>) => Promise<unknown>
  readonly listAuditEvents: (input: Record<string, unknown>) => Promise<unknown>
  readonly listJobs: (input: Record<string, unknown>) => Promise<unknown>
  readonly listTimeline: (input: Record<string, unknown>) => Promise<unknown>
}

export type OperationsApplicationFactory = (options: {
  readonly clock: OperationsClockFixture
  readonly repository: OperationsRepositoryFixture
}) => OperationsUseCaseContract

export const SUMMARY_RESULT = {
  generatedAt: NOW,
  modules: [
    {
      failed: 1,
      module: 'nfe',
      pending: 2,
      processing: 0,
      retryScheduled: 1,
      succeeded: 14,
    },
    {
      failed: 0,
      module: 'billing',
      pending: 1,
      processing: 1,
      retryScheduled: 0,
      succeeded: 9,
    },
  ],
  recentErrors: [
    {
      code: 'SEFAZ_TIMEOUT',
      correlationId: CORRELATION_ID,
      message: 'Timeout sanitized',
      module: 'cte_issuance',
      occurredAt: '2026-07-23T14:58:00.000Z',
    },
  ],
} as const

export const TIMELINE_PAGE = {
  items: [
    {
      action: 'nfe_import_requested',
      correlationId: CORRELATION_ID,
      entityId: TARGET_ID,
      entityType: 'nfe_import',
      metadata: {
        accessKeySuffix: '0010',
        xml: '<cteProc>secret</cteProc>',
      },
      occurredAt: '2026-07-23T14:50:00.000Z',
      result: 'allowed',
    },
    {
      action: 'billing_invoice_issued',
      correlationId: CORRELATION_ID,
      entityId: '00000000-0000-4000-8000-000000000012',
      entityType: 'billing_invoice',
      metadata: {
        invoiceNumber: '1001',
        storageKey: 'private/billing/secret.xml',
      },
      occurredAt: '2026-07-23T15:00:00.000Z',
      result: 'allowed',
    },
  ],
  nextCursor: NEXT_CURSOR,
} as const

export const JOBS_PAGE = {
  items: [
    {
      attemptCount: 3,
      correlationId: CORRELATION_ID,
      entityId: TARGET_ID,
      entityType: 'cte_issuance',
      id: 'processing-job-001',
      lastErrorCode: 'TECHNICAL_TIMEOUT',
      lastErrorMessage: 'Provider timeout sanitized',
      metadata: {
        certificatePassword: 'secret-password',
      },
      module: 'cte_issuance',
      nextAttemptAt: '2026-07-23T15:05:00.000Z',
      status: 'retry_scheduled',
      updatedAt: NOW,
    },
    {
      attemptCount: 5,
      correlationId: 'correlation-dead-letter-001',
      entityId: '00000000-0000-4000-8000-000000000013',
      entityType: 'billing_invoice',
      id: 'processing-job-002',
      lastErrorCode: 'MANUAL_REVIEW_REQUIRED',
      lastErrorMessage: 'Manual review required',
      module: 'billing',
      nextAttemptAt: null,
      status: 'dead_letter',
      updatedAt: NOW,
    },
  ],
  nextCursor: NEXT_CURSOR,
} as const

export const AUDIT_PAGE = {
  items: [
    {
      action: 'billing.invoice.cancel',
      actorUserId: COMPANY_CONTEXT.userId,
      correlationId: CORRELATION_ID,
      createdAt: NOW,
      id: 'audit-log-001',
      metadata: {
        token: 'secret-token',
      },
      permission: 'billing.manage',
      reason: 'Duplicidade operacional',
      result: 'allowed',
      targetId: TARGET_ID,
      targetType: 'billing_invoice',
    },
  ],
  nextCursor: NEXT_CURSOR,
} as const

export async function createOperationsUseCaseForTest(
  repository: OperationsRepositoryFixture,
): Promise<OperationsUseCaseContract> {
  let moduleExports: Record<string, unknown>

  try {
    moduleExports = (await import(
      '../../src/operations/application/operations.use-case.js'
    )) as Record<string, unknown>
  } catch (error) {
    throw new Error(`T005 application implementation is missing: ${String(error)}`)
  }

  const factory = moduleExports['createOperationsUseCase']
  expect(typeof factory).toBe('function')

  return (factory as OperationsApplicationFactory)({
    clock: new OperationsClockFixture(),
    repository,
  })
}

export class OperationsClockFixture {
  public now(): string {
    return NOW
  }
}

export class OperationsRepositoryFixture {
  public readonly auditQueries: Array<Record<string, unknown>> = []
  public readonly jobQueries: Array<Record<string, unknown>> = []
  public readonly reprocessRequests: Array<Record<string, unknown>> = []
  public readonly summaryQueries: Array<Record<string, unknown>> = []
  public readonly timelineQueries: Array<Record<string, unknown>> = []

  public auditPage: Record<string, unknown> | null = AUDIT_PAGE
  public jobsPage: Record<string, unknown> = JOBS_PAGE
  public summary: Record<string, unknown> = SUMMARY_RESULT
  public timelinePage: Record<string, unknown> | null = TIMELINE_PAGE

  public async getSummary(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.summaryQueries.push(structuredClone(input))
    return structuredClone(this.summary)
  }

  public async listTimeline(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.timelineQueries.push(structuredClone(input))
    return this.timelinePage === null ? null : structuredClone(this.timelinePage)
  }

  public async listJobs(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.jobQueries.push(structuredClone(input))
    return structuredClone(this.jobsPage)
  }

  public async listAuditEvents(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.auditQueries.push(structuredClone(input))
    return this.auditPage === null ? null : structuredClone(this.auditPage)
  }
}

export async function captureApiError(callback: () => Promise<unknown>): Promise<ApiError> {
  try {
    await callback()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }

  throw new Error('Expected ApiError to be thrown')
}

export function stringify(value: unknown): string {
  return JSON.stringify(value)
}
