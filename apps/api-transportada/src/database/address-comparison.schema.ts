/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * O que o provedor sabia sobre o endereço. **Quatro níveis, não dois** — medido com a chave real em
 * 2026-09-04:
 *
 * - `rooftop` — a porta, conhecida.
 * - `range_interpolated` — a rua certa, **número estimado** entre dois vizinhos. Palpite sobre a via.
 * - `approximate` — caiu no município: **o texto da nota não existe** para o provedor.
 * - `not_found` — nem isso.
 *
 * ⚠️ `range_interpolated` **nunca** é tratado como `rooftop`. Achatar os dois apagaria a diferença
 * entre a porta e o palpite sobre ela, que é o que a ADR-0044 §5 faz a precisão viajar visível para
 * impedir.
 */
export const PROVIDER_MATCH_LEVELS = [
  'rooftop',
  'range_interpolated',
  'approximate',
  'not_found',
] as const
export type ProviderMatchLevel = (typeof PROVIDER_MATCH_LEVELS)[number]

/**
 * A comparação entre o que a nota diz e o que o provedor devolveu (spec 084, P1 e RF8).
 *
 * ⚠️ **Ela guarda a medição, não a coordenada do provedor.** Quais campos divergem, a distância e o
 * nível de acerto são **conta nossa** — fato observado, sem licença de ninguém pendurada. A
 * coordenada deles fica de fora até o D3 ser respondido, e entra como coluna nova se for liberado:
 * guardar menos agora não fecha porta, guardar demais fecharia.
 *
 * ⚠️ **O texto devolvido é a exceção, e está aqui de propósito.** Ele é conteúdo do provedor, mesma
 * classe da coordenada — mas é o que permite o relatório dizer *"seria `Rua Américo de Araújo
 * Píres`?"* em vez de *"está errado, descubra"*. Fica separado e datado: se o D3 disser que não pode
 * persistir, ele é purgado e re-buscado **sem perder a medição**.
 */
export const addressComparisons = pgTable(
  'address_comparisons',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    addressKey: text('address_key').notNull(),

    /** O que a nota diz — nosso, sem ressalva. Guardado porque o texto da nota muda com o tempo. */
    noteStreet: text('note_street').notNull().default(''),
    noteNumber: text('note_number').notNull().default(''),
    noteDistrict: text('note_district').notNull().default(''),
    notePostalCode: text('note_postal_code').notNull().default(''),

    /**
     * O que o provedor devolveu — **conteúdo dele**. É a sugestão que o contratante confirma.
     * Purgável sem perder nada da medição abaixo.
     */
    providerStreet: text('provider_street').notNull().default(''),
    providerNumber: text('provider_number').notNull().default(''),
    providerDistrict: text('provider_district').notNull().default(''),
    providerPostalCode: text('provider_postal_code').notNull().default(''),
    providerPlaceId: text('provider_place_id').notNull().default(''),

    /** A medição — **nossa**, e o que sobrevive a qualquer decisão sobre os termos do provedor. */
    matchLevel: text('match_level').$type<ProviderMatchLevel>().notNull(),
    streetDiverges: boolean('street_diverges').notNull(),
    districtDiverges: boolean('district_diverges').notNull(),
    postalCodeDiverges: boolean('postal_code_diverges').notNull(),
    /**
     * Distância entre a coordenada que já temos e a que o provedor apontou. **Nula** quando não há
     * o que comparar: sem coordenada nossa, ou o provedor não achou.
     */
    distanceMetres: numeric('distance_metres', { precision: 12, scale: 2 }),
    /**
     * ⚠️ O portão da RF2: resultado em município diferente do da nota é **descartado**, não
     * comparado. Fica registrado para o relatório contar quantas vezes o provedor errou de cidade.
     */
    cityMismatch: boolean('city_mismatch').notNull().default(false),

    comparedAt: timestamp('compared_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'address_comparisons_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('address_comparisons_address_key_check', sql`length(${table.addressKey}) > 0`),
    check(
      'address_comparisons_match_level_check',
      sql`${table.matchLevel} in (${sql.raw(inList(PROVIDER_MATCH_LEVELS))})`,
    ),
    check(
      'address_comparisons_distance_check',
      sql`${table.distanceMetres} is null or ${table.distanceMetres} >= 0`,
    ),
    /**
     * ⚠️ Município divergente **descarta** o resultado, então ele não pode vir acompanhado de
     * comparação de campo: comparar rua de outra cidade é comparar outra coisa.
     */
    check(
      'address_comparisons_city_mismatch_check',
      sql`not ${table.cityMismatch} or (not ${table.streetDiverges} and not ${table.districtDiverges} and not ${table.postalCodeDiverges})`,
    ),
    index('address_comparisons_company_compared_idx').on(table.companyId, table.comparedAt),
    index('address_comparisons_address_key_idx').on(table.addressKey),
    /** O relatório ordena por gravidade: quem nem foi achado primeiro. */
    index('address_comparisons_match_level_idx').on(table.companyId, table.matchLevel),
  ],
)
