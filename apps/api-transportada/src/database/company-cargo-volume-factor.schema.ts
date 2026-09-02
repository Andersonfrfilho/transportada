/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

/**
 * Spec 075: a cubagem que estima a carga, porque a NF-e não traz nenhuma — o grupo `<vol>` tem
 * quantidade, espécie e pesos, e **nenhuma dimensão**. Medido em produção em 2026-09-02: 1808
 * volumes, 1804 com peso, **zero com medida**.
 *
 * ⚠️ A chave é por espécie e **nasce atendendo uma linha só**. `species` está vazio em 1808 de 1808
 * volumes: a linha de espécie vazia é o padrão e responde por todo o dado de hoje. A dimensão por
 * espécie existe para o emitente que preencher `esp` — está escrito aqui para ninguém, ao ver uma
 * tabela de uma linha, "simplificar" para um fator único e pagar a migration de volta depois.
 *
 * Ausência de estimativa é a **ausência da linha**, nunca zero: o CHECK recusa zero e negativo,
 * porque zero declararia que a carga não ocupa espaço nenhum e somaria como se fosse medida
 * (ADR-0052, a mesma decisão que a spec 067 tomou para massa).
 */
export const companyCargoVolumeFactors = pgTable(
  'company_cargo_volume_factors',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    /** A espécie que o emitente declarou no `<vol>`. Vazio é a linha padrão. */
    species: text().notNull().default(''),
    volumePerUnitM3: numeric('volume_per_unit_m3', { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.species],
      name: 'company_cargo_volume_factors_pkey',
    }),
    check('company_cargo_volume_factors_volume_check', sql`${table.volumePerUnitM3} > 0`),
  ],
)
