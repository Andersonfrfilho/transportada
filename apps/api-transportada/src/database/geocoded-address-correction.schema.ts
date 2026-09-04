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
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { GEOCODING_PRECISIONS, GEOCODING_SOURCES } from './geocoding.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * De onde veio a correção. É **eixo separado** de `GEOCODING_SOURCES`: contratante, motorista e
 * operador produzem todos `source = 'manual'` na coordenada, e o relatório da 084 (RF7) precisa
 * distinguir os três para responder de quem vem a informação boa.
 */
export const CORRECTION_ORIGINS = ['contractor', 'driver', 'operator'] as const
export type CorrectionOrigin = (typeof CORRECTION_ORIGINS)[number]

/**
 * A trilha de **correção humana** de coordenada (spec 084, RF4). Append-only, mesmo padrão de
 * `audit_logs` e `delivery_address_overrides`.
 *
 * ⚠️ **Não é `geocoding_refinement_requests`, e a distinção é o que impede a duplicata.** Aquela
 * registra a *compra* de precisão fina no provedor pago (spec 069): quem marcou, e se o provedor
 * melhorou. Esta registra a *correção por gente* — o contratante que sabe onde fica a porta do
 * cliente dele, o motorista que esteve lá. Uma responde "valeu a pena pagar?", a outra alimenta a
 * agenda de endereços. Fundi-las faria o teto de gasto por janela (069 RF11) contar correção que
 * não custou nada.
 *
 * ⚠️ **Não é `delivery_address_overrides` tampouco.** Aquele é desvio de *uma entrega* — "hoje
 * entrega no outro portão" —, por vínculo de nota e sem valor para a próxima. Esta é cadastro
 * permanente. Confundir faria um desvio pontual virar endereço fixo do cliente.
 *
 * ⚠️ **Tem `company_id`, ao contrário de `geocoded_addresses`.** A coordenada não é de ninguém — é a
 * mesma rua para quem quer que entregue nela —, mas **a correção é de quem a fez**: ela carrega a
 * decisão e o ator, e é por empresa que o relatório agrupa.
 *
 * O deslocamento em metros que a RF7 pede **não é coluna**: sai da diferença entre a posição
 * anterior e a nova. Guardar o derivado abriria a porta para ele discordar das pontas.
 */
export const geocodedAddressCorrections = pgTable(
  'geocoded_address_corrections',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    addressKey: text('address_key').notNull(),
    /**
     * Nulas em conjunto quando o endereço **não tinha coordenada nenhuma** antes — caso real: nota
     * cujo CEP não resolveu e cujo município não tem centroide. O CHECK amarra as quatro.
     */
    previousLatitude: numeric('previous_latitude', { precision: 10, scale: 7 }),
    previousLongitude: numeric('previous_longitude', { precision: 10, scale: 7 }),
    previousSource: text('previous_source').$type<(typeof GEOCODING_SOURCES)[number]>(),
    previousPrecision: text('previous_precision').$type<(typeof GEOCODING_PRECISIONS)[number]>(),
    newLatitude: numeric('new_latitude', { precision: 10, scale: 7 }).notNull(),
    newLongitude: numeric('new_longitude', { precision: 10, scale: 7 }).notNull(),
    newSource: text('new_source').$type<(typeof GEOCODING_SOURCES)[number]>().notNull(),
    newPrecision: text('new_precision').$type<(typeof GEOCODING_PRECISIONS)[number]>().notNull(),
    origin: text().$type<CorrectionOrigin>().notNull(),
    /** O usuário que executou. Motorista e contratante também são membership. */
    actorUserId: uuid('actor_user_id').notNull(),
    /**
     * Quem **pediu**, quando não é usuário do sistema — mesmo campo e mesma razão de
     * `delivery_address_overrides.requestedBy`: "o gerente da loja ligou e disse". Vazio quando o
     * ator é o próprio autor da informação.
     */
    requestedBy: text('requested_by').notNull().default(''),
    reason: text().notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'geocoded_address_corrections_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** O ator precisa ser membro **daquela** empresa: a FK simples aceitaria conta de outra. */
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'geocoded_address_corrections_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('geocoded_address_corrections_address_key_check', sql`length(${table.addressKey}) > 0`),
    /**
     * ⚠️ As quatro colunas da posição anterior vivem e morrem juntas. Coordenada sem procedência é
     * coordenada em que ninguém confia, e procedência sem coordenada não diz de onde se saiu.
     */
    check(
      'geocoded_address_corrections_previous_check',
      sql`(${table.previousLatitude} is null) = (${table.previousLongitude} is null)
        and (${table.previousLatitude} is null) = (${table.previousSource} is null)
        and (${table.previousLatitude} is null) = (${table.previousPrecision} is null)`,
    ),
    check(
      'geocoded_address_corrections_previous_source_check',
      sql`${table.previousSource} is null or ${table.previousSource} in (${sql.raw(inList(GEOCODING_SOURCES))})`,
    ),
    check(
      'geocoded_address_corrections_previous_precision_check',
      sql`${table.previousPrecision} is null or ${table.previousPrecision} in (${sql.raw(inList(GEOCODING_PRECISIONS))})`,
    ),
    check(
      'geocoded_address_corrections_new_source_check',
      sql`${table.newSource} in (${sql.raw(inList(GEOCODING_SOURCES))})`,
    ),
    check(
      'geocoded_address_corrections_new_precision_check',
      sql`${table.newPrecision} in (${sql.raw(inList(GEOCODING_PRECISIONS))})`,
    ),
    check(
      'geocoded_address_corrections_origin_check',
      sql`${table.origin} in (${sql.raw(inList(CORRECTION_ORIGINS))})`,
    ),
    check(
      'geocoded_address_corrections_previous_latitude_check',
      sql`${table.previousLatitude} is null or ${table.previousLatitude} between -90 and 90`,
    ),
    check(
      'geocoded_address_corrections_previous_longitude_check',
      sql`${table.previousLongitude} is null or ${table.previousLongitude} between -180 and 180`,
    ),
    check(
      'geocoded_address_corrections_new_latitude_check',
      sql`${table.newLatitude} between -90 and 90`,
    ),
    check(
      'geocoded_address_corrections_new_longitude_check',
      sql`${table.newLongitude} between -180 and 180`,
    ),
    /** O relatório agrupa por empresa e ordena por data; o histórico de um endereço lê pela chave. */
    index('geocoded_address_corrections_company_created_idx').on(table.companyId, table.createdAt),
    index('geocoded_address_corrections_address_key_idx').on(table.addressKey),
  ],
)
