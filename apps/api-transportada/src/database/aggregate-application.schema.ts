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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { TAX_ID_PATTERN } from '../shared/tax-id.service.js'
import { fleetDrivers } from './fleet.schema.js'
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
