/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T2 / ADR-0068 §3: o histórico de status e o canal `backoffice` não são desfeitos com
 * dado gravado — o rollback recusa, em bloco `DO $$`, enquanto `trip_status_events` tiver qualquer
 * linha ou `channel = 'backoffice'` estiver presente em qualquer uma das seis tabelas de campo.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { migrationsDirectory } from './support.js'

const TRIP_STATUS_EVENTS_MIGRATION_SUFFIX = '_trip_status_events'

const TRIP_STATUS_EVENTS_REFUSAL_MESSAGE = 'trip_status_events has rows, refusing rollback'
const TRIP_FIELD_REPORTS_REFUSAL_MESSAGE =
  'trip_field_reports has rows with channel backoffice, refusing rollback'

export type TripStatusEventRollbackProbe = {
  readonly companyId: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function expectRollbackRefusal(
  database: SQL,
  rollback: string,
  message: string,
): Promise<void> {
  let refusal: unknown
  try {
    await database.unsafe(rollback)
  } catch (error) {
    refusal = error
  }
  await database.unsafe('ROLLBACK')

  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(message)
}

export async function assertTripStatusEventRollbackRefusesRecordedHistory(
  probe: TripStatusEventRollbackProbe,
): Promise<void> {
  const { companyId, database, directories, tripId, userId } = probe
  const directory = directories.find((name) => name.endsWith(TRIP_STATUS_EVENTS_MIGRATION_SUFFIX))
  if (directory === undefined) {
    throw new Error('trip_status_events migration is required')
  }

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  // Uma linha de histórico já basta para recusar — o rollback não devolve status a um estado sem
  // trilha nenhuma.
  await database`
    insert into trip_status_events (company_id, trip_id, from_status, to_status, actor_user_id)
    values (${companyId}, ${tripId}, 'draft', 'route_planned', ${userId})
  `
  await expectRollbackRefusal(database, rollback, TRIP_STATUS_EVENTS_REFUSAL_MESSAGE)
  await database`delete from trip_status_events where company_id = ${companyId}`

  // Sem histórico de status, mas com `backoffice` gravado numa das seis tabelas de campo — o
  // rollback ainda recusa, porque encolher o vocabulário apagaria a autoria dessa linha.
  await database`
    insert into trip_field_reports (company_id, idempotency_key, operation, actor_user_id, channel)
    values (${companyId}, 'rollback-probe-backoffice', 'close', ${userId}, 'backoffice')
  `
  await expectRollbackRefusal(database, rollback, TRIP_FIELD_REPORTS_REFUSAL_MESSAGE)
  await database`delete from trip_field_reports where company_id = ${companyId} and channel = 'backoffice'`
}
