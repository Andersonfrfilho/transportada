/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { tollBooths } from './toll-booth.schema.js'

/**
 * Spec 095: o ajuste manual da tarifa de pedágio, por empresa e por praça.
 *
 * ⚠️ **Ao contrário de `toll_booths`, esta tabela TEM `company_id`** e é assertada como âncora ao
 * tenant em `test/fleet-schema/tenant-safety.contract.ts` — o catálogo do OSM é público, o ajuste é
 * decisão de uma transportadora sobre o valor que ela paga.
 *
 * O valor efetivo é `ajuste ?? tarifa do catálogo`, resolvido num lugar só, no molde de
 * `company_fuel_prices`/`fuel-price.policy.ts`. Ausência de linha é ausência de ajuste; `0.00`
 * gravado aqui é isenção **afirmada por gente**, com autor e data — a distinção que o OSM não tem
 * entre "campo não preenchido" e "praça isenta".
 *
 * `charge_per_axle` e `charge_car` são independentes: corrigir só o valor por eixo e deixar o
 * carro de passeio no catálogo é o caso comum, e por isso cada um vence o catálogo por conta
 * própria — nunca a linha inteira de uma vez.
 */
export const companyTollBoothCharges = pgTable(
  'company_toll_booth_charges',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    /** A mesma chave natural do catálogo (`toll_booths.osm_node_id`) — nunca um id próprio. */
    osmNodeId: bigint('osm_node_id', { mode: 'bigint' })
      .notNull()
      .references(() => tollBooths.osmNodeId, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    chargePerAxle: numeric('charge_per_axle', { precision: 19, scale: 4 }),
    chargeCar: numeric('charge_car', { precision: 19, scale: 4 }),
    /** A data da tarifa que a pessoa está registrando — nunca a do clique (spec 095 D2). */
    observedOn: date('observed_on').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.osmNodeId],
      name: 'company_toll_booth_charges_company_id_osm_node_id_pk',
    }),
    check(
      'company_toll_booth_charges_charge_per_axle_check',
      sql`${table.chargePerAxle} is null or ${table.chargePerAxle} >= 0`,
    ),
    check(
      'company_toll_booth_charges_charge_car_check',
      sql`${table.chargeCar} is null or ${table.chargeCar} >= 0`,
    ),
    /** Ajuste sem valor nenhum não corrige coisa alguma — seria linha gravada e trabalho jogado fora. */
    check(
      'company_toll_booth_charges_charge_presence_check',
      sql`${table.chargePerAxle} is not null or ${table.chargeCar} is not null`,
    ),
  ],
)
