/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { char, check, numeric, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Spec 075: a cubagem de referência por tipo de veículo — o **último** degrau da capacidade, atrás
 * das dimensões da ficha e do `capacity_m3` dela.
 *
 * ⚠️ **Sem `company_id`, de propósito.** É catálogo de mercado, idêntico para toda instalação, sem
 * PII e sem efeito fiscal — a segunda tabela do produto nessa condição, ao lado de
 * `fuel_price_references`. Se ela ganhar tenant, vira configuração por empresa e a spec muda de
 * tamanho.
 *
 * ⚠️ **A chave é composta porque carreta é o implemento, não o cavalo.** No nosso modelo o
 * implemento tem `vehicle_type` **vazio** — o tipo é de quem traciona (`tractor_unit`) —, então a
 * linha da carreta é `('', '02')` para baú e `('', '05')` para sider. Indexar por `vehicle_type`
 * sozinho faria o cavalo responder pela capacidade da carga, que ele não carrega.
 *
 * A referência é **piso, não verdade**: a dispersão dentro de um tipo chega a 2× (um VUC existe de
 * 13 e de 26 m³), e por isso ela nunca vence a ficha.
 */
export const vehicleVolumeReferences = pgTable(
  'vehicle_volume_references',
  {
    /** Vazio é o implemento: o tipo pertence a quem traciona. */
    vehicleType: text('vehicle_type').notNull(),
    /** `tpCar` do MDF-e — `02` fechada/baú, `05` sider. */
    bodyType: char('body_type', { length: 2 }).notNull(),
    cargoLengthM: numeric('cargo_length_m', { precision: 8, scale: 3 }).notNull(),
    cargoWidthM: numeric('cargo_width_m', { precision: 8, scale: 3 }).notNull(),
    cargoHeightM: numeric('cargo_height_m', { precision: 8, scale: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.vehicleType, table.bodyType],
      name: 'vehicle_volume_references_pkey',
    }),
    check(
      'vehicle_volume_references_dimensions_check',
      sql`${table.cargoLengthM} > 0 and ${table.cargoWidthM} > 0 and ${table.cargoHeightM} > 0`,
    ),
  ],
)
