/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { TAX_ID_PATTERN } from '../shared/tax-id.service.js'
import { fleetDrivers } from './fleet.schema.js'
import { storedObjects } from './storage.schema.js'
import { companies } from './identity.schema.js'

export const AGGREGATE_APPLICATION_STATUSES = ['pending', 'approved', 'rejected'] as const
export type AggregateApplicationStatus = (typeof AGGREGATE_APPLICATION_STATUSES)[number]

/**
 * A candidatura do agregado, criada anonimamente pela landing (T007). `duplicateDriverId` e
 * `resubmittedAt`/`latestSubmission` são a checagem de existência da T006: reenvio não duplica
 * linha, e documento já motorista na raiz do grupo fica marcado sem recusar sozinho — quem decide
 * é sempre o operador.
 */
export const aggregateApplications = pgTable(
  'aggregate_applications',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: text('tax_id').notNull(),
    name: text().notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    /** Campos declarados além da identidade (endereço, veículo) — a forma vem da T011. */
    declaredData: jsonb('declared_data').notNull().default({}),
    status: text().$type<AggregateApplicationStatus>().notNull().default('pending'),
    rejectionReason: text('rejection_reason').notNull().default(''),
    driverId: uuid('driver_id'),
    duplicateDriverId: uuid('duplicate_driver_id'),
    resubmittedAt: timestamp('resubmitted_at', { withTimezone: true }),
    latestSubmission: jsonb('latest_submission'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'aggregate_applications_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.driverId],
      foreignColumns: [fleetDrivers.id],
      name: 'aggregate_applications_driver_id_fleet_drivers_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.duplicateDriverId],
      foreignColumns: [fleetDrivers.id],
      name: 'aggregate_applications_duplicate_driver_id_fleet_drivers_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    // Parcial: só uma candidatura pendente por documento e empresa — aprovada/recusada não colide
    // com um reenvio novo, e reenvio de uma pendente atualiza a mesma linha em vez de duplicar.
    uniqueIndex('aggregate_applications_company_tax_id_pending_unique')
      .on(table.companyId, table.taxId)
      .where(sql`${table.status} = 'pending'`),
    check(
      'aggregate_applications_status_check',
      sql`${table.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      'aggregate_applications_tax_id_check',
      sql`${table.taxId} ~ ${sql.raw(`'${TAX_ID_PATTERN.source}'`)}`,
    ),
    check(
      'aggregate_applications_rejection_reason_check',
      sql`${table.status} <> 'rejected' or length(${table.rejectionReason}) > 0`,
    ),
  ],
)

export type AggregateApplicationRow = typeof aggregateApplications.$inferSelect
export type NewAggregateApplicationRow = typeof aggregateApplications.$inferInsert

export const AGGREGATE_APPLICATION_ATTACHMENT_TYPES = ['ccmei', 'cnh', 'crlv', 'other'] as const
export type AggregateApplicationAttachmentType =
  (typeof AGGREGATE_APPLICATION_ATTACHMENT_TYPES)[number]

/**
 * Anexo enviado pela landing **antes** do envio do formulário, por gente anônima.
 *
 * `draft_id` existe separado do `id` de propósito: ele é o único identificador que viaja para um
 * cliente não autenticado, e manter a chave primária fora da mão de terceiro é o mesmo instinto do
 * código de `password_resets`. Um rascunho, uma linha — o `unique` garante que o mesmo identificador
 * nunca aponte para duas.
 *
 * `application_id` nasce nulo: quem anexa ainda está preenchendo. O submit é que amarra os
 * rascunhos à candidatura (T024), e é lá que a empresa do rascunho é conferida contra a do envio —
 * `draft_id` é global, então um rascunho de outra empresa não pode entrar de carona.
 *
 * ⚠️ **Sem `expires_at`, por decisão de 2026-08-27**: o rascunho é guardado até alguém removê-lo,
 * porque ele é o comprovante do que o motorista digitou. O `plan.md` previa expiração automática e
 * um job para ela; os dois saíram. A consequência está escrita na spec — PII sem prazo de descarte
 * torna a ADR-0039 mais urgente, não menos.
 */
export const aggregateApplicationAttachments = pgTable(
  'aggregate_application_attachments',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    draftId: uuid('draft_id').notNull().defaultRandom(),
    applicationId: uuid('application_id'),
    type: text().$type<AggregateApplicationAttachmentType>().notNull(),
    storedObjectId: uuid('stored_object_id').notNull(),
    /** O que a leitura do servidor extraiu, para o operador comparar com o que foi declarado. */
    extractedFields: jsonb('extracted_fields'),
    status: text().$type<AggregateApplicationStatus>().notNull().default('pending'),
    rejectionReason: text('rejection_reason').notNull().default(''),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'aggregate_application_attachments_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.storedObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'aggregate_application_attachments_company_stored_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.applicationId],
      foreignColumns: [aggregateApplications.id],
      name: 'aggregate_application_attachments_application_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('aggregate_application_attachments_draft_id_unique').on(table.draftId),
    check(
      'aggregate_application_attachments_type_check',
      sql`${table.type} in ('ccmei', 'cnh', 'crlv', 'other')`,
    ),
    check(
      'aggregate_application_attachments_status_check',
      sql`${table.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      'aggregate_application_attachments_review_check',
      sql`(${table.reviewedBy} is null) = (${table.reviewedAt} is null)`,
    ),
    check(
      'aggregate_application_attachments_rejection_reason_check',
      sql`(${table.status} = 'rejected') = (length(${table.rejectionReason}) > 0)`,
    ),
  ],
)
