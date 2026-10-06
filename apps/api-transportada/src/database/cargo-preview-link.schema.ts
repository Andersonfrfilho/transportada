/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_PREVIEW_DECIDERS,
  CARGO_PREVIEW_ROUTE_LOAD_ORIGINS,
  type CargoPreviewDecidedBy,
  type CargoPreviewRouteLoadOrigin,
} from '../shared/cargo-preview.constant.js'
import { cargoPreviews } from './cargo-preview.schema.js'
import { userCompanyMemberships } from './identity.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const withTimezone = { withTimezone: true } as const

/**
 * Spec 237 RF5a item 5 (1:1 por nota): a nota vinculada a uma prévia. `unique (company_id,
 * document_id)` é a garantia do banco de que uma nota nunca está em duas prévias; as N linhas que
 * fecham a mesma nota apontam todas para esta linha (FK do item), por isso a regra não pode morar
 * num unique do item. Desvincular apaga a linha e devolve a nota ao conjunto livre.
 */
export const cargoPreviewDocumentLinks = pgTable(
  'cargo_preview_document_links',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    previewId: uuid('preview_id').notNull(),
    documentId: uuid('document_id').notNull(),
    linkedBy: varchar('linked_by', { length: 16 }).$type<CargoPreviewDecidedBy>().notNull(),
    linkedByUserId: uuid('linked_by_user_id'),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.previewId],
      foreignColumns: [cargoPreviews.companyId, cargoPreviews.id],
      name: 'cargo_preview_document_links_company_preview_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'cargo_preview_document_links_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.linkedByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cargo_preview_document_links_linked_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_preview_document_links_company_document_unique').on(
      table.companyId,
      table.documentId,
    ),
    unique('cargo_preview_document_links_company_preview_document_unique').on(
      table.companyId,
      table.previewId,
      table.documentId,
    ),
    check(
      'cargo_preview_document_links_linked_by_check',
      sql`${table.linkedBy} in (${raw(inList(CARGO_PREVIEW_DECIDERS))})`,
    ),
    check(
      'cargo_preview_document_links_actor_check',
      sql`(${table.linkedBy} = 'user') = (${table.linkedByUserId} is not null)`,
    ),
  ],
)

/**
 * RF5a nível 1: roteiro da planilha ↔ `NroCarga` do XML, 1:1 e só nesta prévia — o `NroCarga` é novo
 * a cada dia e o `RouteName` se repete, então o par nunca vale para outra prévia.
 */
export const cargoPreviewRouteLoads = pgTable(
  'cargo_preview_route_loads',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    previewId: uuid('preview_id').notNull(),
    routeName: text('route_name').notNull(),
    loadReference: text('load_reference').notNull(),
    origin: varchar('origin', { length: 16 }).$type<CargoPreviewRouteLoadOrigin>().notNull(),
    createdAt: timestamp('created_at', withTimezone).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.previewId],
      foreignColumns: [cargoPreviews.companyId, cargoPreviews.id],
      name: 'cargo_preview_route_loads_company_preview_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cargo_preview_route_loads_preview_route_unique').on(
      table.companyId,
      table.previewId,
      table.routeName,
    ),
    unique('cargo_preview_route_loads_preview_load_unique').on(
      table.companyId,
      table.previewId,
      table.loadReference,
    ),
    check(
      'cargo_preview_route_loads_route_name_check',
      sql`char_length(${table.routeName}) between 1 and 60`,
    ),
    check(
      'cargo_preview_route_loads_load_reference_check',
      sql`char_length(${table.loadReference}) between 1 and 200`,
    ),
    check(
      'cargo_preview_route_loads_origin_check',
      sql`${table.origin} in (${raw(inList(CARGO_PREVIEW_ROUTE_LOAD_ORIGINS))})`,
    ),
  ],
)
