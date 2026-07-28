/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'

import { auditLogs, processingJobs } from '../../database/database.schema.js'
import type {
  OperationsPageQuery,
  OperationsRepositoryPort,
} from '../application/operations.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type ProcessingJobRecord = typeof processingJobs.$inferSelect
type AuditLogRecord = typeof auditLogs.$inferSelect

export class DrizzleOperationsRepository implements OperationsRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async getSummary(input: {
    readonly companyId: string
    readonly filters: Record<string, unknown>
  }): Promise<Record<string, unknown>> {
    const rows = await this.database
      .select({
        count: sql<bigint>`count(*)`,
        module: processingJobs.module,
        status: processingJobs.status,
      })
      .from(processingJobs)
      .where(and(eq(processingJobs.companyId, input.companyId), createJobFilters(input.filters)))
      .groupBy(processingJobs.module, processingJobs.status)

    const modules = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      const moduleSummary = modules.get(row.module) ?? {
        deadLetter: 0,
        failed: 0,
        module: row.module,
        pending: 0,
        processing: 0,
        retryScheduled: 0,
        succeeded: 0,
      }
      moduleSummary[summaryStatusKey(row.status)] = Number(row.count)
      modules.set(row.module, moduleSummary)
    }

    const recentErrors = await this.database
      .select()
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.companyId, input.companyId),
          or(eq(processingJobs.status, 'failed'), eq(processingJobs.status, 'dead_letter')),
          createJobFilters(input.filters),
        ),
      )
      .orderBy(desc(processingJobs.updatedAt), desc(processingJobs.id))
      .limit(5)

    return {
      modules: [...modules.values()],
      recentErrors: recentErrors.map(mapJobError),
    }
  }

  public async listTimeline(input: OperationsPageQuery): Promise<Record<string, unknown> | null> {
    const rows = await this.database
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.companyId, input.companyId), createAuditFilters(input.filters)))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(input.limit + 1)

    if (rows.length === 0 && hasTargetFilter(input.filters)) return null
    return mapAuditPage(rows, input.limit)
  }

  public async listJobs(input: OperationsPageQuery): Promise<Record<string, unknown>> {
    const cursor = decodeCursor(input.cursor)
    const rows = await this.database
      .select()
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.companyId, input.companyId),
          createJobFilters(input.filters),
          cursor === null
            ? undefined
            : or(
                lt(processingJobs.updatedAt, cursor.date),
                and(eq(processingJobs.updatedAt, cursor.date), lt(processingJobs.id, cursor.id)),
              ),
        ),
      )
      .orderBy(desc(processingJobs.updatedAt), desc(processingJobs.id))
      .limit(input.limit + 1)

    const hasMore = rows.length > input.limit
    const pageRows = rows.slice(0, input.limit)
    const last = pageRows.at(-1)
    return {
      items: pageRows.map(mapJob),
      nextCursor:
        hasMore && last !== undefined ? `${last.updatedAt.toISOString()}::${last.id}` : null,
    }
  }

  public async listAuditEvents(
    input: OperationsPageQuery,
  ): Promise<Record<string, unknown> | null> {
    const cursor = decodeCursor(input.cursor)
    const rows = await this.database
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.companyId, input.companyId),
          createAuditFilters(input.filters),
          cursor === null
            ? undefined
            : or(
                lt(auditLogs.createdAt, cursor.date),
                and(eq(auditLogs.createdAt, cursor.date), lt(auditLogs.id, cursor.id)),
              ),
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(input.limit + 1)

    if (rows.length === 0 && hasTargetFilter(input.filters)) return null
    return mapAuditPage(rows, input.limit)
  }
}

function createJobFilters(filters: Record<string, unknown>) {
  return and(
    optionalEq(processingJobs.module, filters['module']),
    optionalEq(processingJobs.status, filters['status']),
    optionalEq(processingJobs.entityType, filters['entityType']),
    optionalEq(processingJobs.entityId, filters['entityId']),
    optionalEq(processingJobs.correlationId, filters['correlationId']),
  )
}

function createAuditFilters(filters: Record<string, unknown>) {
  return and(
    optionalEq(auditLogs.action, filters['action']),
    optionalEq(auditLogs.actorUserId, filters['actorUserId']),
    optionalEq(auditLogs.targetType, filters['targetType'] ?? filters['entityType']),
    optionalEq(auditLogs.targetId, filters['targetId'] ?? filters['entityId']),
    optionalEq(auditLogs.result, filters['result']),
    optionalEq(auditLogs.correlationId, filters['correlationId']),
  )
}

function optionalEq<TColumn>(column: TColumn, value: unknown) {
  return typeof value === 'string' && value.length > 0 ? eq(column as never, value) : undefined
}

function decodeCursor(value: string | null): { readonly date: Date; readonly id: string } | null {
  if (value === null) return null
  const [dateValue, id] = value.split('::')
  if (dateValue === undefined || id === undefined) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  return { date, id }
}

function hasTargetFilter(filters: Record<string, unknown>): boolean {
  return (
    typeof filters['targetId'] === 'string' ||
    typeof filters['entityId'] === 'string' ||
    typeof filters['correlationId'] === 'string'
  )
}

function mapJob(record: ProcessingJobRecord): Record<string, unknown> {
  return {
    attemptCount: record.attemptCount,
    correlationId: record.correlationId,
    entityId: record.entityId,
    entityType: record.entityType,
    id: record.id,
    lastErrorCode: record.lastErrorCode,
    lastErrorMessage: record.lastErrorMessage,
    metadata: record.metadata,
    module: record.module,
    nextAttemptAt: record.nextAttemptAt?.toISOString() ?? null,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  }
}

function mapJobError(record: ProcessingJobRecord): Record<string, unknown> {
  return {
    code: record.lastErrorCode,
    correlationId: record.correlationId,
    message: record.lastErrorMessage,
    module: record.module,
    occurredAt: record.updatedAt.toISOString(),
  }
}

function mapAuditPage(rows: readonly AuditLogRecord[], limit: number): Record<string, unknown> {
  const hasMore = rows.length > limit
  const pageRows = rows.slice(0, limit)
  const last = pageRows.at(-1)
  return {
    items: pageRows.map(mapAuditEvent),
    nextCursor:
      hasMore && last !== undefined ? `${last.createdAt.toISOString()}::${last.id}` : null,
  }
}

function mapAuditEvent(record: AuditLogRecord): Record<string, unknown> {
  return {
    action: record.action,
    actorUserId: record.actorUserId,
    correlationId: record.correlationId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    metadata: record.metadata,
    permission: record.permission,
    reason: record.reason,
    result: record.result,
    targetId: record.targetId,
    targetType: record.targetType,
  }
}

function summaryStatusKey(status: string): string {
  if (status === 'retry_scheduled') return 'retryScheduled'
  if (status === 'dead_letter') return 'deadLetter'
  return status
}
