/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 D2: a migration grava em cada tipo de `flow: stop` qual dos 5 valores fixos ele
 * representa — primeiro pelo `kind` das ocorrências já amarradas ao tipo (sobrevive ao tipo
 * renomeado), depois pelo rótulo semeado, e o resto vira `other`. Tipo de nota fica nulo.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { migrationsDirectory } from './support.js'

const MIGRATION_SUFFIX = '_occurrence_type_stop_kind'

export type OccurrenceStopKindBackfillProbe = Readonly<{
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

async function insertType(
  database: SQL,
  input: { companyId: string; flow: string; id: string; name: string },
): Promise<void> {
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, flow)
    values (${input.id}, ${input.companyId}, ${input.name}, 'delivery', ${input.flow})
  `
}

async function readStopKind(database: SQL, typeId: string): Promise<string | null> {
  const [row] = (await database`
    select stop_kind from company_occurrence_types where id = ${typeId}
  `) as [{ stop_kind: string | null }]
  return row.stop_kind
}

export async function assertOccurrenceStopKindBackfill(
  probe: OccurrenceStopKindBackfillProbe,
): Promise<void> {
  const { companyId, connectionString, database, tripId, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('Occurrence stop kind migration is required')

  await database.unsafe(await readRollback(directory))

  const renamedTypeId = crypto.randomUUID()
  const operatorTypeId = crypto.randomUUID()
  const documentTypeId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const occurrenceId = crypto.randomUUID()

  /** Semeado como "Cobrança inesperada" e renomeado pelo operador antes desta migration. */
  await insertType(database, {
    companyId,
    flow: 'stop',
    id: renamedTypeId,
    name: 'Taxa cobrada na portaria',
  })
  await insertType(database, {
    companyId,
    flow: 'stop',
    id: operatorTypeId,
    name: 'Portão trancado',
  })
  await insertType(database, {
    companyId,
    flow: 'document',
    id: documentTypeId,
    name: 'Cliente ausente 218',
  })
  await database`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${tripId}, 1, 'probe-address-218-d2', 'Parada de prova 218 D2')
  `
  await database`
    insert into trip_stop_occurrences (id, company_id, stop_id, kind, actor_user_id, occurrence_type_id)
    values (${occurrenceId}, ${companyId}, ${stopId}, 'unexpected_charge', ${userId}, ${renamedTypeId})
  `

  await runDatabaseMigrations({ connectionString })

  expect(await readStopKind(database, renamedTypeId)).toBe('unexpected_charge')
  expect(await readStopKind(database, operatorTypeId)).toBe('other')
  expect(await readStopKind(database, documentTypeId)).toBeNull()

  const seeded = (await database`
    select name, stop_kind
    from company_occurrence_types
    where company_id = ${companyId} and flow = 'stop' and name = 'Espera longa'
  `) as { name: string; stop_kind: string | null }[]
  expect(seeded.length).toBeGreaterThan(0)
  expect(seeded.every((row) => row.stop_kind === 'long_wait')).toBe(true)

  const [unclassified] = (await database`
    select count(*)::int as total
    from company_occurrence_types
    where flow = 'stop' and stop_kind is null
  `) as [{ total: number }]
  expect(unclassified.total).toBe(0)

  await database`delete from trip_stop_occurrences where id = ${occurrenceId}`
  await database`delete from trip_stops where id = ${stopId}`
  await database`
    delete from company_occurrence_types
    where id in (${renamedTypeId}, ${operatorTypeId}, ${documentTypeId})
  `
}
