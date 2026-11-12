/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, sql } from 'drizzle-orm'

import { contractorAutomations } from '../../database/contractor-automation.schema.js'
import type {
  CompanySettingsDatabase,
  CompanySettingsTransaction,
} from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  ContractorAutomation,
  ContractorAutomationActor,
  ContractorAutomationFields,
  ContractorAutomationPort,
} from '../application/contractor-automation.port.js'
import {
  CONTRACTOR_AUTOMATION_AUDIT_PERMISSION,
  CONTRACTOR_AUTOMATION_AUDIT_TARGET_TYPE,
  CONTRACTOR_AUTOMATION_CHANGED_ACTION,
} from '../domain/contractor-automation.constant.js'
import {
  ContractorAutomationNameConflictError,
  ContractorAutomationNotFoundError,
} from '../domain/contractor-automation.error.js'

type Row = typeof contractorAutomations.$inferSelect

const DATABASE_NOW = sql`now()`
const UNIQUE_VIOLATION = '23505'
const NAME_CONSTRAINT = 'contractor_automations_company_name_unique'

/** Toda instrução é filtrada pela empresa do contexto; os horários são do banco. */
export class DrizzleContractorAutomationRepository implements ContractorAutomationPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async list(params: {
    readonly companyId: string
  }): Promise<readonly ContractorAutomation[]> {
    const rows = await this.database
      .select()
      .from(contractorAutomations)
      .where(eq(contractorAutomations.companyId, params.companyId))
      .orderBy(asc(contractorAutomations.name))

    return rows.map(toAutomation)
  }

  public async create(
    params: ContractorAutomationActor & { readonly fields: ContractorAutomationFields },
  ): Promise<ContractorAutomation> {
    return runWithNameConflict(() =>
      this.database.transaction(async (transaction) => {
        const [row] = await transaction
          .insert(contractorAutomations)
          .values({
            ...toColumns(params.fields),
            companyId: params.companyId,
            updatedByUserId: params.userId,
          })
          .returning()
        if (row === undefined) throw new Error('CONTRACTOR_AUTOMATION_NOT_PERSISTED')
        await appendAudit(transaction, { actor: params, after: row, before: null })

        return toAutomation(row)
      }),
    )
  }

  public async update(
    params: ContractorAutomationActor & {
      readonly fields: ContractorAutomationFields
      readonly id: string
    },
  ): Promise<ContractorAutomation> {
    return runWithNameConflict(() =>
      this.database.transaction(async (transaction) => {
        const [previous] = await transaction
          .select()
          .from(contractorAutomations)
          .where(
            and(
              eq(contractorAutomations.id, params.id),
              eq(contractorAutomations.companyId, params.companyId),
            ),
          )
          .limit(1)
          .for('update')
        if (previous === undefined) throw new ContractorAutomationNotFoundError()

        const [row] = await transaction
          .update(contractorAutomations)
          .set({
            ...toColumns(params.fields),
            updatedAt: DATABASE_NOW,
            updatedByUserId: params.userId,
          })
          .where(
            and(
              eq(contractorAutomations.id, params.id),
              eq(contractorAutomations.companyId, params.companyId),
            ),
          )
          .returning()
        if (row === undefined) throw new ContractorAutomationNotFoundError()
        await appendAudit(transaction, { actor: params, after: row, before: previous })

        return toAutomation(row)
      }),
    )
  }
}

function toColumns(fields: ContractorAutomationFields): {
  readonly billingDueDays: number
  readonly enabled: boolean
  readonly name: string
  readonly nfseCity: string | null
  readonly partSize: number
  readonly recipients: string[]
  readonly xmlKind: ContractorAutomationFields['xmlKind']
} {
  return { ...fields, recipients: [...fields.recipients] }
}

/** O nome repetido na empresa vira 409 estável; qualquer outro erro segue como está. */
async function runWithNameConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (isNameConflict(error)) throw new ContractorAutomationNameConflictError()
    throw error
  }
}

function isNameConflict(error: unknown): boolean {
  let candidate: unknown = error
  for (
    let depth = 0;
    depth < 4 && typeof candidate === 'object' && candidate !== null;
    depth += 1
  ) {
    const details = candidate as {
      cause?: unknown
      code?: unknown
      constraint?: unknown
      constraint_name?: unknown
      errno?: unknown
    }
    const constraint = details.constraint ?? details.constraint_name
    const sqlState = details.errno ?? details.code
    if (sqlState === UNIQUE_VIOLATION && constraint === NAME_CONSTRAINT) return true
    candidate = details.cause
  }

  return false
}

/** Ator, empresa, valores antes e depois, IP e correlação; nenhum dado fiscal. */
async function appendAudit(
  transaction: CompanySettingsTransaction,
  params: {
    readonly actor: ContractorAutomationActor
    readonly after: Row
    readonly before: Row | null
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: CONTRACTOR_AUTOMATION_CHANGED_ACTION,
    actorUserId: params.actor.userId,
    afterSnapshot: snapshot(params.after),
    beforeSnapshot: params.before === null ? null : snapshot(params.before),
    companyId: params.actor.companyId,
    correlationId: params.actor.correlationId,
    entityId: params.after.id,
    entityType: CONTRACTOR_AUTOMATION_AUDIT_TARGET_TYPE,
    metadata: { ipAddress: params.actor.ipAddress },
    permission: CONTRACTOR_AUTOMATION_AUDIT_PERMISSION,
    targetId: params.after.id,
    targetType: CONTRACTOR_AUTOMATION_AUDIT_TARGET_TYPE,
  })
}

function snapshot(row: Row): Record<string, unknown> {
  return {
    billingDueDays: row.billingDueDays,
    enabled: row.enabled,
    name: row.name,
    nfseCity: row.nfseCity,
    partSize: row.partSize,
    recipientCount: row.recipients.length,
    xmlKind: row.xmlKind,
  }
}

function toAutomation(row: Row): ContractorAutomation {
  return {
    billingDueDays: row.billingDueDays,
    createdAt: row.createdAt,
    enabled: row.enabled,
    id: row.id,
    name: row.name,
    nfseCity: row.nfseCity,
    partSize: row.partSize,
    recipients: row.recipients,
    updatedAt: row.updatedAt,
    xmlKind: row.xmlKind,
  }
}
