/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

const DATASET_MAX_LENGTH = 64

/**
 * O extrato do catálogo de praças. Ele existe como linha porque o `@adatechnology/object-storage-provider`
 * expõe `put`, `get`, `head`, `delete` e URL assinada — **não tem `list`** —, então descobrir quais
 * extratos foram subidos varrendo o bucket exigiria um índice guardado em objeto, que é estado sem
 * transação. Esta tabela é esse índice, e também a fonte da recarga registrada em `audit_logs`
 * (`fiscal-operation.schema.ts`, tabela de auditoria de uso geral que a API já tem e usa —
 * `drizzle-contractor-mail.repository.ts` é outro consumidor dela; spec 154 T302 confirmou isso e
 * corrigiu a mesma premissa errada em `spec.md`).
 *
 * ⚠️ **Sem `company_id`, de propósito — é a quinta tabela do produto nessa condição**, ao lado de
 * `fuel_price_references`, `energy_tariff_references`, `vehicle_volume_references` e `toll_booths`.
 * A justificativa não é a das outras quatro: não se trata de dado público de mercado, e sim de que o
 * extrato descreve o catálogo, e o catálogo é da instalação (ADR-0021, um deploy por transportadora).
 * Recarregar muda a tarifa que todas as empresas do deploy enxergam — daí a permissão ser
 * `settings.manage`. A exceção é assertada por extenso em `test/fleet-schema/tenant-safety.contract.ts`;
 * quem acrescentar a sexta conta as asserções de lá.
 *
 * ⚠️ **A chave é natural, `(dataset, observed_on)`.** É por esse par que a recarga endereça a linha e
 * é o conflito dele que produz o 409 do extrato duplicado — um id opaco só acrescentaria um passo
 * entre a rota e a linha que ela quer, o mesmo raciocínio de `job_schedules.job`.
 *
 * ⚠️ **As colunas de ator não têm FK, e a ausência é deliberada** — a mesma assimetria de
 * `nfe_package_box_measurements.measured_by_user_id`: `RESTRICT` travaria a remoção do usuário e
 * `SET NULL`/`CASCADE` apagaria o ator, e ator que some com o usuário deixa de ser auditoria.
 */
export const tollBoothExtracts = pgTable(
  'toll_booth_extracts',
  {
    /** O nome do recorte (`sudeste`), sem o sufixo do arquivo do Geofabrik. */
    dataset: varchar({ length: DATASET_MAX_LENGTH }).notNull(),
    /** A data do `.pbf`, que é a mesma que vira `toll_booths.observed_on`. */
    observedOn: date('observed_on').notNull(),
    objectKey: text('object_key').notNull(),
    sha256: text().notNull(),
    boothCount: integer('booth_count').notNull(),
    boothsWithCharge: integer('booths_with_charge').notNull(),
    boothsWithAxleCharge: integer('booths_with_axle_charge').notNull(),
    /**
     * De qual recorte do Geofabrik o `.pbf` veio. É a única coluna que permite notar depois que
     * alguém recortou outra região reusando o mesmo `dataset` — caso em que o id de nó deixa de
     * casar com o do OSRM e a rota passa a subestimar o total em silêncio.
     */
    sourceUrl: text('source_url'),
    /** Quando o extrator rodou — não é `created_at`, que é quando o produto recebeu o JSON. */
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    uploadedByUserId: uuid('uploaded_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Observação datada, não estado: é o instante em que uma recarga não achou o objeto, e volta a
     * nulo no primeiro download que funcionar. Um sinalizador booleano mentiria para sempre — o
     * `put` é `create-only` e a ressubida dos mesmos bytes responde `replayed`, então o objeto pode
     * voltar sem que ninguém lembre de limpá-lo.
     */
    missingObjectObservedAt: timestamp('missing_object_observed_at', { withTimezone: true }),
    reloadedAt: timestamp('reloaded_at', { withTimezone: true }),
    reloadedByUserId: uuid('reloaded_by_user_id'),
    reloadedBoothCount: integer('reloaded_booth_count'),
  },
  (table) => [
    primaryKey({ columns: [table.dataset, table.observedOn], name: 'toll_booth_extracts_pkey' }),
    /** O dataset entra na chave do objeto: sem esta forma, `..` no nome sai do prefixo do bucket. */
    check('toll_booth_extracts_dataset_check', sql`${table.dataset} ~ '^[a-z0-9][a-z0-9-]*$'`),
    check(
      'toll_booth_extracts_object_key_check',
      sql`${table.objectKey} ~ '^toll-booths/osm/[a-z0-9-]+/[0-9]{4}-[0-9]{2}-[0-9]{2}/toll-booths\\.json$'`,
    ),
    check('toll_booth_extracts_sha256_check', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    /**
     * Ter tarifa por eixo implica ter tarifa, e extrato de zero praça é falha do extrator, não
     * catálogo vazio. Medido em staging: 592 praças, 579 com tarifa, 571 com tarifa por eixo.
     */
    check(
      'toll_booth_extracts_counts_check',
      sql`${table.boothCount} > 0 and ${table.boothsWithCharge} between 0 and ${table.boothCount} and ${table.boothsWithAxleCharge} between 0 and ${table.boothsWithCharge}`,
    ),
    check(
      'toll_booth_extracts_source_url_check',
      sql`${table.sourceUrl} is null or ${table.sourceUrl} ~ '^https://'`,
    ),
    /** Recarga é ator, data e contagem juntos, ou nada: meia trilha não é trilha. */
    check(
      'toll_booth_extracts_reload_check',
      sql`(${table.reloadedAt} is null) = (${table.reloadedByUserId} is null) and (${table.reloadedAt} is null) = (${table.reloadedBoothCount} is null) and (${table.reloadedBoothCount} is null or ${table.reloadedBoothCount} >= 0)`,
    ),
    check(
      'toll_booth_extracts_timeline_check',
      sql`(${table.reloadedAt} is null or ${table.reloadedAt} >= ${table.createdAt}) and (${table.missingObjectObservedAt} is null or ${table.missingObjectObservedAt} >= ${table.createdAt})`,
    ),
  ],
)
