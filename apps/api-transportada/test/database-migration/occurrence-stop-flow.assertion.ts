/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B5: a migration insere, uma vez por empresa, os 5 tipos de `flow: 'stop'` que
 * correspondem a `TRIP_STOP_OCCURRENCE_KINDS`, e faz o backfill de `trip_stop_occurrences.kind` →
 * `occurrence_type_id` pela empresa e pelo `kind`. Este teste roda a migration contra um banco que
 * já tem uma `trip_stop_occurrences` gravada **antes** dela (o caso comum: viagem real com "Deu
 * problema" registrado), e confere que o backfill acha o tipo certo sem perder o `kind` histórico.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_stop_flow'

/** Os cinco rótulos que `DRIVER_OCCURRENCE_KINDS` já mostra hoje — confirmados em `driverTrip.locale.json`. */
const KIND_LABELS: Record<string, string> = {
  appointment_required: 'Exigiram agendamento',
  dock_closed: 'Doca interditada',
  long_wait: 'Espera longa',
  other: 'Outro',
  unexpected_charge: 'Cobrança inesperada',
}

export type OccurrenceStopFlowBackfillProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
  tripId: string
  userId: string
}>

async function readRollback(directory: string): Promise<string> {
  const { join } = await import('node:path')
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

export async function assertOccurrenceStopFlowBackfill(
  probe: OccurrenceStopFlowBackfillProbe,
): Promise<void> {
  const { companyId, connectionString, database, tripId, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) {
    throw new Error('Occurrence stop flow migration is required')
  }
  const rollback = await readRollback(directory)

  // Desfaz só esta migration: `flow` e `occurrence_type_id` somem, como se ela nunca tivesse rodado.
  await database.unsafe(rollback)

  const stopId = crypto.randomUUID()
  const occurrenceId = crypto.randomUUID()

  await database`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${tripId}, 1, 'probe-address-218', 'Parada de prova 218')
  `
  // A viagem real de "Deu problema", gravada antes de a migration existir — só `kind`, sem tipo.
  await database`
    insert into trip_stop_occurrences (id, company_id, stop_id, kind, actor_user_id)
    values (${occurrenceId}, ${companyId}, ${stopId}, 'long_wait', ${userId})
  `

  await runDatabaseMigrations({ connectionString })

  for (const [kind, name] of Object.entries(KIND_LABELS)) {
    const [type] = (await database`
      select flow, attachment_mode, leaves_document_behind, redelivery_policy, emails_contractor
      from company_occurrence_types
      where company_id = ${companyId} and stage = 'delivery' and flow = 'stop' and name = ${name}
    `) as [
      {
        flow: string
        attachment_mode: string
        leaves_document_behind: boolean
        redelivery_policy: string
        emails_contractor: boolean
      },
    ]
    expect(type, `expected a seeded type for kind ${kind}`).toBeDefined()
    expect(type.flow).toBe('stop')
    expect(type.attachment_mode).toBe('optional')
    expect(type.leaves_document_behind).toBe(false)
    expect(type.redelivery_policy).toBe('unset')
    expect(type.emails_contractor).toBe(false)
  }

  const [occurrence] = (await database`
    select kind, occurrence_type_id
    from trip_stop_occurrences
    where id = ${occurrenceId}
  `) as [{ kind: string; occurrence_type_id: string | null }]
  expect(occurrence.kind).toBe('long_wait')
  expect(occurrence.occurrence_type_id).not.toBeNull()

  const [matchedType] = (await database`
    select name, flow
    from company_occurrence_types
    where id = ${occurrence.occurrence_type_id}
  `) as [{ name: string; flow: string }]
  expect(matchedType.name).toBe('Espera longa')
  expect(matchedType.flow).toBe('stop')

  await database`delete from trip_stop_occurrences where id = ${occurrenceId}`
  await database`delete from trip_stops where id = ${stopId}`
}
