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
import { companyOccurrenceTypes, tripDocuments } from './trip.schema.js'
import {
  WHATSAPP_DELIVERY_PREPARATION_CHANNELS,
  WHATSAPP_DELIVERY_PREPARATION_STATUSES,
  type WhatsAppDeliveryPreparationChannel,
  type WhatsAppDeliveryPreparationStatus,
} from './whatsapp-delivery-preparation.schema.js'

/** A foto já confirmada como upload de ocorrência (`trip_occurrence_uploads`), à espera do registro. */
export type WhatsAppOccurrenceDraftPhoto = {
  /** O id da mensagem no provedor: a mesma foto reentregue não conta duas vezes. */
  readonly providerMessageId: string
  /** O upload confirmado que o registro referencia (`attachmentObjectIds`). */
  readonly uploadId: string
}

/**
 * Spec 293 T15 (desenho 3.4): **a ocorrência em coleta.** O tipo escolhido pelo WhatsApp pede foto,
 * número do documento do cliente ou valor pago (exigência efetiva da nota, spec 246/247): em vez de
 * recusar com "registre pelo aplicativo", o bot colhe o que falta e só então registra pela mesma
 * `registerDriverOccurrence` do app. Uma aberta por motorista: a foto que chega no grupo ou no
 * individual sabe para onde ir.
 *
 * A observação é do motorista e vira a ocorrência; fica aqui só até o registro. As fotos já são uploads
 * confirmados de ocorrência (mesma conferência de tipo e tamanho do app).
 */
export const whatsappOccurrenceDrafts = pgTable(
  'whatsapp_occurrence_drafts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    occurrenceTypeId: uuid('occurrence_type_id').notNull(),
    documentNumber: text('document_number').notNull(),
    originChannel: text('origin_channel').$type<WhatsAppDeliveryPreparationChannel>().notNull(),
    status: text().$type<WhatsAppDeliveryPreparationStatus>().notNull().default('open'),
    note: text().notNull().default(''),
    /** A pergunta em aberto (`photo`, `reference_number`, `declared_amount`). */
    awaiting: text(),
    photos: jsonb().$type<readonly WhatsAppOccurrenceDraftPhoto[]>().notNull().default([]),
    /** Os itens opcionais que o motorista pulou. */
    skipped: jsonb().$type<readonly string[]>().notNull().default([]),
    referenceNumber: text('reference_number'),
    declaredAmount: numeric('declared_amount', { precision: 14, scale: 2 }),
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
      name: 'whatsapp_occurrence_drafts_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'whatsapp_occurrence_drafts_company_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'whatsapp_occurrence_drafts_company_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.occurrenceTypeId],
      foreignColumns: [companyOccurrenceTypes.companyId, companyOccurrenceTypes.id],
      name: 'whatsapp_occurrence_drafts_company_type_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    uniqueIndex('whatsapp_occurrence_drafts_company_driver_open_unique')
      .on(table.companyId, table.driverId)
      .where(sql`${table.status} = 'open'`),
    index('whatsapp_occurrence_drafts_company_document_idx').on(table.companyId, table.documentId),
    check(
      'whatsapp_occurrence_drafts_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_DELIVERY_PREPARATION_STATUSES))})`,
    ),
    check(
      'whatsapp_occurrence_drafts_channel_check',
      sql`${table.originChannel} in (${sql.raw(inList(WHATSAPP_DELIVERY_PREPARATION_CHANNELS))})`,
    ),
    check(
      'whatsapp_occurrence_drafts_closed_check',
      sql`(${table.status} = 'open') = (${table.closedAt} is null)`,
    ),
    check(
      'whatsapp_occurrence_drafts_location_check',
      sql`(${table.latitude} is null) = (${table.longitude} is null)`,
    ),
    check(
      'whatsapp_occurrence_drafts_declared_amount_check',
      sql`${table.declaredAmount} is null or ${table.declaredAmount} >= 0`,
    ),
    check('whatsapp_occurrence_drafts_version_check', sql`${table.version} >= 1`),
  ],
)
