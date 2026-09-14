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
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Spec 090: a praça de pedágio mapeada no OSM, com a tarifa que ela cobra.
 *
 * ⚠️ **Sem `company_id`, de propósito** — é a **terceira** tabela do produto nessa condição, ao lado
 * de `fuel_price_references` e `vehicle_volume_references`: tarifa pública, idêntica para toda
 * instalação, sem PII e sem efeito fiscal. A exceção é assertada por extenso em
 * `test/fleet-schema/tenant-safety.contract.ts`, porque tabela sem tenant nasce por decisão ou por
 * esquecimento e as duas se parecem no diff.
 *
 * ⚠️ **`osm_node_id` é a chave natural, e é ela que torna o seed idempotente.** A praça **é** um nó
 * do OSM, e é por identidade de nó que a rota a encontra (D1) — nunca por proximidade: rodovia
 * duplicada tem a praça do sentido contrário a poucos metros, e o raio cobraria pedágio de quem
 * passou do outro lado.
 *
 * ⚠️ **`observed_on` não é enfeite.** A tarifa do OSM é fotografia da data do extract, e reajuste de
 * pedágio é anual: sem a data impressa ao lado, o operador lê um número velho como se fosse de hoje.
 *
 * Tarifa **nula é desconhecida**, não gratuita — praça sem `charge` no mapa entra assim mesmo,
 * porque ela existe na estrada e sumir dela faria a rota parecer sem pedágio. Zero, se algum dia
 * vier, é praça isenta, e soma zero sem mentir.
 */
export const tollBooths = pgTable(
  'toll_booths',
  {
    id: uuid().defaultRandom().primaryKey(),
    /** Identidade do nó no OSM. `bigint` porque o espaço de ids já passou de 2^31. */
    osmNodeId: bigint('osm_node_id', { mode: 'bigint' }).notNull(),
    name: text(),
    operator: text(),
    latitude: numeric({ precision: 10, scale: 7 }).notNull(),
    longitude: numeric({ precision: 10, scale: 7 }).notNull(),
    /** A parcela `hgv/axle` do `charge` — o que o caminhão paga **por eixo**. */
    chargePerAxle: numeric('charge_per_axle', { precision: 19, scale: 4 }),
    /** A parcela `motorcar`, para o veículo leve da frota. */
    chargeCar: numeric('charge_car', { precision: 19, scale: 4 }),
    /**
     * Spec 095 D3: a tarifa de quem paga com tag — sempre menor, nunca publicada pelo OSM. Nasce
     * nula e só passa a existir por ajuste da empresa (`company_toll_booth_charges`) ou, um dia,
     * por curadoria oficial; o extrator de `charge` continua gravando só a manual.
     */
    chargePerAxleAutomatic: numeric('charge_per_axle_automatic', { precision: 19, scale: 4 }),
    /** A data do extract de onde a tarifa veio, e é ela que a tela imprime. */
    observedOn: date('observed_on').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('toll_booths_osm_node_id_unique').on(table.osmNodeId),
    check('toll_booths_osm_node_id_check', sql`${table.osmNodeId} > 0`),
    check('toll_booths_latitude_check', sql`${table.latitude} between -90 and 90`),
    check('toll_booths_longitude_check', sql`${table.longitude} between -180 and 180`),
    check(
      'toll_booths_charge_per_axle_check',
      sql`${table.chargePerAxle} is null or ${table.chargePerAxle} >= 0`,
    ),
    check(
      'toll_booths_charge_car_check',
      sql`${table.chargeCar} is null or ${table.chargeCar} >= 0`,
    ),
    check(
      'toll_booths_charge_per_axle_automatic_check',
      sql`${table.chargePerAxleAutomatic} is null or ${table.chargePerAxleAutomatic} >= 0`,
    ),
  ],
)
