/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b: os números de WhatsApp do cliente de entrega (`channel = whatsapp`, tipo `boleto`, o que o envio do
 * boleto lê), no mesmo desenho do cadastro de e-mails: a escrita trava a linha do cliente (`FOR UPDATE`), então o limite
 * de 10 e a duplicata são conferidos sem corrida, e a auditoria leva só o número mascarado.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, count, eq, sql } from 'drizzle-orm'

import { deliveryClientContacts } from '../../database/delivery-client-contact.schema.js'
import { deliveryClients } from '../../database/delivery-client.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { maskClientWhatsAppNumber } from '../../occurrence-conversation/domain/contractor-reply-whatsapp-number.policy.js'
import {
  DELIVERY_CLIENT_CONTACT_CHANNEL,
  DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
  DELIVERY_CLIENT_EMAIL_PURPOSE,
} from '../../shared/delivery-client-email.constant.js'
import type { DeliveryClientEmailActor } from '../application/delivery-client-email.port.js'
import type {
  DeliveryClientWhatsApp,
  DeliveryClientWhatsAppRepositoryPort,
} from '../application/delivery-client-whatsapp.port.js'
import {
  DeliveryClientWhatsAppAlreadyExistsError,
  DeliveryClientWhatsAppLimitReachedError,
} from '../domain/delivery-client.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Row = typeof deliveryClientContacts.$inferSelect

const PURPOSE = DELIVERY_CLIENT_EMAIL_PURPOSE.BOLETO
const AUDIT_ENTITY_TYPE = 'delivery_client_whatsapp'
const AUDIT_PERMISSION = 'fleet.manage'
const AUDIT_ACTION = {
  created: 'delivery-client-whatsapp.created',
  removed: 'delivery-client-whatsapp.removed',
  updated: 'delivery-client-whatsapp.updated',
} as const

export class DrizzleDeliveryClientWhatsAppRepository
  implements DeliveryClientWhatsAppRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly actor: DeliveryClientEmailActor
    readonly label: string
    readonly number: string
    readonly taxId: string
  }): Promise<DeliveryClientWhatsApp | null> {
    const { actor } = input

    return this.database.transaction(async (transaction) => {
      if (!(await lockClient(transaction, actor.companyId, input.taxId))) return null

      const duplicate = await findByNumber(transaction, actor.companyId, input.taxId, input.number)
      if (duplicate !== undefined) throw new DeliveryClientWhatsAppAlreadyExistsError(duplicate.id)

      const [total] = await transaction
        .select({ value: count() })
        .from(deliveryClientContacts)
        .where(scope(actor.companyId, input.taxId))
      if ((total?.value ?? 0) >= DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE) {
        throw new DeliveryClientWhatsAppLimitReachedError(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE)
      }

      const [created] = await transaction
        .insert(deliveryClientContacts)
        .values({
          address: input.number,
          channel: DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP,
          companyId: actor.companyId,
          createdByKind: 'office',
          createdByUserId: actor.userId,
          label: input.label,
          purpose: PURPOSE,
          taxId: input.taxId,
        })
        .returning()
      const row = created as Row
      await audit(transaction, {
        action: AUDIT_ACTION.created,
        actor,
        after: snapshot(row),
        before: null,
        row,
      })
      return toWhatsApp(row)
    })
  }

  public async list(input: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<readonly DeliveryClientWhatsApp[] | null> {
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
      .from(deliveryClientContacts)
      .where(scope(input.companyId, input.taxId))
      .orderBy(asc(deliveryClientContacts.createdAt), asc(deliveryClientContacts.id))
    return rows.map(toWhatsApp)
  }

  public async remove(input: {
    readonly actor: DeliveryClientEmailActor
    readonly numberId: string
    readonly taxId: string
  }): Promise<boolean> {
    const { actor } = input

    return this.database.transaction(async (transaction) => {
      if (!(await lockClient(transaction, actor.companyId, input.taxId))) return false

      const [removed] = await transaction
        .delete(deliveryClientContacts)
        .where(
          and(scope(actor.companyId, input.taxId), eq(deliveryClientContacts.id, input.numberId)),
        )
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

  public async update(input: {
    readonly actor: DeliveryClientEmailActor
    readonly label?: string
    readonly number?: string
    readonly numberId: string
    readonly taxId: string
  }): Promise<DeliveryClientWhatsApp | null> {
    const { actor } = input

    return this.database.transaction(async (transaction) => {
      if (!(await lockClient(transaction, actor.companyId, input.taxId))) return null

      const [current] = await transaction
        .select()
        .from(deliveryClientContacts)
        .where(
          and(scope(actor.companyId, input.taxId), eq(deliveryClientContacts.id, input.numberId)),
        )
        .limit(1)
      if (current === undefined) return null

      const number = input.number ?? current.address
      const label = input.label ?? current.label
      if (number === current.address && label === current.label) return toWhatsApp(current)

      if (number !== current.address) {
        const duplicate = await findByNumber(transaction, actor.companyId, input.taxId, number)
        if (duplicate !== undefined)
          throw new DeliveryClientWhatsAppAlreadyExistsError(duplicate.id)
      }

      const [updated] = await transaction
        .update(deliveryClientContacts)
        .set({ address: number, label, updatedAt: new Date() })
        .where(eq(deliveryClientContacts.id, current.id))
        .returning()
      const row = updated as Row
      await audit(transaction, {
        action: AUDIT_ACTION.updated,
        actor,
        after: snapshot(row),
        before: snapshot(current),
        row,
      })
      return toWhatsApp(row)
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

function scope(companyId: string, taxId: string) {
  return and(
    eq(deliveryClientContacts.companyId, companyId),
    eq(deliveryClientContacts.taxId, taxId),
    eq(deliveryClientContacts.channel, DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP),
    eq(deliveryClientContacts.purpose, PURPOSE),
  )
}

async function findByNumber(
  transaction: Transaction,
  companyId: string,
  taxId: string,
  number: string,
): Promise<undefined | { readonly id: string }> {
  const [found] = await transaction
    .select({ id: deliveryClientContacts.id })
    .from(deliveryClientContacts)
    .where(
      and(
        scope(companyId, taxId),
        sql`lower(${deliveryClientContacts.address}) = lower(${number})`,
      ),
    )
    .limit(1)
  return found
}

function snapshot(row: Row) {
  return { label: row.label, numberMasked: maskClientWhatsAppNumber(row.address) }
}

async function audit(
  transaction: Transaction,
  input: {
    readonly action: string
    readonly actor: DeliveryClientEmailActor
    readonly after: object | null
    readonly before: object | null
    readonly row: Row
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

function toWhatsApp(row: Row): DeliveryClientWhatsApp {
  return {
    createdAt: row.createdAt,
    createdByKind: row.createdByKind,
    id: row.id,
    label: row.label,
    numberMasked: maskClientWhatsAppNumber(row.address),
  }
}
