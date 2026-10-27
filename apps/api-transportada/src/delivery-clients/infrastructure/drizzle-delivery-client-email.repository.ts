/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, count, eq, sql } from 'drizzle-orm'

import { deliveryClientEmails } from '../../database/delivery-client-email.schema.js'
import { deliveryClients } from '../../database/delivery-client.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import {
  DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
  type DeliveryClientEmailPurpose,
} from '../../shared/delivery-client-email.constant.js'
import type {
  DeliveryClientEmail,
  DeliveryClientEmailActor,
  DeliveryClientEmailRepositoryPort,
} from '../application/delivery-client-email.port.js'
import {
  DeliveryClientEmailAlreadyExistsError,
  DeliveryClientEmailLimitReachedError,
} from '../domain/delivery-client.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type EmailRow = typeof deliveryClientEmails.$inferSelect

const AUDIT_ENTITY_TYPE = 'delivery_client_email'
const AUDIT_PERMISSION = 'fleet.manage'
const AUDIT_ACTION = {
  created: 'delivery-client-email.created',
  removed: 'delivery-client-email.removed',
  updated: 'delivery-client-email.updated',
} as const

/**
 * Toda instrução filtra por `company_id`. A escrita trava a linha do cliente (`FOR UPDATE`): é ela
 * que serializa duas inclusões simultâneas, então o limite de 10 e a duplicata são conferidos sem
 * corrida. A auditoria leva só o endereço mascarado e o tipo, nunca o endereço em claro.
 */
export class DrizzleDeliveryClientEmailRepository implements DeliveryClientEmailRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly actor: DeliveryClientEmailActor
    readonly address: string
    readonly label: string
    readonly purpose: DeliveryClientEmailPurpose
    readonly taxId: string
  }): Promise<DeliveryClientEmail | null> {
    const { actor } = input

    return this.database.transaction(async (transaction) => {
      if (!(await lockClient(transaction, actor.companyId, input.taxId))) return null

      const [duplicate] = await transaction
        .select({ id: deliveryClientEmails.id })
        .from(deliveryClientEmails)
        .where(
          and(
            eq(deliveryClientEmails.companyId, actor.companyId),
            eq(deliveryClientEmails.taxId, input.taxId),
            eq(deliveryClientEmails.purpose, input.purpose),
            sql`lower(${deliveryClientEmails.address}) = lower(${input.address})`,
          ),
        )
        .limit(1)
      if (duplicate !== undefined) throw new DeliveryClientEmailAlreadyExistsError(duplicate.id)

      const [total] = await transaction
        .select({ value: count() })
        .from(deliveryClientEmails)
        .where(
          and(
            eq(deliveryClientEmails.companyId, actor.companyId),
            eq(deliveryClientEmails.taxId, input.taxId),
            eq(deliveryClientEmails.purpose, input.purpose),
          ),
        )
      if ((total?.value ?? 0) >= DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE) {
        throw new DeliveryClientEmailLimitReachedError(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE)
      }

      const [created] = await transaction
        .insert(deliveryClientEmails)
        .values({
          address: input.address,
          companyId: actor.companyId,
          createdByKind: 'office',
          createdByUserId: actor.userId,
          label: input.label,
          purpose: input.purpose,
          taxId: input.taxId,
        })
        .returning()
      const row = created as EmailRow

      await audit(transaction, {
        action: AUDIT_ACTION.created,
        actor,
        after: snapshot(row),
        before: null,
        row,
      })

      return toEmail(row)
    })
  }

  public async list(input: {
    readonly companyId: string
    readonly purpose?: DeliveryClientEmailPurpose
    readonly taxId: string
  }): Promise<readonly DeliveryClientEmail[] | null> {
    const [client] = await this.database
      .select({ id: deliveryClients.id })
      .from(deliveryClients)
      .where(
        and(eq(deliveryClients.companyId, input.companyId), eq(deliveryClients.taxId, input.taxId)),
      )
      .limit(1)
    if (client === undefined) return null

    const rows = await this.database
      .select()
      .from(deliveryClientEmails)
      .where(
        and(
          eq(deliveryClientEmails.companyId, input.companyId),
          eq(deliveryClientEmails.taxId, input.taxId),
          ...(input.purpose === undefined ? [] : [eq(deliveryClientEmails.purpose, input.purpose)]),
        ),
      )
      .orderBy(
        asc(deliveryClientEmails.purpose),
        asc(deliveryClientEmails.createdAt),
        asc(deliveryClientEmails.id),
      )

    return rows.map(toEmail)
  }

  public async remove(input: {
    readonly actor: DeliveryClientEmailActor
    readonly emailId: string
    readonly taxId: string
  }): Promise<boolean> {
    const { actor } = input

    return this.database.transaction(async (transaction) => {
      if (!(await lockClient(transaction, actor.companyId, input.taxId))) return false

      const [removed] = await transaction
        .delete(deliveryClientEmails)
        .where(emailMatch(input, actor.companyId))
        .returning()
      if (removed === undefined) return false

      await audit(transaction, {
        action: AUDIT_ACTION.removed,
        actor,
        after: null,
        before: snapshot(removed),
        row: removed,
      })

      return true
    })
  }

  public async updateLabel(input: {
    readonly actor: DeliveryClientEmailActor
    readonly emailId: string
    readonly label: string
    readonly taxId: string
  }): Promise<DeliveryClientEmail | null> {
    const { actor } = input

    return this.database.transaction(async (transaction) => {
      if (!(await lockClient(transaction, actor.companyId, input.taxId))) return null

      const [current] = await transaction
        .select()
        .from(deliveryClientEmails)
        .where(emailMatch(input, actor.companyId))
        .limit(1)
      if (current === undefined) return null
      if (current.label === input.label) return toEmail(current)

      const [updated] = await transaction
        .update(deliveryClientEmails)
        .set({ label: input.label, updatedAt: new Date() })
        .where(emailMatch(input, actor.companyId))
        .returning()
      const row = updated as EmailRow

      await audit(transaction, {
        action: AUDIT_ACTION.updated,
        actor,
        after: snapshot(row),
        before: snapshot(current),
        row,
      })

      return toEmail(row)
    })
  }
}

/** `true` quando o cliente existe **nesta empresa**; a linha fica travada até o fim da transação. */
async function lockClient(
  transaction: Transaction,
  companyId: string,
  taxId: string,
): Promise<boolean> {
  const [client] = await transaction
    .select({ id: deliveryClients.id })
    .from(deliveryClients)
    .where(and(eq(deliveryClients.companyId, companyId), eq(deliveryClients.taxId, taxId)))
    .limit(1)
    .for('update')

  return client !== undefined
}

function emailMatch(
  input: { readonly emailId: string; readonly taxId: string },
  companyId: string,
) {
  return and(
    eq(deliveryClientEmails.companyId, companyId),
    eq(deliveryClientEmails.taxId, input.taxId),
    eq(deliveryClientEmails.id, input.emailId),
  )
}

function snapshot(row: EmailRow) {
  return { addressMasked: maskEmailAddress(row.address), label: row.label, purpose: row.purpose }
}

async function audit(
  transaction: Transaction,
  input: {
    readonly action: string
    readonly actor: DeliveryClientEmailActor
    readonly after: object | null
    readonly before: object | null
    readonly row: EmailRow
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: input.action,
    actorUserId: input.actor.userId,
    afterSnapshot: input.after,
    beforeSnapshot: input.before,
    companyId: input.actor.companyId,
    correlationId: input.actor.correlationId,
    entityId: input.row.id,
    entityType: AUDIT_ENTITY_TYPE,
    metadata: { ipAddress: input.actor.ipAddress },
    permission: AUDIT_PERMISSION,
    targetId: input.row.id,
    targetType: AUDIT_ENTITY_TYPE,
  })
}

function toEmail(row: EmailRow): DeliveryClientEmail {
  return {
    addressMasked: maskEmailAddress(row.address),
    createdAt: row.createdAt,
    createdByKind: row.createdByKind,
    id: row.id,
    label: row.label,
    purpose: row.purpose,
  }
}
