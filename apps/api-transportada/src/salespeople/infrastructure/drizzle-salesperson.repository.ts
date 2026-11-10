/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, count, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm'

import type {
  CompanySettingsDatabase,
  CompanySettingsQueryable,
  CompanySettingsTransaction,
} from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { contractors, deliveryClients } from '../../database/delivery-client.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import {
  contractorSalespeople,
  contractorSalespersonClients,
  contractorSalespersonLinks,
} from '../../database/salesperson.schema.js'
import type {
  PortfolioClient,
  Salesperson,
  SalespersonActor,
  SalespersonContractorLink,
  SalespersonFields,
  SalespersonPort,
} from '../application/salesperson.port.js'
import {
  SALESPERSON_AUDIT_PERMISSION,
  SALESPERSON_AUDIT_TARGET_TYPE,
  SALESPERSON_CHANGED_ACTION,
  SALESPERSON_LINK_CHANGED_ACTION,
  SALESPERSON_PORTFOLIO_CHANGED_ACTION,
} from '../domain/salesperson.constant.js'
import {
  SalespersonContractorNotFoundError,
  SalespersonEmailConflictError,
  SalespersonLinkNotFoundError,
  SalespersonNotFoundError,
  SalespersonPhoneConflictError,
  SalespersonPortfolioClientUnknownError,
} from '../domain/salesperson.error.js'

type Row = typeof contractorSalespeople.$inferSelect

const DATABASE_NOW = sql`now()`
const UNIQUE_VIOLATION = '23505'
const EMAIL_CONSTRAINT = 'contractor_salespeople_company_email_unique'
const PHONE_CONSTRAINT = 'contractor_salespeople_company_phone_key_unique'
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/gu

/** Toda instrução é filtrada pela empresa do contexto; os horários são do banco. */
export class DrizzleSalespersonRepository implements SalespersonPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async list(params: {
    readonly companyId: string
    readonly search: string | null
  }): Promise<readonly Salesperson[]> {
    const pattern =
      params.search === null || params.search.trim() === ''
        ? null
        : `%${params.search.trim().replaceAll(LIKE_SPECIAL_CHARACTERS, (match) => `\\${match}`)}%`
    const rows = await this.database
      .select()
      .from(contractorSalespeople)
      .where(
        and(
          eq(contractorSalespeople.companyId, params.companyId),
          pattern === null
            ? undefined
            : or(
                ilike(contractorSalespeople.name, pattern),
                ilike(contractorSalespeople.email, pattern),
              ),
        ),
      )
      .orderBy(asc(contractorSalespeople.name))
    const links = await loadLinks(
      this.database,
      params.companyId,
      rows.map((row) => row.id),
    )

    return rows.map((row) => toSalesperson(row, links.get(row.id) ?? []))
  }

  public async create(
    params: SalespersonActor & { readonly fields: SalespersonFields },
  ): Promise<Salesperson> {
    return runWithContactConflict(() =>
      this.database.transaction(async (transaction) => {
        const [row] = await transaction
          .insert(contractorSalespeople)
          .values({ ...params.fields, companyId: params.companyId, updatedByUserId: params.userId })
          .returning()
        if (row === undefined) throw new Error('SALESPERSON_NOT_PERSISTED')
        await appendAudit(transaction, {
          action: SALESPERSON_CHANGED_ACTION,
          actor: params,
          after: snapshot(row),
          before: null,
          entityId: row.id,
        })

        return toSalesperson(row, [])
      }),
    )
  }

  public async update(
    params: SalespersonActor & { readonly fields: SalespersonFields; readonly id: string },
  ): Promise<Salesperson> {
    return runWithContactConflict(() =>
      this.database.transaction(async (transaction) => {
        const previous = await lockSalesperson(transaction, params.companyId, params.id)
        const [row] = await transaction
          .update(contractorSalespeople)
          .set({ ...params.fields, updatedAt: DATABASE_NOW, updatedByUserId: params.userId })
          .where(
            and(
              eq(contractorSalespeople.id, params.id),
              eq(contractorSalespeople.companyId, params.companyId),
            ),
          )
          .returning()
        if (row === undefined) throw new SalespersonNotFoundError()
        await appendAudit(transaction, {
          action: SALESPERSON_CHANGED_ACTION,
          actor: params,
          after: snapshot(row),
          before: snapshot(previous),
          entityId: row.id,
        })

        return this.readOne(transaction, row)
      }),
    )
  }

  public async linkContractor(
    params: SalespersonActor & { readonly contractorId: string; readonly id: string },
  ): Promise<Salesperson> {
    return this.database.transaction(async (transaction) => {
      const salesperson = await lockSalesperson(transaction, params.companyId, params.id)
      const [contractor] = await transaction
        .select({ id: contractors.id })
        .from(contractors)
        .where(
          and(eq(contractors.id, params.contractorId), eq(contractors.companyId, params.companyId)),
        )
        .limit(1)
      if (contractor === undefined) throw new SalespersonContractorNotFoundError()
      const inserted = await transaction
        .insert(contractorSalespersonLinks)
        .values({
          companyId: params.companyId,
          contractorId: params.contractorId,
          salespersonId: params.id,
        })
        .onConflictDoNothing()
        .returning({ id: contractorSalespersonLinks.id })
      if (inserted.length > 0) {
        await appendAudit(transaction, {
          action: SALESPERSON_LINK_CHANGED_ACTION,
          actor: params,
          after: { contractorId: params.contractorId, linked: true },
          before: { contractorId: params.contractorId, linked: false },
          entityId: params.id,
        })
      }

      return this.readOne(transaction, salesperson)
    })
  }

  public async unlinkContractor(
    params: SalespersonActor & { readonly contractorId: string; readonly id: string },
  ): Promise<Salesperson> {
    return this.database.transaction(async (transaction) => {
      const salesperson = await lockSalesperson(transaction, params.companyId, params.id)
      const removed = await transaction
        .delete(contractorSalespersonLinks)
        .where(
          and(
            eq(contractorSalespersonLinks.companyId, params.companyId),
            eq(contractorSalespersonLinks.salespersonId, params.id),
            eq(contractorSalespersonLinks.contractorId, params.contractorId),
          ),
        )
        .returning({ id: contractorSalespersonLinks.id })
      if (removed.length > 0) {
        await appendAudit(transaction, {
          action: SALESPERSON_LINK_CHANGED_ACTION,
          actor: params,
          after: { contractorId: params.contractorId, linked: false },
          before: { contractorId: params.contractorId, linked: true },
          entityId: params.id,
        })
      }

      return this.readOne(transaction, salesperson)
    })
  }

  public async readPortfolio(params: {
    readonly companyId: string
    readonly contractorId: string
    readonly id: string
  }): Promise<readonly PortfolioClient[]> {
    const linkId = await findLinkId(this.database, params)
    if (linkId === null) throw new SalespersonLinkNotFoundError()

    return listPortfolio(this.database, params.companyId, linkId)
  }

  public async replacePortfolio(
    params: SalespersonActor & {
      readonly contractorId: string
      readonly id: string
      readonly taxIds: readonly string[]
    },
  ): Promise<readonly PortfolioClient[]> {
    return this.database.transaction(async (transaction) => {
      await lockSalesperson(transaction, params.companyId, params.id)
      const linkId = await findLinkId(transaction, params)
      if (linkId === null) throw new SalespersonLinkNotFoundError()
      if (params.taxIds.length > 0) {
        const [known] = await transaction
          .select({ total: count() })
          .from(deliveryClients)
          .where(
            and(
              eq(deliveryClients.companyId, params.companyId),
              inArray(deliveryClients.taxId, [...params.taxIds]),
            ),
          )
        if ((known?.total ?? 0) !== params.taxIds.length) {
          throw new SalespersonPortfolioClientUnknownError()
        }
      }
      const before = await transaction
        .select({ taxId: contractorSalespersonClients.taxId })
        .from(contractorSalespersonClients)
        .where(
          and(
            eq(contractorSalespersonClients.companyId, params.companyId),
            eq(contractorSalespersonClients.linkId, linkId),
          ),
        )
      await transaction
        .delete(contractorSalespersonClients)
        .where(
          and(
            eq(contractorSalespersonClients.companyId, params.companyId),
            eq(contractorSalespersonClients.linkId, linkId),
            params.taxIds.length === 0
              ? undefined
              : notInArray(contractorSalespersonClients.taxId, [...params.taxIds]),
          ),
        )
      if (params.taxIds.length > 0) {
        await transaction
          .insert(contractorSalespersonClients)
          .values(params.taxIds.map((taxId) => ({ companyId: params.companyId, linkId, taxId })))
          .onConflictDoNothing()
      }
      await appendAudit(transaction, {
        action: SALESPERSON_PORTFOLIO_CHANGED_ACTION,
        actor: params,
        after: { clientCount: params.taxIds.length, contractorId: params.contractorId },
        before: { clientCount: before.length, contractorId: params.contractorId },
        entityId: params.id,
      })

      return listPortfolio(transaction, params.companyId, linkId)
    })
  }

  private async readOne(queryable: CompanySettingsQueryable, row: Row): Promise<Salesperson> {
    const [fresh] = await queryable
      .select()
      .from(contractorSalespeople)
      .where(
        and(
          eq(contractorSalespeople.id, row.id),
          eq(contractorSalespeople.companyId, row.companyId),
        ),
      )
      .limit(1)
    const links = await loadLinks(queryable, row.companyId, [row.id])

    return toSalesperson(fresh ?? row, links.get(row.id) ?? [])
  }
}

async function lockSalesperson(
  transaction: CompanySettingsTransaction,
  companyId: string,
  id: string,
): Promise<Row> {
  const [row] = await transaction
    .select()
    .from(contractorSalespeople)
    .where(and(eq(contractorSalespeople.id, id), eq(contractorSalespeople.companyId, companyId)))
    .limit(1)
    .for('update')
  if (row === undefined) throw new SalespersonNotFoundError()

  return row
}

async function findLinkId(
  queryable: CompanySettingsQueryable,
  params: { readonly companyId: string; readonly contractorId: string; readonly id: string },
): Promise<string | null> {
  const [link] = await queryable
    .select({ id: contractorSalespersonLinks.id })
    .from(contractorSalespersonLinks)
    .where(
      and(
        eq(contractorSalespersonLinks.companyId, params.companyId),
        eq(contractorSalespersonLinks.salespersonId, params.id),
        eq(contractorSalespersonLinks.contractorId, params.contractorId),
      ),
    )
    .limit(1)

  return link?.id ?? null
}

async function listPortfolio(
  queryable: CompanySettingsQueryable,
  companyId: string,
  linkId: string,
): Promise<readonly PortfolioClient[]> {
  const rows = await queryable
    .select({ displayName: deliveryClients.displayName, taxId: contractorSalespersonClients.taxId })
    .from(contractorSalespersonClients)
    .innerJoin(
      deliveryClients,
      and(
        eq(deliveryClients.companyId, contractorSalespersonClients.companyId),
        eq(deliveryClients.taxId, contractorSalespersonClients.taxId),
      ),
    )
    .where(
      and(
        eq(contractorSalespersonClients.companyId, companyId),
        eq(contractorSalespersonClients.linkId, linkId),
      ),
    )
    .orderBy(asc(deliveryClients.displayName), asc(contractorSalespersonClients.taxId))

  return rows
}

async function loadLinks(
  queryable: CompanySettingsQueryable,
  companyId: string,
  salespersonIds: readonly string[],
): Promise<Map<string, SalespersonContractorLink[]>> {
  const result = new Map<string, SalespersonContractorLink[]>()
  if (salespersonIds.length === 0) return result
  const rows = await queryable
    .select({
      clientCount: count(contractorSalespersonClients.id),
      contractorId: contractorSalespersonLinks.contractorId,
      contractorName: contractors.displayName,
      salespersonId: contractorSalespersonLinks.salespersonId,
    })
    .from(contractorSalespersonLinks)
    .innerJoin(
      contractors,
      and(
        eq(contractors.companyId, contractorSalespersonLinks.companyId),
        eq(contractors.id, contractorSalespersonLinks.contractorId),
      ),
    )
    .leftJoin(
      contractorSalespersonClients,
      and(
        eq(contractorSalespersonClients.companyId, contractorSalespersonLinks.companyId),
        eq(contractorSalespersonClients.linkId, contractorSalespersonLinks.id),
      ),
    )
    .where(
      and(
        eq(contractorSalespersonLinks.companyId, companyId),
        inArray(contractorSalespersonLinks.salespersonId, [...salespersonIds]),
      ),
    )
    .groupBy(
      contractorSalespersonLinks.salespersonId,
      contractorSalespersonLinks.contractorId,
      contractors.displayName,
    )
    .orderBy(asc(contractors.displayName))
  for (const row of rows) {
    const list = result.get(row.salespersonId) ?? []
    list.push({
      clientCount: row.clientCount,
      contractorId: row.contractorId,
      contractorName: row.contractorName,
    })
    result.set(row.salespersonId, list)
  }

  return result
}

/** E-mail ou telefone repetido na empresa vira 409 estável; qualquer outro erro segue como está. */
async function runWithContactConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    const constraint = uniqueViolationConstraint(error)
    if (constraint === EMAIL_CONSTRAINT) throw new SalespersonEmailConflictError()
    if (constraint === PHONE_CONSTRAINT) throw new SalespersonPhoneConflictError()
    throw error
  }
}

function uniqueViolationConstraint(error: unknown): string | null {
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
    if (sqlState === UNIQUE_VIOLATION && typeof constraint === 'string') return constraint
    candidate = details.cause
  }

  return null
}

/** Ator, empresa, valores antes e depois, IP e correlação; nenhum e-mail ou telefone em claro. */
async function appendAudit(
  transaction: CompanySettingsTransaction,
  params: {
    readonly action: string
    readonly actor: SalespersonActor
    readonly after: Record<string, unknown>
    readonly before: Record<string, unknown> | null
    readonly entityId: string
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: params.action,
    actorUserId: params.actor.userId,
    afterSnapshot: params.after,
    beforeSnapshot: params.before,
    companyId: params.actor.companyId,
    correlationId: params.actor.correlationId,
    entityId: params.entityId,
    entityType: SALESPERSON_AUDIT_TARGET_TYPE,
    metadata: { ipAddress: params.actor.ipAddress },
    permission: SALESPERSON_AUDIT_PERMISSION,
    targetId: params.entityId,
    targetType: SALESPERSON_AUDIT_TARGET_TYPE,
  })
}

function snapshot(row: Row): Record<string, unknown> {
  return {
    hasEmail: row.email !== null,
    hasWhatsapp: row.whatsappE164 !== null,
    name: row.name,
    status: row.status,
  }
}

function toSalesperson(row: Row, links: readonly SalespersonContractorLink[]): Salesperson {
  return {
    contractors: links,
    createdAt: row.createdAt,
    email: row.email,
    id: row.id,
    name: row.name,
    status: row.status,
    updatedAt: row.updatedAt,
    whatsappE164: row.whatsappE164,
  }
}
