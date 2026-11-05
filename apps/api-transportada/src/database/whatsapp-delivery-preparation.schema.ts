/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { fleetDrivers } from './fleet.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { RECEIVED_BY_OPTIONS, tripDocuments, type ReceivedBy } from './trip.schema.js'

/** `open` até a baixa (`completed`), o motorista desistir (`cancelled`) ou a nota fechar por outro canal (`superseded`). */
export const WHATSAPP_DELIVERY_PREPARATION_STATUSES = [
  'open',
  'completed',
  'cancelled',
  'superseded',
] as const
export type WhatsAppDeliveryPreparationStatus =
  (typeof WHATSAPP_DELIVERY_PREPARATION_STATUSES)[number]

/** Onde a entrega começou. As provas valem nos dois canais, ligadas pela nota (spec 293 regra 3). */
export const WHATSAPP_DELIVERY_PREPARATION_CHANNELS = ['group', 'individual'] as const
export type WhatsAppDeliveryPreparationChannel =
  (typeof WHATSAPP_DELIVERY_PREPARATION_CHANNELS)[number]

/** A foto recebida e guardada no bucket privado à espera da baixa; vira comprovante depois dela. */
export type WhatsAppDeliveryPreparationPhoto = {
  readonly kind: 'cargo' | 'photo'
  readonly mimeType: string
  readonly objectKey: string
  /** O id da mensagem no provedor: a mesma foto reentregue não conta duas vezes. */
  readonly providerMessageId: string
  readonly sha256: string
  readonly sizeBytes: number
}

/**
 * Spec 293 T15: **a entrega em preparo, uma por nota.** O motorista disse "entreguei", mas a configuração
 * do comprovante pede provas que ainda não chegaram: a nota não fecha até chegarem (decisão do Anderson,
 * 04/11). Não é a sessão de 10 minutos do grupo: dura até a baixa, e as provas valem vindas do grupo ou
 * da conversa individual, porque a ligação é a nota, nunca o canal.
 *
 * As fotos ficam no bucket privado (`photos`, só a referência); quem recebeu e a localização ficam em
 * colunas, como em `trip_delivery_proofs`. Nada disso vai para a conversa do grupo.
 */
export const whatsappDeliveryPreparations = pgTable(
  'whatsapp_delivery_preparations',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    /** O número da nota como o motorista o vê: as falas citam só ele. */
    documentNumber: text('document_number').notNull(),
    originChannel: text('origin_channel').$type<WhatsAppDeliveryPreparationChannel>().notNull(),
    status: text().$type<WhatsAppDeliveryPreparationStatus>().notNull().default('open'),
    /** A pergunta em aberto (`photo`, `cargo`, `received_by`, `receiver_name`, `location`, `confirm`). */
    awaiting: text(),
    photos: jsonb().$type<readonly WhatsAppDeliveryPreparationPhoto[]>().notNull().default([]),
    /** Os itens opcionais que o motorista pulou ou que o bot já ofereceu uma vez. */
    skipped: jsonb().$type<readonly string[]>().notNull().default([]),
    receivedBy: text('received_by').$type<ReceivedBy>(),
    receiverName: text('receiver_name'),
    latitude: numeric({ precision: 9, scale: 6 }),
    longitude: numeric({ precision: 9, scale: 6 }),
    locationCapturedAt: timestamp('location_captured_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_delivery_preparations_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'whatsapp_delivery_preparations_company_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'whatsapp_delivery_preparations_company_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    uniqueIndex('whatsapp_delivery_preparations_company_document_open_unique')
      .on(table.companyId, table.documentId)
      .where(sql`${table.status} = 'open'`),
    index('whatsapp_delivery_preparations_company_driver_status_idx').on(
      table.companyId,
      table.driverId,
      table.status,
    ),
    check(
      'whatsapp_delivery_preparations_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_DELIVERY_PREPARATION_STATUSES))})`,
    ),
    check(
      'whatsapp_delivery_preparations_channel_check',
      sql`${table.originChannel} in (${sql.raw(inList(WHATSAPP_DELIVERY_PREPARATION_CHANNELS))})`,
    ),
    check(
      'whatsapp_delivery_preparations_received_by_check',
      sql`${table.receivedBy} is null or ${table.receivedBy} in (${sql.raw(inList(RECEIVED_BY_OPTIONS))})`,
    ),
    check(
      'whatsapp_delivery_preparations_closed_check',
      sql`(${table.status} = 'open') = (${table.closedAt} is null)`,
    ),
    check(
      'whatsapp_delivery_preparations_location_check',
      sql`(${table.latitude} is null) = (${table.longitude} is null)`,
    ),
    check('whatsapp_delivery_preparations_version_check', sql`${table.version} >= 1`),
  ],
)
