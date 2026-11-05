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

import { fleetDrivers } from './fleet.schema.js'
import { companies } from './identity.schema.js'
import { storedObjects } from './storage.schema.js'

export const FLEET_DRIVER_ATTACHMENT_TYPES = [
  'cnh',
  'address_proof',
  'identity_document',
  'other',
] as const
export type FleetDriverAttachmentType = (typeof FLEET_DRIVER_ATTACHMENT_TYPES)[number]

export const FLEET_DRIVER_ATTACHMENT_DECISIONS = ['accepted', 'dismissed'] as const
export type FleetDriverAttachmentDecision = (typeof FLEET_DRIVER_ATTACHMENT_DECISIONS)[number]

/**
 * Spec 091: o documento do motorista na ficha da frota. Tabela própria, e não a da candidatura
 * (D2): `aggregate_application_attachments` responde ao fluxo anônimo; esta responde a `driver_id`.
 *
 * `company_id` entra em **toda** FK composta — a FK simples aceitaria amarrar o documento de uma
 * empresa ao motorista de outra. A única FK só de `company_id` ancora o tenant, no molde das demais.
 *
 * `extracted_fields` é o que a leitura do servidor sugeriu. Some no **mesmo** `UPDATE` que registra a
 * decisão do operador (D5): em duas escritas, uma falha no meio deixaria a PII no caminho de erro.
 *
 * O documento vive enquanto a ficha viver (D6): não há `expires_at`, e a ficha é desativada, não
 * removida — a consequência está em `docs/SECURITY.md`.
 */
export const fleetDriverAttachments = pgTable(
  'fleet_driver_attachments',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    driverId: uuid('driver_id').notNull(),
    type: text().$type<FleetDriverAttachmentType>().notNull(),
    storedObjectId: uuid('stored_object_id').notNull(),
    extractedFields: jsonb('extracted_fields'),
    /** Quando a leitura fechou — inclusive sem reconhecer nada. Nulo é leitura ainda pendente. */
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    decision: text().$type<FleetDriverAttachmentDecision>(),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    uploadedBy: uuid('uploaded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'fleet_driver_attachments_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'fleet_driver_attachments_company_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.storedObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'fleet_driver_attachments_company_stored_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('fleet_driver_attachments_company_id_id_unique').on(table.companyId, table.id),
    /** Um documento vivo por tipo e motorista; `other` é a exceção, porque aceita vários. */
    uniqueIndex('fleet_driver_attachments_company_driver_type_unique')
      .on(table.companyId, table.driverId, table.type)
      .where(sql`${table.type} <> 'other'`),
    check(
      'fleet_driver_attachments_type_check',
      sql`${table.type} in ('cnh', 'address_proof', 'identity_document', 'other')`,
    ),
    check(
      'fleet_driver_attachments_decision_check',
      sql`${table.decision} is null or ${table.decision} in ('accepted', 'dismissed')`,
    ),
    check(
      'fleet_driver_attachments_decision_complete_check',
      sql`(${table.decision} is null) = (${table.decidedAt} is null) and (${table.decision} is null) = (${table.decidedBy} is null)`,
    ),
    check(
      'fleet_driver_attachments_decided_without_fields_check',
      sql`${table.decision} is null or ${table.extractedFields} is null`,
    ),
  ],
)
