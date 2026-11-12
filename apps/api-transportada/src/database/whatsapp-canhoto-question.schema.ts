/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { fleetDrivers } from './fleet.schema.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import {
  WHATSAPP_DELIVERY_PREPARATION_CHANNELS,
  type WhatsAppDeliveryPreparationChannel,
} from './whatsapp-delivery-preparation.schema.js'

/** `confirm_note`: "é da NF X?"; `choose_note`: "de qual nota é?"; `photo_kind`: "mercadoria, canhoto ou descartar?". */
export const WHATSAPP_CANHOTO_QUESTION_KINDS = [
  'confirm_note',
  'choose_note',
  'photo_kind',
] as const
export type WhatsAppCanhotoQuestionKind = (typeof WHATSAPP_CANHOTO_QUESTION_KINDS)[number]

export const WHATSAPP_CANHOTO_QUESTION_STATUSES = ['open', 'completed', 'cancelled'] as const
export type WhatsAppCanhotoQuestionStatus = (typeof WHATSAPP_CANHOTO_QUESTION_STATUSES)[number]

/** A nota que a pergunta oferece: só o id e o número como o motorista o vê (o texto lido nunca é guardado). */
export type WhatsAppCanhotoQuestionCandidate = {
  readonly city?: string
  readonly clientName?: string
  readonly documentId: string
  readonly documentNumber: string
  readonly label: string
  /** Spec 321 T4 (D4b): a nota é o canhoto retido de uma coleta encaixada na viagem; a foto vai pela coleta. */
  readonly pickupId?: string
}

/**
 * Spec 294 T4.8 (RF23): **a pergunta aberta sobre uma foto de canhoto que o bot não conseguiu ligar a uma
 * nota sozinho.** Uma por motorista (índice único parcial = RNF1: um fluxo não atrapalha o outro). A foto
 * espera no bucket privado até a resposta; depois vira o canhoto da nota escolhida ou é apagada. A leitura
 * do OCR (texto, dígitos) não é guardada: só a pergunta e as notas que ela oferece.
 */
export const whatsappCanhotoQuestions = pgTable(
  'whatsapp_canhoto_questions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    originChannel: text('origin_channel').$type<WhatsAppDeliveryPreparationChannel>().notNull(),
    kind: text().$type<WhatsAppCanhotoQuestionKind>().notNull(),
    status: text().$type<WhatsAppCanhotoQuestionStatus>().notNull().default('open'),
    candidates: jsonb().$type<readonly WhatsAppCanhotoQuestionCandidate[]>().notNull().default([]),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sha256: text().notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    providerMessageId: text('provider_message_id').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_canhoto_questions_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'whatsapp_canhoto_questions_company_driver_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    uniqueIndex('whatsapp_canhoto_questions_company_driver_open_unique')
      .on(table.companyId, table.driverId)
      .where(sql`${table.status} = 'open'`),
    index('whatsapp_canhoto_questions_company_driver_idx').on(table.companyId, table.driverId),
    check(
      'whatsapp_canhoto_questions_kind_check',
      sql`${table.kind} in (${sql.raw(inList(WHATSAPP_CANHOTO_QUESTION_KINDS))})`,
    ),
    check(
      'whatsapp_canhoto_questions_status_check',
      sql`${table.status} in (${sql.raw(inList(WHATSAPP_CANHOTO_QUESTION_STATUSES))})`,
    ),
    check(
      'whatsapp_canhoto_questions_channel_check',
      sql`${table.originChannel} in (${sql.raw(inList(WHATSAPP_DELIVERY_PREPARATION_CHANNELS))})`,
    ),
    check(
      'whatsapp_canhoto_questions_closed_check',
      sql`(${table.status} = 'open') = (${table.closedAt} is null)`,
    ),
  ],
)
