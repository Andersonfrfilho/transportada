/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CARGO_PREVIEW_CHANNEL,
  CARGO_PREVIEW_CHANNELS,
  CARGO_PREVIEW_EVENT_KINDS,
  CARGO_PREVIEW_WIDE_EVENT_KINDS,
  type CargoPreviewChannel,
  type CargoPreviewEventKind,
} from '../shared/cargo-preview.constant.js'
import { cargoPreviewItems } from './cargo-preview-item.schema.js'
import { cargoPreviews } from './cargo-preview.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)
const withTimezone = { withTimezone: true } as const

/**
 * Spec 237 RF5a item 9 (ADR-0067): a trilha da prévia — envio, leitura, cada vínculo do worker e
 * cada ação do operador. Append-only pelo trigger da migration, no molde de `cargo_arrival_events`.
 * O vínculo automático não tem ator humano: canal `worker` e `actor_user_id` nulo, sempre juntos.
 */
export const cargoPreviewEvents = pgTable(
  'cargo_preview_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    previewId: uuid('preview_id').notNull(),
    itemId: uuid('item_id'),
    kind: varchar('kind', { length: 32 }).$type<CargoPreviewEventKind>().notNull(),
    actorUserId: uuid('actor_user_id'),
    channel: varchar('channel', { length: 16 }).$type<CargoPreviewChannel>().notNull(),
    occurredAt: timestamp('occurred_at', withTimezone).notNull(),
    recordedAt: timestamp('recorded_at', withTimezone).notNull().defaultNow(),
    /** Ids e contagens; nunca destinatário, endereço ou valor da linha. */
    details: jsonb().$type<Readonly<Record<string, unknown>>>(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cargo_preview_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.previewId],
      foreignColumns: [cargoPreviews.companyId, cargoPreviews.id],
      name: 'cargo_preview_events_company_preview_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.previewId, table.itemId],
      foreignColumns: [
        cargoPreviewItems.companyId,
        cargoPreviewItems.previewId,
        cargoPreviewItems.id,
      ],
      name: 'cargo_preview_events_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cargo_preview_events_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('cargo_preview_events_company_preview_occurred_idx').on(
      table.companyId,
      table.previewId,
      table.occurredAt,
    ),
    check(
      'cargo_preview_events_kind_check',
      sql`${table.kind} in (${raw(inList(CARGO_PREVIEW_EVENT_KINDS))})`,
    ),
    check(
      'cargo_preview_events_item_scope_check',
      sql`(${table.kind} in (${raw(inList(CARGO_PREVIEW_WIDE_EVENT_KINDS))})) = (${table.itemId} is null)`,
    ),
    check(
      'cargo_preview_events_channel_check',
      sql`${table.channel} in (${raw(inList(CARGO_PREVIEW_CHANNELS))})`,
    ),
    check(
      'cargo_preview_events_actor_check',
      sql`(${table.channel} = ${raw(`'${CARGO_PREVIEW_CHANNEL.worker}'`)}) = (${table.actorUserId} is null)`,
    ),
    check('cargo_preview_events_details_check', sql`jsonb_typeof(${table.details}) = 'object'`),
  ],
)
