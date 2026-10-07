/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  check,
  foreignKey,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { contractors } from './delivery-client.schema.js'
import { companies } from './identity.schema.js'

/**
 * ADR-0094 §2 (spec 237 RF1): as regras de recebimento de um contratante são dado, nunca código por
 * CNPJ. Sem linha, ou com `is_enabled = false`, o contratante segue o fluxo de hoje (ADR-0048).
 * As regras são nulas até alguém defini-las; `match_window_days` e `weight_tolerance_percent` são
 * parâmetros do algoritmo de vínculo, por isso têm padrão.
 */
export const contractorReceivingProfiles = pgTable(
  'contractor_receiving_profiles',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    contractorId: uuid('contractor_id').notNull(),
    isEnabled: boolean('is_enabled').notNull().default(false),
    separationWindowHours: smallint('separation_window_hours'),
    /** Lido pela spec 236; a chegada copia o valor no registro, o perfil não age sobre chegada aberta. */
    deliveryDeadlineBusinessDays: smallint('delivery_deadline_business_days'),
    matchWindowDays: smallint('match_window_days').notNull().default(15),
    weightTolerancePercent: numeric('weight_tolerance_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    previewEnabled: boolean('preview_enabled').notNull().default(false),
    previewSheetName: text('preview_sheet_name'),
    /** Nome de coluna da planilha → campo do item; o formato é validado na fronteira (Zod). */
    previewColumnMap: jsonb('preview_column_map').$type<Readonly<Record<string, string>>>(),
    /** Deprecada pela revisão de segurança S3 (expressão do usuário); sem leitor nem escritor. */
    arrivalReferencePattern: text('arrival_reference_pattern'),
    /** O texto literal que antecede o número da carga no `infCpl` (ex.: `NroCarga:`). */
    arrivalReferenceLabel: text('arrival_reference_label'),
    requiresDamageCheck: boolean('requires_damage_check').notNull().default(false),
    /**
     * Spec 237 T4.6 (ADR-0094 §10): o hash do token do endereço de entrada da prévia por e-mail
     * encaminhado. O token em si nunca é guardado; sem hash, o contratante não recebe prévia por e-mail.
     */
    previewInboundTokenHash: char('preview_inbound_token_hash', { length: 64 }),
    /** Quem encaminha (a equipe): endereço exato, minúsculo. */
    previewForwarderAllowlist: text('preview_forwarder_allowlist').array(),
    /** O remetente original do contratante, lido do cabeçalho: endereço exato ou domínio. */
    previewSenderAllowlist: text('preview_sender_allowlist').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractor_receiving_profiles_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.contractorId],
      foreignColumns: [contractors.companyId, contractors.id],
      name: 'contractor_receiving_profiles_company_id_contractor_id_contractors_company_id_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractor_receiving_profiles_company_contractor_unique').on(
      table.companyId,
      table.contractorId,
    ),
    check(
      'contractor_receiving_profiles_separation_window_hours_check',
      sql`${table.separationWindowHours} between 1 and 168`,
    ),
    check(
      'contractor_receiving_profiles_delivery_deadline_business_days_check',
      sql`${table.deliveryDeadlineBusinessDays} between 1 and 60`,
    ),
    check(
      'contractor_receiving_profiles_match_window_days_check',
      sql`${table.matchWindowDays} between 1 and 60`,
    ),
    check(
      'contractor_receiving_profiles_weight_tolerance_percent_check',
      sql`${table.weightTolerancePercent} between 0 and 100`,
    ),
    check(
      'contractor_receiving_profiles_preview_sheet_name_check',
      sql`char_length(${table.previewSheetName}) between 1 and 31`,
    ),
    check(
      'contractor_receiving_profiles_preview_column_map_check',
      sql`jsonb_typeof(${table.previewColumnMap}) = 'object'`,
    ),
    /** Prévia ligada sem mapa é prévia que o worker nunca vai conseguir ler. */
    check(
      'contractor_receiving_profiles_preview_requires_column_map_check',
      sql`not ${table.previewEnabled} or ${table.previewColumnMap} is not null`,
    ),
    check(
      'contractor_receiving_profiles_arrival_reference_pattern_check',
      sql`char_length(${table.arrivalReferencePattern}) between 1 and 200`,
    ),
    check(
      'contractor_receiving_profiles_preview_inbound_token_hash_check',
      sql`${table.previewInboundTokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'contractor_receiving_profiles_preview_forwarder_allowlist_check',
      sql`cardinality(${table.previewForwarderAllowlist}) between 1 and 20 and char_length(array_to_string(${table.previewForwarderAllowlist}, '|')) <= 5100 and array_to_string(${table.previewForwarderAllowlist}, '|') !~ '[[:cntrl:][:space:],<>]'`,
    ),
    check(
      'contractor_receiving_profiles_preview_sender_allowlist_check',
      sql`cardinality(${table.previewSenderAllowlist}) between 1 and 20 and char_length(array_to_string(${table.previewSenderAllowlist}, '|')) <= 5100 and array_to_string(${table.previewSenderAllowlist}, '|') !~ '[[:cntrl:][:space:],<>]'`,
    ),
    /** Token sem as duas listas abriria a entrada a qualquer remetente: o banco recusa. */
    check(
      'contractor_receiving_profiles_preview_inbound_allowlists_check',
      sql`${table.previewInboundTokenHash} is null or (${table.previewForwarderAllowlist} is not null and ${table.previewSenderAllowlist} is not null)`,
    ),
    uniqueIndex('contractor_receiving_profiles_company_inbound_token_unique')
      .on(table.companyId, table.previewInboundTokenHash)
      .where(sql`${table.previewInboundTokenHash} is not null`),
    check(
      'contractor_receiving_profiles_arrival_reference_label_check',
      sql`char_length(${table.arrivalReferenceLabel}) between 1 and 60 and ${table.arrivalReferenceLabel} !~ '[[:cntrl:]]'`,
    ),
  ],
)
