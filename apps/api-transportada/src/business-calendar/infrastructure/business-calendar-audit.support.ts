/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import {
  BUSINESS_CALENDAR_AUDIT_PERMISSION,
  type BusinessCalendarAuditTarget,
} from '../domain/business-calendar-audit.constant.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'

type AppendAuditParams = {
  readonly action: string
  readonly actor: BusinessCalendarActor
  readonly after: object | null
  readonly before: object | null
  readonly entityId: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly target: BusinessCalendarAuditTarget
  readonly transaction: BusinessCalendarTransaction
}

/** Ator, alvo, antes/depois e IP; feriado e regra são cadastro da empresa, sem dado pessoal. */
export async function appendBusinessCalendarAudit(params: AppendAuditParams): Promise<void> {
  const { actor } = params
  await params.transaction.insert(auditLogs).values({
    action: params.action,
    actorUserId: actor.userId,
    afterSnapshot: params.after,
    beforeSnapshot: params.before,
    companyId: actor.companyId,
    correlationId: actor.correlationId,
    entityId: params.entityId,
    entityType: params.target,
    metadata: { ipAddress: actor.ipAddress, ...params.metadata },
    permission: BUSINESS_CALENDAR_AUDIT_PERMISSION,
    targetId: params.entityId,
    targetType: params.target,
  })
}
