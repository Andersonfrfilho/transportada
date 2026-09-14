/**
 * Copyright (c) 2026 Ada Technology. MIT License.
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { UNPLACED_REASONS } from '@adatechnology/cargo-placement'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { nfeDocuments } from './nfe.schema.js'
import { inList } from './schema-check.constant.js'
import { tripDocuments, trips } from './trip.schema.js'

/** Spec 148 T7 (D7): `pending` sai uma vez — para outro caminhão, numa troca, ou vinculada por outro caminho (D12). */
export const TRIP_DOCUMENT_REVIEW_STATUSES = ['pending', 'moved', 'swapped_in', 'relinked'] as const
export type TripDocumentReviewStatus = (typeof TRIP_DOCUMENT_REVIEW_STATUSES)[number]

export const SWAPPED_OUT_REASON = 'swapped_out'

/** O motivo do empacotador, mais a nota que saiu numa troca e voltou para a fila. */
export const TRIP_DOCUMENT_REVIEW_REASONS = [...UNPLACED_REASONS, SWAPPED_OUT_REASON] as const
export type TripDocumentReviewReason = (typeof TRIP_DOCUMENT_REVIEW_REASONS)[number]

/**
 * Spec 148 T7: a nota que não coube saiu da viagem (`trip_documents.released_at`, nunca apagada) e
 * espera destino aqui. ⚠️ `layout_id` não tem FK: a planta é derivada e o expurgo a apaga — a fila é
 * a prova histórica e não pode cair junto.
 */
export const tripDocumentReviews = pgTable(
  'trip_document_reviews',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    sourceTripId: uuid('source_trip_id').notNull(),
    sourceTripDocumentId: uuid('source_trip_document_id').notNull(),
    reason: text().$type<TripDocumentReviewReason>().notNull(),
    layoutId: uuid('layout_id'),
    inputHash: text('input_hash'),
    status: text().$type<TripDocumentReviewStatus>().notNull().default('pending'),
    resolutionTripId: uuid('resolution_trip_id'),
    resolutionTripDocumentId: uuid('resolution_trip_document_id'),
    swappedReviewId: uuid('swapped_review_id'),
    createdBy: uuid('created_by').notNull(),
    resolvedBy: uuid('resolved_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_document_reviews_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'trip_document_reviews_company_nfe_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.sourceTripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_document_reviews_company_source_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.sourceTripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'trip_document_reviews_company_source_trip_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.resolutionTripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_document_reviews_company_resolution_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.resolutionTripDocumentId],
      foreignColumns: [tripDocuments.companyId, tripDocuments.id],
      name: 'trip_document_reviews_company_resolution_trip_document_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.swappedReviewId],
      foreignColumns: [table.companyId, table.id],
      name: 'trip_document_reviews_company_swapped_review_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdBy, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_document_reviews_created_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.resolvedBy, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'trip_document_reviews_resolved_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_document_reviews_company_id_id_unique').on(table.companyId, table.id),
    unique('trip_document_reviews_company_source_trip_document_unique').on(
      table.companyId,
      table.sourceTripDocumentId,
    ),
    uniqueIndex('trip_document_reviews_pending_nfe_document_unique')
      .on(table.companyId, table.nfeDocumentId)
      .where(sql`${table.status} = 'pending'`),
    index('trip_document_reviews_company_source_trip_status_idx').on(
      table.companyId,
      table.sourceTripId,
      table.status,
    ),
    index('trip_document_reviews_company_layout_idx').on(table.companyId, table.layoutId),
    check(
      'trip_document_reviews_status_check',
      sql`${table.status} in (${sql.raw(inList(TRIP_DOCUMENT_REVIEW_STATUSES))})`,
    ),
    check(
      'trip_document_reviews_reason_check',
      sql`${table.reason} in (${sql.raw(inList(TRIP_DOCUMENT_REVIEW_REASONS))})`,
    ),
    check(
      'trip_document_reviews_resolution_check',
      sql`(${table.status} = 'pending') = (${table.resolvedAt} is null) and (${table.status} = 'pending') = (${table.resolutionTripId} is null)`,
    ),
    check(
      'trip_document_reviews_swap_check',
      sql`(${table.status} = 'swapped_in') = (${table.swappedReviewId} is not null)`,
    ),
    check(
      'trip_document_reviews_layout_check',
      sql`(${table.reason} = 'swapped_out') = (${table.layoutId} is null) and (${table.layoutId} is null) = (${table.inputHash} is null)`,
    ),
  ],
)
