/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API (`user-whatsapp-phone.schema.ts`), **só as colunas que o envio
 * do resumo lê**. As duas apps não importam código uma da outra, e quem faz migration é a API —
 * aqui não há CHECK, FK nem unique declarados, porque nada disso é criado a partir deste arquivo.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const userWhatsAppPhones = pgTable('user_whatsapp_phones', {
  id: uuid().defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  phone: text().notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
})
