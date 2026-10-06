/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor das tabelas da prévia (`api-transportada/src/database/cargo-preview*.schema.ts`),
 * só com as colunas — os CHECKs, as FKs de tenant e o unique `(company_id, document_id)` do vínculo
 * são da migration da API. O worker lê a prévia e escreve itens, vínculos e pares; mudou lá? confira
 * aqui (o contrato de paridade cobra as colunas).
 */
import {
  char,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import type {
  CargoPreviewDecidedBy,
  CargoPreviewFailureCode,
  CargoPreviewItemState,
  CargoPreviewRouteLoadOrigin,
  CargoPreviewStatus,
} from '../shared/cargo-preview.constant.js'

const withTimezone = { withTimezone: true } as const

export const cargoPreviews = pgTable('cargo_previews', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  contractorId: uuid('contractor_id').notNull(),
  source: varchar('source', { length: 16 }).notNull(),
  status: varchar('status', { length: 16 }).$type<CargoPreviewStatus>().notNull(),
  receivedAt: timestamp('received_at', withTimezone).notNull(),
  fileName: text('file_name').notNull(),
  fileSha256: char('file_sha256', { length: 64 }).notNull(),
  fileObjectId: uuid('file_object_id').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  sheetName: text('sheet_name'),
  plannedDate: date('planned_date', { mode: 'string' }),
  rowCount: integer('row_count'),
  errorCode: varchar('error_code', { length: 40 }).$type<CargoPreviewFailureCode>(),
  updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
})

export const cargoPreviewItems = pgTable('cargo_preview_items', {
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
  matchGroupKey: text('match_group_key'),
  matchEvidence: jsonb('match_evidence').$type<Readonly<Record<string, unknown>>>(),
  matchedAt: timestamp('matched_at', withTimezone),
  matchedBy: varchar('matched_by', { length: 16 }).$type<CargoPreviewDecidedBy>(),
  matchedByUserId: uuid('matched_by_user_id'),
  rowError: jsonb('row_error').$type<readonly Readonly<Record<string, unknown>>[]>(),
  updatedAt: timestamp('updated_at', withTimezone).notNull().defaultNow(),
})

export const cargoPreviewDocumentLinks = pgTable('cargo_preview_document_links', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  previewId: uuid('preview_id').notNull(),
  documentId: uuid('document_id').notNull(),
  linkedBy: varchar('linked_by', { length: 16 }).$type<CargoPreviewDecidedBy>().notNull(),
  linkedByUserId: uuid('linked_by_user_id'),
})

export const cargoPreviewRouteLoads = pgTable('cargo_preview_route_loads', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  previewId: uuid('preview_id').notNull(),
  routeName: text('route_name').notNull(),
  loadReference: text('load_reference').notNull(),
  origin: varchar('origin', { length: 16 }).$type<CargoPreviewRouteLoadOrigin>().notNull(),
})
