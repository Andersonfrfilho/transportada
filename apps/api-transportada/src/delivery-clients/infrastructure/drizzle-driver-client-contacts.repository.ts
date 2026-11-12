/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T8b (D13): os contatos do cliente da nota para o motorista. A nota vem do `documentId` e só vale se o
 * motorista está na tripulação da viagem dela; o cliente é o destinatário da nota, com cadastro. A escrita trava a
 * linha do cliente (`FOR UPDATE`), como a do escritório: duas inclusões simultâneas não furam o limite nem duplicam.
 * A auditoria leva só o endereço mascarado, nunca em claro.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, count, eq, sql } from 'drizzle-orm'

import { deliveryClientContacts } from '../../database/delivery-client-contact.schema.js'
import { deliveryClients } from '../../database/delivery-client.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripDrivers } from '../../database/trip.schema.js'
import { maskClientWhatsAppNumber } from '../../occurrence-conversation/domain/contractor-reply-whatsapp-number.policy.js'
import {
  DELIVERY_CLIENT_CONTACT_CHANNEL,
  DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
  DELIVERY_CLIENT_EMAIL_PURPOSE,
  type DeliveryClientContactChannel,
} from '../../shared/delivery-client-email.constant.js'
import { maskEmailAddress } from '../../shared/email-address-mask.policy.js'
import type {
  DriverClientContact,
  DriverClientContactActor,
  DriverClientContactRepositoryPort,
} from '../application/driver-client-contact.port.js'
import {
  DeliveryClientEmailAlreadyExistsError,
  DeliveryClientEmailLimitReachedError,
} from '../domain/delivery-client.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type ContactRow = typeof deliveryClientContacts.$inferSelect

const RECIPIENT_ROLE = 'recipient'
const PURPOSE = DELIVERY_CLIENT_EMAIL_PURPOSE.BOLETO
const AUDIT_ENTITY_TYPE = 'delivery_client_contact'
const AUDIT_PERMISSION = 'trip.report'
const AUDIT_ACTION = {
  created: 'delivery-client-contact.created',
  removed: 'delivery-client-contact.removed',
  updated: 'delivery-client-contact.updated',
} as const

function mask(channel: DeliveryClientContactChannel, address: string): string {
  return channel === DELIVERY_CLIENT_CONTACT_CHANNEL.WHATSAPP
    ? maskClientWhatsAppNumber(address)
    : maskEmailAddress(address)
}

/** Só o que este motorista informou é dele para editar e remover (D13: o resto é do escritório). */
function isMine(row: ContactRow, actor: DriverClientContactActor): boolean {
  return row.createdByKind === 'driver' && row.createdByUserId === actor.userId
}

function toContact(row: ContactRow, actor: DriverClientContactActor): DriverClientContact {
  return {
    addressMasked: mask(row.channel, row.address),
    channel: row.channel,
    contactId: row.id,
    editable: isMine(row, actor),
    label: row.label,
  }
}

/** O cliente (destinatário com cadastro) da nota da viagem do motorista, ou `null`. Com `lock`, trava a linha dele. */
async function findClientTaxId(
  transaction: Transaction,
  input: {
    readonly actor: DriverClientContactActor
    readonly documentId: string
    readonly lock: boolean
  },
): Promise<null | string> {
  const { actor } = input
  const query = transaction
    .select({ taxId: deliveryClients.taxId })
    .from(tripDocuments)
    .innerJoin(
      tripDrivers,
      and(
        eq(tripDrivers.companyId, tripDocuments.companyId),
        eq(tripDrivers.tripId, tripDocuments.tripId),
        eq(tripDrivers.driverId, actor.driverId),
      ),
    )
    .innerJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, RECIPIENT_ROLE),
      ),
    )
    .innerJoin(
      deliveryClients,
      and(
        eq(deliveryClients.companyId, nfeParticipants.companyId),
        eq(deliveryClients.taxId, nfeParticipants.taxId),
      ),
    )
    .where(
      and(eq(tripDocuments.companyId, actor.companyId), eq(tripDocuments.id, input.documentId)),
    )
    .limit(1)
  const [row] = input.lock ? await query.for('update', { of: deliveryClients }) : await query
  return row?.taxId ?? null
}

function channelMatch(actor: DriverClientContactActor, taxId: string) {
  return and(
    eq(deliveryClientContacts.companyId, actor.companyId),
    eq(deliveryClientContacts.taxId, taxId),
    eq(deliveryClientContacts.purpose, PURPOSE),
  )
}

async function audit(
  transaction: Transaction,
  input: {
    readonly action: string
    readonly actor: DriverClientContactActor
    readonly after: object | null
    readonly before: object | null
    readonly documentId: string
    readonly row: ContactRow
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
    metadata: {
      authorKind: 'driver',
      channel: input.row.channel,
      documentId: input.documentId,
      source: 'driver_app_occurrence_open',
    },
    permission: AUDIT_PERMISSION,
    targetId: input.row.id,
    targetType: AUDIT_ENTITY_TYPE,
  })
}

function snapshot(row: ContactRow) {
  return { addressMasked: mask(row.channel, row.address), channel: row.channel, label: row.label }
}

export class DrizzleDriverClientContactRepository implements DriverClientContactRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async list(input: {
    readonly actor: DriverClientContactActor
    readonly documentId: string
  }): Promise<readonly DriverClientContact[] | null> {
    const { actor } = input
    return this.database.transaction(async (transaction) => {
      const taxId = await findClientTaxId(transaction, { ...input, lock: false })
      if (taxId === null) return null
      const rows = await transaction
        .select()
        .from(deliveryClientContacts)
        .where(channelMatch(actor, taxId))
        .orderBy(
          asc(deliveryClientContacts.channel),
          asc(deliveryClientContacts.createdAt),
          asc(deliveryClientContacts.id),
        )
      return rows.map((row) => toContact(row, actor))
    })
  }

  public async create(input: {
    readonly actor: DriverClientContactActor
    readonly address: string
    readonly channel: DeliveryClientContactChannel
    readonly documentId: string
    readonly label: string
  }): Promise<{ readonly contact: DriverClientContact; readonly created: boolean } | null> {
    const { actor } = input
    return this.database.transaction(async (transaction) => {
      const taxId = await findClientTaxId(transaction, { ...input, lock: true })
      if (taxId === null) return null

      const [duplicate] = await transaction
        .select()
        .from(deliveryClientContacts)
        .where(
          and(
            channelMatch(actor, taxId),
            sql`lower(${deliveryClientContacts.address}) = lower(${input.address})`,
          ),
        )
        .limit(1)
      if (duplicate !== undefined) {
        return { contact: toContact(duplicate, actor), created: false }
      }

      const [total] = await transaction
        .select({ value: count() })
        .from(deliveryClientContacts)
        .where(and(channelMatch(actor, taxId), eq(deliveryClientContacts.channel, input.channel)))
      if ((total?.value ?? 0) >= DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE) {
        throw new DeliveryClientEmailLimitReachedError(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE)
      }

      const [created] = await transaction
        .insert(deliveryClientContacts)
        .values({
          address: input.address,
          channel: input.channel,
          companyId: actor.companyId,
          createdByKind: 'driver',
          createdByUserId: actor.userId,
          label: input.label,
          purpose: PURPOSE,
          taxId,
        })
        .returning()
      const row = created as ContactRow
      await audit(transaction, {
        action: AUDIT_ACTION.created,
        actor,
        after: snapshot(row),
        before: null,
        documentId: input.documentId,
        row,
      })
      return { contact: toContact(row, actor), created: true }
    })
  }

  public async update(input: {
    readonly actor: DriverClientContactActor
    readonly address?: string
    readonly contactId: string
    readonly documentId: string
    readonly label?: string
  }): Promise<DriverClientContact | null> {
    const { actor } = input
    return this.database.transaction(async (transaction) => {
      const taxId = await findClientTaxId(transaction, { ...input, lock: true })
      if (taxId === null) return null

      const [current] = await transaction
        .select()
        .from(deliveryClientContacts)
        .where(and(channelMatch(actor, taxId), eq(deliveryClientContacts.id, input.contactId)))
        .limit(1)
      if (current === undefined || !isMine(current, actor)) return null

      const address = input.address ?? current.address
      const label = input.label ?? current.label
      if (address === current.address && label === current.label) return toContact(current, actor)

      if (address.toLowerCase() !== current.address.toLowerCase()) {
        const [duplicate] = await transaction
          .select({ id: deliveryClientContacts.id })
          .from(deliveryClientContacts)
          .where(
            and(
              channelMatch(actor, taxId),
              sql`lower(${deliveryClientContacts.address}) = lower(${address})`,
            ),
          )
          .limit(1)
        if (duplicate !== undefined) throw new DeliveryClientEmailAlreadyExistsError(duplicate.id)
      }

      const [updated] = await transaction
        .update(deliveryClientContacts)
        .set({ address, label, updatedAt: new Date() })
        .where(eq(deliveryClientContacts.id, current.id))
        .returning()
      const row = updated as ContactRow
      await audit(transaction, {
        action: AUDIT_ACTION.updated,
        actor,
        after: snapshot(row),
        before: snapshot(current),
        documentId: input.documentId,
        row,
      })
      return toContact(row, actor)
    })
  }

  public async remove(input: {
    readonly actor: DriverClientContactActor
    readonly contactId: string
    readonly documentId: string
  }): Promise<boolean> {
    const { actor } = input
    return this.database.transaction(async (transaction) => {
      const taxId = await findClientTaxId(transaction, { ...input, lock: true })
      if (taxId === null) return false

      const [current] = await transaction
        .select()
        .from(deliveryClientContacts)
        .where(and(channelMatch(actor, taxId), eq(deliveryClientContacts.id, input.contactId)))
        .limit(1)
      if (current === undefined || !isMine(current, actor)) return false

      await transaction
        .delete(deliveryClientContacts)
        .where(eq(deliveryClientContacts.id, current.id))
      await audit(transaction, {
        action: AUDIT_ACTION.removed,
        actor,
        after: null,
        before: snapshot(current),
        documentId: input.documentId,
        row: current,
      })
      return true
    })
  }
}
