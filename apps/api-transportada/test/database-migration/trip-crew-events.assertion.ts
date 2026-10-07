/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.3: o histórico das transferências de tripulação é append-only, guarda o retrato da
 * tripulação (nunca vazia depois da troca), recusa motivo vazio ou longo e um custo cuja diferença
 * não fecha com antes e depois. O rollback recusa enquanto houver transferência gravada, e sem ela
 * tira a tabela, o trigger e a linha do journal — a migration volta a aplicar.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_trip_crew_events'
const CHECK_VIOLATION = '23514'
const APPEND_ONLY = '55000'
const REASON_MAXIMUM_LENGTH = 500

export type TripCrewEventsProbe = {
  readonly companyId: string
  readonly connectionString: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly tripId: string
  readonly userId: string
}

type CrewEventValues = {
  readonly channel?: string
  readonly costAfter?: string
  readonly costBefore?: string
  readonly costDifference?: string
  readonly nextCrew?: string
  readonly previousCrew?: string
  readonly reason?: string
}

const MEMBER = (driverId: string, role: string) =>
  `{"driverId":"${driverId}","name":"Nome","position":1,"role":"${role}"}`

async function insertCrewEvent(probe: TripCrewEventsProbe, values: CrewEventValues = {}) {
  const previousCrew = values.previousCrew ?? `[${MEMBER(crypto.randomUUID(), 'driver')}]`
  const nextCrew = values.nextCrew ?? `[${MEMBER(crypto.randomUUID(), 'driver')}]`

  return probe.database`
    insert into trip_crew_events
      (company_id, trip_id, actor_user_id, channel, reason, previous_crew, next_crew,
       cost_before, cost_after, cost_difference, cost_has_gaps, mdfe_driver_divergence)
    values (${probe.companyId}, ${probe.tripId}, ${probe.userId}, ${values.channel ?? 'office'},
       ${values.reason ?? 'Motorista passou mal'}, ${previousCrew}::text::jsonb, ${nextCrew}::text::jsonb,
       ${values.costBefore ?? '1200.00'}, ${values.costAfter ?? '1350.00'},
       ${values.costDifference ?? '150.00'}, false, true)
  `
}

async function assertEventRules(probe: TripCrewEventsProbe) {
  const rule = (name: string) => `trip_crew_events_${name}_check`
  const rejected = (values: CrewEventValues, name: string) =>
    expectQueryToFail(insertCrewEvent(probe, values), CHECK_VIOLATION, rule(name))

  await rejected({ reason: '' }, 'reason')
  await rejected({ reason: 'x'.repeat(REASON_MAXIMUM_LENGTH + 1) }, 'reason')
  await rejected({ channel: 'mobile' }, 'channel')
  await rejected({ nextCrew: '[]' }, 'crew_shape')
  await rejected({ nextCrew: '{}' }, 'crew_shape')
  await rejected({ previousCrew: '"nobody"' }, 'crew_shape')
  await rejected({ costDifference: '149.99' }, 'cost_difference')
  await rejected(
    { costBefore: '1350.00', costAfter: '1200.00', costDifference: '150.00' },
    'cost_difference',
  )

  await insertCrewEvent(probe, { reason: 'x'.repeat(REASON_MAXIMUM_LENGTH) })
  await insertCrewEvent(probe, {
    costAfter: '1000.00',
    costBefore: '1200.00',
    costDifference: '-200.00',
    nextCrew: `[${MEMBER(crypto.randomUUID(), 'driver')},${MEMBER(crypto.randomUUID(), 'helper')}]`,
  })
}

async function assertAppendOnly(probe: TripCrewEventsProbe) {
  const { database } = probe

  await expectQueryToFail(database`update trip_crew_events set reason = 'x'`, APPEND_ONLY)
  await expectQueryToFail(database`delete from trip_crew_events`, APPEND_ONLY)
}

async function runRollback(database: SQL, rollback: string): Promise<Error | undefined> {
  const reserved = await database.reserve()
  try {
    await reserved.unsafe(rollback)
    return undefined
  } catch (error) {
    await reserved.unsafe('ROLLBACK')
    return error as Error
  } finally {
    reserved.release()
  }
}

async function countCrewEventObjects(database: SQL): Promise<number> {
  const [row] = await database<{ count: number }[]>`
    select (
      (select count(*) from information_schema.tables where table_name = 'trip_crew_events') +
      (select count(*) from pg_proc where proname = 'reject_trip_crew_events_mutation')
    )::int as count
  `

  return row?.count ?? 0
}

export async function assertTripCrewEvents(probe: TripCrewEventsProbe): Promise<void> {
  const { database } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('trip_crew_events migration is required')

  await assertEventRules(probe)
  await assertAppendOnly(probe)

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect((await runRollback(database, rollback))?.message).toContain('crew transfer')
  expect(await countCrewEventObjects(database)).toBe(2)

  await database.unsafe('ALTER TABLE trip_crew_events DISABLE TRIGGER USER')
  await database`delete from trip_crew_events where company_id = ${probe.companyId}`
  expect(await runRollback(database, rollback)).toBeUndefined()
  expect(await countCrewEventObjects(database)).toBe(0)

  await runDatabaseMigrations({ connectionString: probe.connectionString })
  expect(await countCrewEventObjects(database)).toBe(2)
}
