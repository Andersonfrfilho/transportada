/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API (`whatsapp-channel.schema.ts`), **só as colunas que o envio
 * lê**. As duas apps não importam código uma da outra, e quem faz migration é a API — aqui não há
 * CHECK, FK nem unique declarados, porque nada disso é criado a partir deste arquivo.
 */
import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const WHATSAPP_CHANNEL_STATUSES = ['active', 'disabled'] as const
export type WhatsAppChannelStatus = (typeof WHATSAPP_CHANNEL_STATUSES)[number]

export const whatsappChannels = pgTable('whatsapp_channels', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  phoneNumberId: text('phone_number_id').notNull(),
  secretEnvelope: jsonb('secret_envelope').notNull(),
  status: text().$type<WhatsAppChannelStatus>().notNull().default('active'),
})
