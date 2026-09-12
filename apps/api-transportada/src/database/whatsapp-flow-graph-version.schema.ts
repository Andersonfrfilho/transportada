/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const WHATSAPP_FLOW_GRAPH_VERSION_SOURCES = ['code', 'panel'] as const
export type WhatsAppFlowGraphVersionSource = (typeof WHATSAPP_FLOW_GRAPH_VERSION_SOURCES)[number]

/**
 * Spec 144 T008 — `conversation-flow.md` §1 exige histórico da conversa publicada; a
 * `FlowGraphRepository` do `@adatechnology/meta-whatsapp-module@0.1.0` **sobrescreve** a linha viva
 * (`save`/`create` não guardam versão anterior nenhuma). Esta tabela é o histórico que falta, e é
 * append-only pelo mesmo padrão de `audit_logs`/`trip_dispatch_snapshots`: o trigger que recusa
 * `UPDATE`/`DELETE` vive na migration (drizzle-orm não modela trigger em TS aqui).
 *
 * `nodes`/`start_node_id`/`label` são o retrato completo do grafo naquela versão — o suficiente para
 * reconstruir um `FlowGraphData` sem depender da linha viva do módulo, que pode já ter sido
 * sobrescrita de novo.
 */
export const whatsappFlowGraphVersions = pgTable(
  'whatsapp_flow_graph_versions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    flowKey: text('flow_key').notNull(),
    version: integer().notNull(),
    nodes: jsonb().notNull(),
    startNodeId: text('start_node_id').notNull(),
    label: text().notNull(),
    /** `'code'` quando o comando de republicação publica; id do usuário quando o painel salva. */
    publishedBy: text('published_by').notNull(),
    source: text().$type<WhatsAppFlowGraphVersionSource>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'whatsapp_flow_graph_versions_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('whatsapp_flow_graph_versions_company_flow_version_unique').on(
      table.companyId,
      table.flowKey,
      table.version,
    ),
    check('whatsapp_flow_graph_versions_flow_key_check', sql`length(${table.flowKey}) > 0`),
    check('whatsapp_flow_graph_versions_version_check', sql`${table.version} >= 1`),
    check(
      'whatsapp_flow_graph_versions_start_node_id_check',
      sql`length(${table.startNodeId}) > 0`,
    ),
    check('whatsapp_flow_graph_versions_published_by_check', sql`length(${table.publishedBy}) > 0`),
    check('whatsapp_flow_graph_versions_source_check', sql`${table.source} in ('code', 'panel')`),
  ],
)
