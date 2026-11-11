/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316: o vendedor da contratante. É **pessoa**, não contato de e-mail (150): tem nome, canais (e-mail e/ou WhatsApp)
 * e, no futuro, uma conta (`membership_id`, T3.1). Um vendedor liga a várias contratantes (`..._links`) e, em cada
 * ligação, atende vários clientes de entrega (`..._clients`, a carteira). Um cliente pode ter vários vendedores.
 *
 * ⚠️ As chaves estrangeiras levam `company_id` junto (mesmo raciocínio de `contractor_portal_bindings`, ADR-0050): a FK
 * simples aceitaria ligar o vendedor de uma empresa à contratante de outra, porque as duas linhas existem de verdade.
 * `tax_id` do cliente é dado de pessoa quando é CPF: nunca em log.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { contractors, deliveryClients } from './delivery-client.schema.js'
import { companies } from './identity.schema.js'

export const SALESPERSON_STATUSES = ['active', 'inactive'] as const
export type SalespersonStatus = (typeof SALESPERSON_STATUSES)[number]

export const contractorSalespeople = pgTable(
  'contractor_salespeople',
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    /** Em minúsculas; nulo quando o vendedor só tem WhatsApp. */
    email: text(),
    /** E.164 (`+5511999998888`); nulo quando o vendedor só tem e-mail. */
    whatsappE164: text('whatsapp_e164'),
    /** `toWhatsAppPhoneKey`: o mesmo celular com e sem o nono dígito cai na mesma chave. */
    whatsappPhoneKey: text('whatsapp_phone_key'),
    status: text().$type<SalespersonStatus>().notNull().default('active'),
    /** Conta de acesso do vendedor (T3.1). Referência sem FK por ora; a FK composta entra com o convite. */
    membershipId: uuid('membership_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Rastro de quem decidiu; sem FK de propósito, como nas outras configurações. */
    updatedByUserId: uuid('updated_by_user_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_salespeople_company_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_salespeople_company_id_id_unique').on(table.companyId, table.id),
    unique('contractor_salespeople_company_email_unique').on(table.companyId, table.email),
    unique('contractor_salespeople_company_phone_key_unique').on(
      table.companyId,
      table.whatsappPhoneKey,
    ),
    check('contractor_salespeople_name_check', sql`length(btrim(${table.name})) between 1 and 120`),
    check('contractor_salespeople_status_check', sql`${table.status} in ('active', 'inactive')`),
    check(
      'contractor_salespeople_channel_check',
      sql`${table.email} is not null or ${table.whatsappE164} is not null`,
    ),
    check(
      'contractor_salespeople_whatsapp_check',
      sql`(${table.whatsappE164} is null) = (${table.whatsappPhoneKey} is null)`,
    ),
  ],
)

export const contractorSalespersonLinks = pgTable(
  'contractor_salesperson_links',
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    salespersonId: uuid('salesperson_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.salespersonId],
      foreignColumns: [contractorSalespeople.companyId, contractorSalespeople.id],
      name: 'contractor_salesperson_links_salesperson_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'contractor_salesperson_links_contractor_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('contractor_salesperson_links_company_id_id_unique').on(table.companyId, table.id),
    unique('contractor_salesperson_links_pair_unique').on(table.salespersonId, table.contractorId),
    index('contractor_salesperson_links_contractor_idx').on(table.companyId, table.contractorId),
  ],
)

export const contractorSalespersonClients = pgTable(
  'contractor_salesperson_clients',
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    linkId: uuid('link_id').notNull(),
    /** Cliente de entrega (`delivery_clients.tax_id`). */
    taxId: text('tax_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.linkId],
      foreignColumns: [contractorSalespersonLinks.companyId, contractorSalespersonLinks.id],
      name: 'contractor_salesperson_clients_link_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.taxId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.taxId],
      name: 'contractor_salesperson_clients_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('contractor_salesperson_clients_link_tax_id_unique').on(table.linkId, table.taxId),
    index('contractor_salesperson_clients_client_idx').on(table.companyId, table.taxId),
  ],
)
