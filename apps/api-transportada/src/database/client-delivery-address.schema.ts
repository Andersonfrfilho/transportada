/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { GEOCODING_PRECISIONS, GEOCODING_SOURCES } from './geocoding.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * A agenda de endereços confirmados, por **cliente e lugar** (spec 084, P5).
 *
 * É o que faz a correção valer para a próxima nota: chega documento novo do mesmo cliente para o
 * mesmo lugar, com CEP digitado de outro jeito, e a coordenada boa é usada sem consultar provedor
 * nenhum.
 *
 * ⚠️ **A chave é `(empresa, cliente, cidade, número, rua)` — nunca só o cliente.** A parada agrupa
 * por endereço e não por CNPJ de propósito: *"a mesma rede em cinco lojas é cinco paradas"*. Ligar
 * coordenada ao documento do cliente colapsaria as cinco, e o caminhão entregaria tudo na primeira
 * — defeito pior que o atual, porque teria cara de melhoria.
 *
 * ⚠️ **A rua está na chave porque o CEP não basta.** Medido nesta base: três casos de mesma cidade e
 * mesmo número com CEPs diferentes ("PORTO FERREIRA nº 25" tem três). Sem o eixo da rua,
 * `(cliente, cidade, número)` juntaria endereços distintos.
 *
 * ⚠️ **`street_key` é canonicalização, não semelhança** (ver `buildClientStreetKey`). Duas grafias
 * da mesma rua viram duas linhas, a consulta acha duas e **não aplica nada** — falha segura, e o
 * relatório pergunta a um humano.
 */
export const clientDeliveryAddresses = pgTable(
  'client_delivery_addresses',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    /** O documento do destinatário, canonicalizado — é o que não varia quando o texto varia. */
    clientTaxId: text('client_tax_id').notNull(),
    cityCode: text('city_code').notNull(),
    addressNumber: text('address_number').notNull(),
    streetKey: text('street_key').notNull(),
    /** A rua como foi gravada, para o humano ler no relatório de ambiguidade. */
    street: text().notNull().default(''),
    /** A chave canônica: é por ela que `geocoded_addresses` responde. */
    addressKey: text('address_key').notNull(),
    latitude: numeric({ precision: 10, scale: 7 }).notNull(),
    longitude: numeric({ precision: 10, scale: 7 }).notNull(),
    source: text().$type<(typeof GEOCODING_SOURCES)[number]>().notNull(),
    precision: text().$type<(typeof GEOCODING_PRECISIONS)[number]>().notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'client_delivery_addresses_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'client_delivery_addresses_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /**
     * ⚠️ **A rua entra no unique**, e é ela que deixa duas lojas do mesmo cliente no mesmo número
     * coexistirem. Sem ela, a segunda loja seria recusada pelo banco — e recusar cadastro legítimo
     * é tão errado quanto colapsar dois lugares num.
     */
    unique('client_delivery_addresses_client_place_unique').on(
      table.companyId,
      table.clientTaxId,
      table.cityCode,
      table.addressNumber,
      table.streetKey,
    ),
    /** A consulta do degrau 2 da precedência: cliente e lugar, sem a rua — a ambiguidade é contada. */
    index('client_delivery_addresses_lookup_idx').on(
      table.companyId,
      table.clientTaxId,
      table.cityCode,
      table.addressNumber,
    ),
    check('client_delivery_addresses_client_tax_id_check', sql`length(${table.clientTaxId}) > 0`),
    check('client_delivery_addresses_city_code_check', sql`length(${table.cityCode}) > 0`),
    check('client_delivery_addresses_address_key_check', sql`length(${table.addressKey}) > 0`),
    check(
      'client_delivery_addresses_source_check',
      sql`${table.source} in (${sql.raw(inList(GEOCODING_SOURCES))})`,
    ),
    check(
      'client_delivery_addresses_precision_check',
      sql`${table.precision} in (${sql.raw(inList(GEOCODING_PRECISIONS))})`,
    ),
    check('client_delivery_addresses_latitude_check', sql`${table.latitude} between -90 and 90`),
    check(
      'client_delivery_addresses_longitude_check',
      sql`${table.longitude} between -180 and 180`,
    ),
  ],
)
