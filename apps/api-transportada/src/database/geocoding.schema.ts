/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, index, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { inList } from './schema-check.constant.js'

/**
 * ADR-0044 §5: a precisão viaja junto da coordenada e é visível na tela. Um centroide de município é
 * um palpite de ~8km, não uma parada — e o conferente precisa saber disso antes de aceitar o
 * roteiro, não descobrir pelo motorista.
 */
export const GEOCODING_PRECISIONS = ['rooftop', 'street', 'postal_code', 'city'] as const
export type GeocodingPrecision = (typeof GEOCODING_PRECISIONS)[number]

/** A cascata da ADR-0044 §3, da melhor para a pior. `manual` sempre vence. */
export const GEOCODING_SOURCES = ['manual', 'google', 'postal_code', 'city'] as const
export type GeocodingSource = (typeof GEOCODING_SOURCES)[number]

/**
 * Coordenada por endereço, permanente (ADR-0044 §3). A chave é a mesma normalização que a 056 usa
 * para agrupar paradas (`buildStopAddressKey`) — endereço já visto nunca é geocodificado de novo, e
 * a mesma loja recebe cem vezes por ano.
 *
 * Não tem `company_id` de propósito: a coordenada de um endereço não é de ninguém. Duas empresas que
 * entregam na mesma rua não geocodificam duas vezes, e a tabela é ativo do produto, não do tenant.
 */
export const geocodedAddresses = pgTable(
  'geocoded_addresses',
  {
    addressKey: text('address_key').primaryKey(),
    // numeric, não float: coordenada é dado, e float perde dígito na borda do grau
    latitude: numeric({ precision: 10, scale: 7 }).notNull(),
    longitude: numeric({ precision: 10, scale: 7 }).notNull(),
    /**
     * ADR-0044 §3, mitigação 1: armazenável indefinidamente sem exceção nenhuma, e é a saída barata
     * se um dia for preciso ficar dentro dos termos do Google. `not null` com default vazio porque
     * a cascata de CEP/município não tem place_id — mas o teste cobra que a geocodificação
     * bem-sucedida sempre o preencha: mitigação que falha em silêncio não é mitigação.
     */
    externalPlaceId: text('external_place_id').notNull().default(''),
    source: text().$type<GeocodingSource>().notNull(),
    precision: text().$type<GeocodingPrecision>().notNull(),
    geocodedAt: timestamp('geocoded_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('geocoded_addresses_address_key_check', sql`length(${table.addressKey}) > 0`),
    check(
      'geocoded_addresses_source_check',
      sql`${table.source} in (${sql.raw(inList(GEOCODING_SOURCES))})`,
    ),
    check(
      'geocoded_addresses_precision_check',
      sql`${table.precision} in (${sql.raw(inList(GEOCODING_PRECISIONS))})`,
    ),
    check('geocoded_addresses_latitude_check', sql`${table.latitude} between -90 and 90`),
    check('geocoded_addresses_longitude_check', sql`${table.longitude} between -180 and 180`),
    // Correção manual não vem de provedor e não tem place_id; o resto do que o Google resolve tem
    check(
      'geocoded_addresses_place_id_check',
      sql`${table.source} <> 'google' or length(${table.externalPlaceId}) > 0`,
    ),
    // Métrica de volume (ADR-0044 §3, mitigação 3): endereços novos por mês sai daqui
    index('geocoded_addresses_geocoded_at_idx').on(table.geocodedAt),
  ],
)
