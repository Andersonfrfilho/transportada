/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 T1.4: o CHECK de coordenada aceita `whatsapp`, continua recusando os outros canais, e o
 * rollback recusa (em vez de apagar) enquanto houver ponto de WhatsApp gravado.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_event_location_whatsapp_coordinate'

export type EventLocationWhatsappRollbackProbe = {
  readonly companyId: string
  readonly database: SQL
  readonly directories: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function captureError(operation: () => Promise<unknown>): Promise<Error> {
  try {
    await operation()
  } catch (error) {
    return error as Error
  }
  throw new Error('expected the statement to be refused')
}

export async function assertEventLocationWhatsappRollbackRefusesRecordedPoints(
  probe: EventLocationWhatsappRollbackProbe,
): Promise<void> {
  const { companyId, database, directories, tripId, userId } = probe
  const directory = directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('event_location_whatsapp_coordinate is required')

  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  await database`
    insert into trip_status_events
      (company_id, trip_id, from_status, to_status, actor_user_id, channel,
       latitude, longitude, captured_at, location_state)
    values (${companyId}, ${tripId}, 'draft', 'route_planned', ${userId}, 'whatsapp',
       -23.5505199, -46.6333094, now(), 'captured')
  `

  const backofficeWithPoint = await captureError(
    () => database`
      insert into trip_status_events
        (company_id, trip_id, from_status, to_status, actor_user_id, channel,
         latitude, longitude, captured_at, location_state)
      values (${companyId}, ${tripId}, 'draft', 'route_planned', ${userId}, 'backoffice',
         -23.5505199, -46.6333094, now(), 'captured')
    `,
  )
  expect(backofficeWithPoint.message).toContain('trip_status_events_coordinates_channel_check')

  const refusal = await captureError(() => database.unsafe(rollback))
  await database.unsafe('ROLLBACK')
  expect(refusal.message).toContain('Rollback recusado')
  expect(refusal.message).toContain('trip_status_events=1')
  expect(refusal.message).not.toContain('trip_stop_occurrences')

  const [row] = await database<{ remaining: number }[]>`
    select count(*)::int as remaining from trip_status_events
    where company_id = ${companyId} and channel = 'whatsapp' and latitude is not null
  `
  expect(row?.remaining).toBe(1)

  await database`delete from trip_status_events where company_id = ${companyId} and channel = 'whatsapp'`
}
