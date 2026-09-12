/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { trips } from './trip.schema.js'

/**
 * Spec 145 D5: a planta nasce `queued` no pedido, o worker a põe em `running`, e ela termina `ready`
 * ou `failed`. Não existe `stale`: quando a entrada muda, o hash muda, e o que nasce é **outra
 * linha** — a antiga fica para trás como histórico da entrada antiga.
 */
export const CARGO_LAYOUT_STATUSES = ['queued', 'running', 'ready', 'failed'] as const
export type CargoLayoutStatus = (typeof CARGO_LAYOUT_STATUSES)[number]

/**
 * Spec 145 D5: onde a planta de carga mora. Não vira coluna de `trips` porque tem ciclo de vida
 * próprio, é reescrita pelo worker, e é megabytes de JSON que os endpoints de lista jamais podem
 * carregar.
 */
export const tripCargoLayouts = pgTable(
  'trip_cargo_layouts',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    /** Anulável: a prévia da montagem (D3) pede planta de uma viagem que ainda não existe. */
    tripId: uuid('trip_id'),
    status: text().$type<CargoLayoutStatus>().notNull().default('queued'),
    /** D6: `sha256(canonicalJson(input))` — a chave que decide se a planta guardada ainda vale. */
    inputHash: text('input_hash').notNull(),
    /** D6: constante do pacote empacotador; mudar invalida toda planta guardada, de qualquer empresa. */
    policyVersion: text('policy_version').notNull(),
    /** O retrato canônico da entrada — o worker empacota a partir daqui, sem reler a viagem. */
    input: jsonb().notNull(),
    layout: jsonb(),
    errorCode: text('error_code').notNull().default(''),
    attempt: bigint({ mode: 'number' }).notNull().default(0),
    durationMs: bigint('duration_ms', { mode: 'number' }),
    computedAt: timestamp('computed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_cargo_layouts_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_cargo_layouts_company_trip_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('trip_cargo_layouts_company_input_hash_unique').on(table.companyId, table.inputHash),
    index('trip_cargo_layouts_company_trip_idx').on(table.companyId, table.tripId),
    check(
      'trip_cargo_layouts_status_check',
      sql`${table.status} in (${sql.raw(inList(CARGO_LAYOUT_STATUSES))})`,
    ),
    // Planta pronta tem desenho; desenho guardado é planta pronta — nem `ready` vazio, nem rascunho
    check(
      'trip_cargo_layouts_layout_check',
      sql`(${table.status} = 'ready') = (${table.layout} is not null)`,
    ),
    // Falha tem causa nomeada; sucesso não carrega código de erro
    check(
      'trip_cargo_layouts_error_code_check',
      sql`(${table.status} = 'failed') = (length(${table.errorCode}) > 0)`,
    ),
    check(
      'trip_cargo_layouts_counters_check',
      sql`${table.attempt} >= 0 and (${table.durationMs} is null or ${table.durationMs} >= 0)`,
    ),
  ],
)
