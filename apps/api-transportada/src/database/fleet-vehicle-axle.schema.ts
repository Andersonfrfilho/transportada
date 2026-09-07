/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { fleetVehicles } from './fleet.schema.js'

/**
 * Spec 094: os eixos do veículo, com **posição e limite**. É o que a balança cobra, e é a única
 * coisa no produto que transforma "a carga cabe" em "a carga pode sair assim".
 *
 * ⚠️ **Tabela, não coluna.** Um `max_axle_load_kg` único responderia "o veículo aguenta X por eixo"
 * e não responde a pergunta que interessa — *este* arranjo sobrecarrega *qual* eixo. Para isso é
 * preciso saber onde cada eixo está em relação ao baú, e isso é uma linha por eixo.
 *
 * ⚠️ **Nada disso é obrigatório.** Veículo sem eixo cadastrado continua tendo planta de carga: ela
 * posiciona e diz que não conferiu peso por eixo. Exigir o cadastro antes de desenhar deixaria a
 * tela vazia para toda a frota de hoje, que tem zero eixos declarados.
 */
export const fleetVehicleAxles = pgTable(
  'fleet_vehicle_axles',
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    vehicleId: uuid('vehicle_id').notNull(),
    /** 1 é o dianteiro. A ordem é a do veículo, da frente para trás. */
    position: integer().notNull(),
    /** Distância do para-choque dianteiro, em metros — é o braço de alavanca do cálculo. */
    distanceFromFrontM: numeric('distance_from_front_m', { precision: 6, scale: 3 }).notNull(),
    /** O que a legislação permite neste eixo. `null` é "ninguém informou", nunca "sem limite". */
    maxLoadKg: numeric('max_load_kg', { precision: 10, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** O par leva o tenant junto: a FK simples aceitaria amarrar eixo ao veículo de outra empresa. */
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'fleet_vehicle_axles_company_vehicle_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('fleet_vehicle_axles_vehicle_position_unique').on(
      table.companyId,
      table.vehicleId,
      table.position,
    ),
    index('fleet_vehicle_axles_company_vehicle_idx').on(table.companyId, table.vehicleId),
    check('fleet_vehicle_axles_position_check', sql`${table.position} between 1 and 9`),
    check(
      'fleet_vehicle_axles_distance_check',
      sql`${table.distanceFromFrontM} > 0 and ${table.distanceFromFrontM} <= 30`,
    ),
    check(
      'fleet_vehicle_axles_load_check',
      sql`${table.maxLoadKg} is null or (${table.maxLoadKg} > 0 and ${table.maxLoadKg} <= 30000)`,
    ),
  ],
)
