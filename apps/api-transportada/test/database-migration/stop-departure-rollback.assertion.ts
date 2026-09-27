/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 206 CA1 (T1.1): o rollback da saída da parada é **destrutivo por desenho**, e é isso que este
 * contrato prova. Ao contrário do rollback da 158, que recusa enquanto houver histórico, este apaga: os
 * `departed` e os `departure_cancelled` somem, as duas colunas de "a caminho" caem, o CHECK antigo de
 * `kind` volta e a linha do journal sai. Escrito aqui para que a decisão de rodá-lo em produção seja
 * tomada sabendo o tamanho da perda (ADR-0088, Consequências), e não descoberta depois.
 *
 * O que **sobrevive** também é afirmado: as linhas de `trip_field_reports` com `operation =
 * 'stop.depart'` não têm FK para o evento e ficam. Uma app velha nunca reusa aquelas chaves, então isso
 * é inofensivo — mas é melhor estar escrito do que ser descoberto como surpresa.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const STOP_DEPARTURE_MIGRATION_SUFFIX = '_stop_departure'

export type StopDepartureRollbackProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
  tripId: string
  userId: string
}>

async function readStopEventKinds(database: SQL, stopId: string): Promise<readonly string[]> {
  const rows = (await database`
    select kind from trip_stop_events where stop_id = ${stopId} order by kind
  `) as readonly { readonly kind: string }[]
  return rows.map((row) => row.kind)
}

async function columnExists(database: SQL, table: string, column: string): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
    where table_name = ${table} and column_name = ${column}
  `) as readonly unknown[]
  return rows.length > 0
}

export async function assertStopDepartureRollback(
  probe: StopDepartureRollbackProbe,
): Promise<void> {
  const { companyId, connectionString, database, tripId, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(STOP_DEPARTURE_MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('Stop departure migration is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const stopId = crypto.randomUUID()
  const idempotencyKey = `stop-departure-rollback-${crypto.randomUUID()}`
  await database`
    insert into trip_stops (
      id, company_id, trip_id, sequence, address_key, label, en_route_since, en_route_tapped_at
    )
    values (
      ${stopId}, ${companyId}, ${tripId}, 905, '3550308|01001000|905', 'Rollback, 905', now(), now()
    )
  `
  // A chegada fica: o rollback apaga os dois kinds novos, e **só** eles.
  await database`
    insert into trip_stop_events (company_id, stop_id, kind, actor_user_id)
    values (${companyId}, ${stopId}, 'arrived', ${userId})
  `
  await database`
    insert into trip_stop_events (company_id, stop_id, kind, tapped_at, actor_user_id)
    values (${companyId}, ${stopId}, 'departed', now(), ${userId})
  `
  await database`
    insert into trip_stop_events (company_id, stop_id, kind, tapped_at, actor_user_id)
    values (${companyId}, ${stopId}, 'departure_cancelled', now(), ${userId})
  `
  await database`
    insert into trip_field_reports (
      company_id, idempotency_key, operation, actor_user_id, channel, result_changed
    )
    values (${companyId}, ${idempotencyKey}, 'stop.depart', ${userId}, 'driver_app', false)
  `

  expect(await readStopEventKinds(database, stopId)).toEqual([
    'arrived',
    'departed',
    'departure_cancelled',
  ])
  expect(await readMigrationNames(database)).toContain(directory)

  await database.unsafe(rollback)

  // 1. Os dois kinds foram apagados, e a chegada ficou.
  expect(await readStopEventKinds(database, stopId)).toEqual(['arrived'])

  // 2. As colunas de "a caminho", o `tapped_at` e o `result_changed` caíram.
  expect(await columnExists(database, 'trip_stops', 'en_route_since')).toBe(false)
  expect(await columnExists(database, 'trip_stops', 'en_route_tapped_at')).toBe(false)
  expect(await columnExists(database, 'trip_stop_events', 'tapped_at')).toBe(false)
  expect(await columnExists(database, 'trip_field_reports', 'result_changed')).toBe(false)

  // 3. O CHECK antigo de `kind` voltou — o vocabulário encolheu de volta aos quatro.
  await expectQueryToFail(
    database`
      insert into trip_stop_events (company_id, stop_id, kind, actor_user_id)
      values (${companyId}, ${stopId}, 'departed', ${userId})
    `,
    '23514',
    'trip_stop_events_kind_check',
  )

  // 4. A linha do journal saiu, senão a migration nunca rodaria de novo.
  expect(await readMigrationNames(database)).not.toContain(directory)

  // 5. A chave de idempotência sobreviveu: ela não tem FK para o evento.
  const [{ total }] = (await database`
    select count(*)::int as total from trip_field_reports where idempotency_key = ${idempotencyKey}
  `) as [{ total: number }]
  expect(total).toBe(1)

  // Devolve o banco ao estado que o resto da suíte espera.
  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await columnExists(database, 'trip_stops', 'en_route_since')).toBe(true)

  await database`delete from trip_field_reports where idempotency_key = ${idempotencyKey}`
  await database`delete from trip_stop_events where stop_id = ${stopId}`
  await database`delete from trip_stops where id = ${stopId}`
}
