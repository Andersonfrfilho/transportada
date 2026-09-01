/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const COMPANY_CONTACT_KINDS = ['phone', 'email'] as const
export type CompanyContactKind = (typeof COMPANY_CONTACT_KINDS)[number]

/**
 * Catálogo fechado: é dele que saem o ícone e a ordem de exibição. URL livre com rótulo digitado
 * faria a mesma rede virar "Insta", "instagram" e "INSTAGRAM" em três empresas diferentes.
 */
export const COMPANY_SOCIAL_NETWORKS = [
  'website',
  'instagram',
  'facebook',
  'linkedin',
  'youtube',
  'tiktok',
  'x',
] as const
export type CompanySocialNetwork = (typeof COMPANY_SOCIAL_NETWORKS)[number]

const CONTACT_KIND_LIST = sql.raw(COMPANY_CONTACT_KINDS.map((kind) => `'${kind}'`).join(', '))
const SOCIAL_NETWORK_LIST = sql.raw(
  COMPANY_SOCIAL_NETWORKS.map((network) => `'${network}'`).join(', '),
)

/**
 * Telefone e e-mail de contato da empresa, na ordem em que o operador quer que apareçam.
 *
 * ⚠️ Isto **não substitui** `company_fiscal_profiles.phone/email`: aquele é o contato fiscal, que
 * vai no CT-e e é um só por CNPJ. Estes são os de atendimento, e são vários por natureza.
 */
export const companyContacts = pgTable(
  'company_contacts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    kind: text().$type<CompanyContactKind>().notNull(),
    /** Telefone só com dígitos (DDI opcional); e-mail na forma que se digita. */
    value: text().notNull(),
    /** Rótulo livre — "Comercial", "Financeiro". Vazio é o caso comum de quem tem um número só. */
    label: text().notNull().default(''),
    /** A marca que decide o link `wa.me`. E-mail nunca é WhatsApp, e o CHECK amarra isso. */
    isWhatsapp: boolean('is_whatsapp').notNull().default(false),
    position: integer().notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('company_contacts_kind_check', sql`${table.kind} in (${CONTACT_KIND_LIST})`),
    check(
      'company_contacts_whatsapp_check',
      sql`${table.kind} = 'phone' or ${table.isWhatsapp} = false`,
    ),
    /** Dez a treze dígitos cobre fixo com DDD e celular com DDI, sem aceitar máscara. */
    check(
      'company_contacts_value_check',
      sql`(${table.kind} = 'phone' and ${table.value} ~ '^[0-9]{10,13}$') or (${table.kind} = 'email' and ${table.value} ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')`,
    ),
    check('company_contacts_position_check', sql`${table.position} >= 0`),
    unique('company_contacts_company_kind_value_unique').on(
      table.companyId,
      table.kind,
      table.value,
    ),
    index('company_contacts_company_position_idx').on(table.companyId, table.position),
  ],
)

/** Um perfil por rede e por empresa: duas contas de Instagram na mesma lista é engano de digitação. */
export const companySocialLinks = pgTable(
  'company_social_links',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    network: text().$type<CompanySocialNetwork>().notNull(),
    url: text().notNull(),
    position: integer().notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('company_social_links_network_check', sql`${table.network} in (${SOCIAL_NETWORK_LIST})`),
    /** `https` e nada mais: link de perfil em `http` numa página servida por `https` é aviso do navegador. */
    check('company_social_links_url_check', sql`${table.url} ~ '^https://[^[:space:]]+$'`),
    check('company_social_links_position_check', sql`${table.position} >= 0`),
    unique('company_social_links_company_network_unique').on(table.companyId, table.network),
  ],
)

export type CompanyContactRow = typeof companyContacts.$inferSelect
export type CompanySocialLinkRow = typeof companySocialLinks.$inferSelect
