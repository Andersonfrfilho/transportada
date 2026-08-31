/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

/**
 * Spec 067: o peso que estima a carga quando o emitente não a declara — acontece por nota, não por
 * emitente (a mesma Zaragoza mandou 883658 com 108,670 kg e 883663 com 0,000 no mesmo caminhão).
 *
 * Nulo é **estimativa desligada**, e é o padrão: sem alguém escolher o número, a nota sem peso
 * continua bloqueada para CT-e em vez de a instalação passar a declarar massa inventada à SEFAZ.
 *
 * ⚠️ Não confundir com `company_route_optimization_settings.fallback_weight_kilograms`: aquele é
 * peso **por parada**, para o solver distribuir carga entre veículos, e este é peso **por volume**,
 * para o `infQ` do CT-e. Uma nota de vinte volumes usa um deles uma vez e o outro vinte vezes.
 */
export const companyCargoSettings = pgTable(
  'company_cargo_settings',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    defaultVolumeWeight: numeric('default_volume_weight', { precision: 14, scale: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Zero não é estimativa desligada — nulo é. Zero seria declarar que a carga não pesa nada.
    check(
      'company_cargo_settings_default_volume_weight_check',
      sql`${table.defaultVolumeWeight} is null or ${table.defaultVolumeWeight} > 0`,
    ),
  ],
)
