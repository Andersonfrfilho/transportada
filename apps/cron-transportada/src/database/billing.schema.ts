/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `api-transportada/src/database/billing.schema.ts`, só as colunas que o
 * aviso de vencimento lê. Quem faz migration é a API.
 */
import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type BillingInvoiceStatus = 'cancelled' | 'issued'

export const billingInvoices = pgTable('billing_invoices', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  invoiceNumber: bigint('invoice_number', { mode: 'bigint' }).notNull(),
  status: text().$type<BillingInvoiceStatus>().notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
})
