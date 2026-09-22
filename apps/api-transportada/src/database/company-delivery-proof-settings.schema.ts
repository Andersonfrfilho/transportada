/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

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
    /**
     * ADR-0069 §6: a leitura do número do canhoto pela foto é experimental e nasce desligada. É da
     * empresa, não do destinatário — por isso não existe na tabela de exceções.
     */
    canhotoOcrEnabled: boolean('canhoto_ocr_enabled').notNull().default(false),
    /**
     * ADR-0070 §3-5, spec 159 RF7: parâmetros da nota do motorista — só na configuração geral, a
     * exceção por CNPJ (`deliveryProofSettingOverrides` abaixo) não os carrega, porque a regra é da
     * empresa, não do destinatário.
     */
    proofWindowMinutes: integer('proof_window_minutes').notNull().default(60),
    proofRadiusMeters: integer('proof_radius_meters').notNull().default(300),
    latePenaltyPoints: integer('late_penalty_points').notNull().default(5),
    missingPenaltyPoints: integer('missing_penalty_points').notNull().default(10),
    missingAfterHours: integer('missing_after_hours').notNull().default(24),
    /**
     * Spec 159 T11 (decisão D1 do usuário, sem retroatividade): a nota do motorista só conta
     * entrega a partir daqui. A migration grava o instante dela em toda linha existente e cria a
     * linha de fábrica para empresa que ainda não tinha — empresa criada depois nasce sem entrega
     * anterior à regra, e sem linha não há corte. O `PUT` da configuração nunca o altera.
     */
    scoreEffectiveSince: timestamp('score_effective_since', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    check(
      'company_delivery_proof_settings_proof_window_minutes_check',
      sql`${table.proofWindowMinutes} between 5 and 1440`,
    ),
    check(
      'company_delivery_proof_settings_proof_radius_meters_check',
      sql`${table.proofRadiusMeters} between 50 and 5000`,
    ),
    check(
      'company_delivery_proof_settings_late_penalty_points_check',
      sql`${table.latePenaltyPoints} between 0 and 100`,
    ),
    check(
      'company_delivery_proof_settings_missing_penalty_points_check',
      sql`${table.missingPenaltyPoints} between 0 and 100`,
    ),
    check(
      'company_delivery_proof_settings_missing_after_hours_check',
      sql`${table.missingAfterHours} between 1 and 168`,
    ),
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
