/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, foreignKey, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * ADR-0057 §1: cada campo do comprovante tem três estados, decididos pelo painel — nunca pelo
 * código. `off` não renderiza, `optional` oferece, `required` bloqueia o confirmar sem ele.
 */
export const DELIVERY_PROOF_FIELD_MODES = ['required', 'optional', 'off'] as const
export type DeliveryProofFieldMode = (typeof DELIVERY_PROOF_FIELD_MODES)[number]

/** O mesmo padrão dos destinatários: CPF de onze dígitos ou CNPJ alfanumérico de quatorze. */
const TAX_ID_CHECK_PATTERN = '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)

const MODE_LIST = (): ReturnType<typeof sql.raw> => raw(inList(DELIVERY_PROOF_FIELD_MODES))

/**
 * ADR-0057: a configuração geral do comprovante, por empresa. Uma linha por tenant, criada sob
 * demanda — ausência de linha é o padrão de fábrica (`receiver_document = off`, o resto `optional`).
 */
export const companyDeliveryProofSettings = pgTable(
  'company_delivery_proof_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    receiverName: text('receiver_name')
      .notNull()
      .default('optional')
      .$type<DeliveryProofFieldMode>(),
    /** ADR-0057 §4: colher documento é escolha explícita — instalação nova nasce com `off`. */
    receiverDocument: text('receiver_document')
      .notNull()
      .default('off')
      .$type<DeliveryProofFieldMode>(),
    signature: text().notNull().default('optional').$type<DeliveryProofFieldMode>(),
    photo: text().notNull().default('optional').$type<DeliveryProofFieldMode>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_delivery_proof_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'company_delivery_proof_settings_receiver_name_check',
      sql`${table.receiverName} in (${MODE_LIST()})`,
    ),
    check(
      'company_delivery_proof_settings_receiver_document_check',
      sql`${table.receiverDocument} in (${MODE_LIST()})`,
    ),
    check(
      'company_delivery_proof_settings_signature_check',
      sql`${table.signature} in (${MODE_LIST()})`,
    ),
    check('company_delivery_proof_settings_photo_check', sql`${table.photo} in (${MODE_LIST()})`),
  ],
)

/**
 * A exceção por CNPJ do destinatário — o contratante que exige documento no comprovante enquanto o
 * resto da operação dispensa. A linha vence a geral **por inteiro**: meia-exceção obrigaria o
 * operador a raciocinar campo a campo sobre duas telas.
 */
export const deliveryProofSettingOverrides = pgTable(
  'delivery_proof_setting_overrides',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    /** Forma canônica, sem máscara e em caixa alta — o mesmo corte de `delivery_clients`. */
    taxId: text('tax_id').notNull(),
    receiverName: text('receiver_name')
      .notNull()
      .default('optional')
      .$type<DeliveryProofFieldMode>(),
    receiverDocument: text('receiver_document')
      .notNull()
      .default('off')
      .$type<DeliveryProofFieldMode>(),
    signature: text().notNull().default('optional').$type<DeliveryProofFieldMode>(),
    photo: text().notNull().default('optional').$type<DeliveryProofFieldMode>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'delivery_proof_setting_overrides_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('delivery_proof_setting_overrides_company_tax_id_unique').on(
      table.companyId,
      table.taxId,
    ),
    check(
      'delivery_proof_setting_overrides_tax_id_check',
      sql`${table.taxId} ~ ${raw(`'${TAX_ID_CHECK_PATTERN}'`)}`,
    ),
    check(
      'delivery_proof_setting_overrides_receiver_name_check',
      sql`${table.receiverName} in (${MODE_LIST()})`,
    ),
    check(
      'delivery_proof_setting_overrides_receiver_document_check',
      sql`${table.receiverDocument} in (${MODE_LIST()})`,
    ),
    check(
      'delivery_proof_setting_overrides_signature_check',
      sql`${table.signature} in (${MODE_LIST()})`,
    ),
    check('delivery_proof_setting_overrides_photo_check', sql`${table.photo} in (${MODE_LIST()})`),
  ],
)
