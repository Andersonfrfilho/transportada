/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402: leitura e escrita dos modelos de e-mail. Toda escrita que mexe no padrão de um
 * tipo segura um advisory lock de `(empresa, tipo)`: duas trocas de padrão concorrentes serializam,
 * e o único parcial de padrão nunca é violado no meio da troca.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'

import { contractorMailTemplates } from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  ContractorMailTemplate,
  ContractorMailTemplateRepositoryPort,
  CreateContractorMailTemplateParams,
  SetDefaultContractorMailTemplateParams,
  UpdateContractorMailTemplateParams,
} from '../application/contractor-mail-template.port.js'
import {
  ContractorMailTemplateNameTakenError,
  ContractorMailTemplateNotPersistedError,
} from '../domain/contractor-mail-template.error.js'
import type { ContractorMailTemplateType } from '../domain/mail-template-catalog.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type TemplateRow = typeof contractorMailTemplates.$inferSelect

const ACTIVE_STATUS = 'active'
const ARCHIVED_STATUS = 'archived'
const NAME_UNIQUE_CONSTRAINT = 'contractor_mail_templates_company_type_name_unique'
const LOCK_NAMESPACE = 'contractor-mail-template-default'

const table = contractorMailTemplates

export function buildContractorMailTemplateFilters(params: {
  readonly companyId: string
  readonly templateId: string
}): SQL[] {
  return [eq(table.companyId, params.companyId), eq(table.id, params.templateId)]
}

export function buildContractorMailTemplateListFilters(params: {
  readonly companyId: string
  readonly mailType?: ContractorMailTemplateType
}): SQL[] {
  const filters = [eq(table.companyId, params.companyId)]
  if (params.mailType !== undefined) filters.push(eq(table.mailType, params.mailType))
  return filters
}

export class DrizzleContractorMailTemplateRepository
  implements ContractorMailTemplateRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public async list(params: {
    readonly companyId: string
    readonly mailType?: ContractorMailTemplateType
  }): Promise<readonly ContractorMailTemplate[]> {
    const rows = await this.database
      .select()
      .from(table)
      .where(and(...buildContractorMailTemplateListFilters(params)))
      .orderBy(
        asc(table.mailType),
        asc(table.status),
        desc(table.isDefault),
        asc(sql`lower(${table.name})`),
        asc(table.id),
      )
    return rows.map(toTemplate)
  }

  public async find(params: {
    readonly companyId: string
    readonly templateId: string
  }): Promise<ContractorMailTemplate | undefined> {
    const [row] = await this.database
      .select()
      .from(table)
      .where(and(...buildContractorMailTemplateFilters(params)))
      .limit(1)
    return row === undefined ? undefined : toTemplate(row)
  }

  /** O primeiro modelo ativo do tipo nasce padrão: sem ele, o envio sem `templateId` recusaria. */
  public create(params: CreateContractorMailTemplateParams): Promise<ContractorMailTemplate> {
    return translateNameConflict(() =>
      this.database.transaction(async (transaction) => {
        await acquireDefaultLock(transaction, params.companyId, params.mailType)
        const [currentDefault] = await transaction
          .select({ id: table.id })
          .from(table)
          .where(activeDefaultFilter(params.companyId, params.mailType))
          .limit(1)
        const [row] = await transaction
          .insert(table)
          .values({
            actorUserId: params.actorUserId,
            closing: params.closing,
            companyId: params.companyId,
            intro: params.intro,
            isDefault: currentDefault === undefined,
            itemText: params.itemText,
            mailType: params.mailType,
            name: params.name,
            subject: params.subject,
          })
          .returning()
        if (row === undefined) throw new ContractorMailTemplateNotPersistedError()
        return toTemplate(row)
      }),
    )
  }

  /** Arquivar tira o padrão no mesmo `UPDATE` (a CHECK `default_active` exige). */
  public update(
    params: UpdateContractorMailTemplateParams,
  ): Promise<ContractorMailTemplate | undefined> {
    const isArchiving = params.changes.status === ARCHIVED_STATUS
    return translateNameConflict(async () => {
      const [row] = await this.database
        .update(table)
        .set({
          ...params.changes,
          ...(isArchiving ? { isDefault: false } : {}),
          actorUserId: params.actorUserId,
          updatedAt: sql`now()`,
          version: sql`${table.version} + 1`,
        })
        .where(
          and(
            ...buildContractorMailTemplateFilters(params),
            eq(table.version, params.expectedVersion),
            eq(table.status, ACTIVE_STATUS),
          ),
        )
        .returning()
      return row === undefined ? undefined : toTemplate(row)
    })
  }

  /** RF15: desmarca o padrão anterior e marca o novo na mesma transação, sob o lock do tipo. */
  public setDefault(
    params: SetDefaultContractorMailTemplateParams,
  ): Promise<ContractorMailTemplate | undefined> {
    return this.database.transaction(async (transaction) => {
      const [target] = await transaction
        .select({ mailType: table.mailType })
        .from(table)
        .where(and(...buildContractorMailTemplateFilters(params)))
        .limit(1)
      if (target === undefined) return undefined

      await acquireDefaultLock(transaction, params.companyId, target.mailType)
      const [current] = await transaction
        .select()
        .from(table)
        .where(
          and(
            ...buildContractorMailTemplateFilters(params),
            eq(table.version, params.expectedVersion),
            eq(table.status, ACTIVE_STATUS),
          ),
        )
        .for('update')
      if (current === undefined) return undefined
      if (current.isDefault) return toTemplate(current)

      const bump = {
        actorUserId: params.actorUserId,
        updatedAt: sql`now()`,
        version: sql`${table.version} + 1`,
      }
      await transaction
        .update(table)
        .set({ ...bump, isDefault: false })
        .where(activeDefaultFilter(params.companyId, target.mailType))
      const [row] = await transaction
        .update(table)
        .set({ ...bump, isDefault: true })
        .where(and(...buildContractorMailTemplateFilters(params)))
        .returning()
      return row === undefined ? undefined : toTemplate(row)
    })
  }
}

function activeDefaultFilter(companyId: string, mailType: ContractorMailTemplateType): SQL {
  return and(
    eq(table.companyId, companyId),
    eq(table.mailType, mailType),
    eq(table.isDefault, true),
    eq(table.status, ACTIVE_STATUS),
  ) as SQL
}

async function translateNameConflict<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    if (violatedUniqueConstraint(error) === NAME_UNIQUE_CONSTRAINT) {
      throw new ContractorMailTemplateNameTakenError()
    }
    throw error
  }
}

async function acquireDefaultLock(
  transaction: Transaction,
  companyId: string,
  mailType: ContractorMailTemplateType,
): Promise<void> {
  const encoded = new TextEncoder().encode(JSON.stringify([LOCK_NAMESPACE, companyId, mailType]))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}

function toTemplate(row: TemplateRow): ContractorMailTemplate {
  return {
    actorUserId: row.actorUserId,
    closing: row.closing,
    companyId: row.companyId,
    createdAt: row.createdAt,
    id: row.id,
    intro: row.intro,
    isDefault: row.isDefault,
    itemText: row.itemText,
    mailType: row.mailType,
    name: row.name,
    status: row.status,
    subject: row.subject,
    updatedAt: row.updatedAt,
    version: row.version,
  }
}
