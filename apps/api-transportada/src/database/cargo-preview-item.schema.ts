/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_PREVIEW_DECIDERS,
  CARGO_PREVIEW_ITEM_STATE,
  CARGO_PREVIEW_ITEM_STATES,
  type CargoPreviewDecidedBy,
  type CargoPreviewItemState,
} from '../shared/cargo-preview.constant.js'
import { cargoPreviewDocumentLinks } from './cargo-preview-link.schema.js'
import { cargoPreviews } from './cargo-preview.schema.js'
import { userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const quoted = (value: string): ReturnType<typeof sql.raw> => raw(`'${value}'`)
const withTimezone = { withTimezone: true } as const
const { invalid, matched } = CARGO_PREVIEW_ITEM_STATE

/**
 * Spec 237 RF5/RF5a: uma linha da prévia. A planilha não traz número de nota, chave nem emitente:
 * `contractor_reference` é o `Text001` do contratante. A linha vinculada aponta para o vínculo da
 * nota **desta** prévia (FK composta), e por ele herda o 1:1. `invalid` é a linha recusada pelo
 * leitor: só `row_number` e `row_error` (coluna e motivo, nunca o valor da célula).
 */
export const cargoPreviewItems = pgTable(
  'cargo_preview_items',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    previewId: uuid('preview_id').notNull(),
    rowNumber: integer('row_number').notNull(),
    routeName: text('route_name'),
    routingDate: date('routing_date', { mode: 'string' }),
    contractorReference: text('contractor_reference'),
    recipientCode: text('recipient_code'),
    recipientName: text('recipient_name'),
    weightKg: numeric('weight_kg', { precision: 12, scale: 3 }),
    volumeM3: numeric('volume_m3', { precision: 12, scale: 4 }),
    value: numeric({ precision: 14, scale: 2 }),
    address: text(),
    neighborhood: text(),
    city: text(),
    state: text(),
    postalCode: text('postal_code'),
    matchState: varchar('match_state', { length: 16 }).$type<CargoPreviewItemState>().notNull(),
    matchedDocumentId: uuid('matched_document_id'),
    /** As N linhas que fecham UMA nota (ou a sugerem) dividem a chave: a nota delas. */
    matchGroupKey: text('match_group_key'),
    /** Evidências do veredito e, na sugestão ou na ambiguidade, as notas candidatas. */
    matchEvidence: jsonb('match_evidence').$type<Readonly<Record<string, unknown>>>(),
    matchedAt: timestamp('matched_at', withTimezone),
    matchedBy: varchar('matched_by', { length: 16 }).$type<CargoPreviewDecidedBy>(),
    matchedByUserId: uuid('matched_by_user_id'),
    rowError: jsonb('row_error').$type<readonly Readonly<Record<string, unknown>>[]>(),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.previewId],
      foreignColumns: [cargoPreviews.companyId, cargoPreviews.id],
      name: 'cargo_preview_items_company_preview_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.previewId, table.matchedDocumentId],
      foreignColumns: [
        cargoPreviewDocumentLinks.companyId,
        cargoPreviewDocumentLinks.previewId,
        cargoPreviewDocumentLinks.documentId,
      ],
      name: 'cargo_preview_items_document_link_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.matchedByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cargo_preview_items_matched_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_preview_items_company_preview_row_unique').on(
      table.companyId,
      table.previewId,
      table.rowNumber,
    ),
    unique('cargo_preview_items_company_preview_id_unique').on(
      table.companyId,
      table.previewId,
      table.id,
    ),
    index('cargo_preview_items_company_document_idx')
      .on(table.companyId, table.matchedDocumentId)
      .where(sql`${table.matchedDocumentId} is not null`),
    index('cargo_preview_items_company_preview_state_idx').on(
      table.companyId,
      table.previewId,
      table.matchState,
    ),
    check('cargo_preview_items_row_number_check', sql`${table.rowNumber} > 0`),
    check(
      'cargo_preview_items_match_state_check',
      sql`${table.matchState} in (${raw(inList(CARGO_PREVIEW_ITEM_STATES))})`,
    ),
    check(
      'cargo_preview_items_matched_by_check',
      sql`${table.matchedBy} in (${raw(inList(CARGO_PREVIEW_DECIDERS))})`,
    ),
    check(
      'cargo_preview_items_matched_shape_check',
      sql`(${table.matchState} = ${quoted(matched)}) = (${table.matchedDocumentId} is not null)`,
    ),
    check(
      'cargo_preview_items_invalid_shape_check',
      sql`(${table.matchState} = ${quoted(invalid)}) = (${table.rowError} is not null)`,
    ),
    /** Item válido tem o mínimo do vínculo (RF5a): roteiro, valor e peso. */
    check(
      'cargo_preview_items_valid_fields_check',
      sql`${table.matchState} = ${quoted(invalid)} or (${table.routeName} is not null and ${table.value} is not null and ${table.weightKg} is not null)`,
    ),
    check(
      'cargo_preview_items_decision_shape_check',
      sql`(${table.matchedBy} is null) = (${table.matchedAt} is null) and (${table.matchedBy} = 'user') = (${table.matchedByUserId} is not null)`,
    ),
    check('cargo_preview_items_weight_kg_check', sql`${table.weightKg} >= 0`),
    check('cargo_preview_items_volume_m3_check', sql`${table.volumeM3} >= 0`),
    check('cargo_preview_items_value_check', sql`${table.value} >= 0`),
    check('cargo_preview_items_row_error_check', sql`jsonb_typeof(${table.rowError}) = 'array'`),
    check(
      'cargo_preview_items_match_evidence_check',
      sql`jsonb_typeof(${table.matchEvidence}) = 'object'`,
    ),
  ],
)
