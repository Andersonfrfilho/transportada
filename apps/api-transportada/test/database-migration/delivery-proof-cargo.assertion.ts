/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 184: a foto da carga **soma** — duas no mesmo evento convivem —, enquanto o canhoto continua
 * "o segundo substitui". E o rollback recusa enquanto houver foto de carga: recriar o `check` antigo
 * sem checar apagaria em silêncio a prova que o operador anexou.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { migrationsDirectory } from './support.js'

const CARGO_MIGRATION_SUFFIX = '_delivery_proof_cargo_kind'
const CARGO_REFUSAL_MESSAGE = 'trip_delivery_proofs has cargo rows, refusing rollback'
const ZERO_SHA256 = '0'.repeat(64)

export type DeliveryProofCargoProbe = Readonly<{
  companyId: string
  database: SQL
  directories: readonly string[]
  tripId: string
  userId: string
}>

async function insertStoredObject(database: SQL, companyId: string): Promise<string> {
  const id = crypto.randomUUID()
  await database`
    insert into stored_objects (
      id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose
    ) values (
      ${id}, ${companyId}, 's3', 'operational', ${`proof/${id}.jpg`}, 'image/jpeg', 1024,
      ${ZERO_SHA256}, 'final', 'delivery_proof'
    )
  `
  return id
}

async function insertProof(
  database: SQL,
  input: Readonly<{ companyId: string; eventId: string; kind: string; userId: string }>,
): Promise<void> {
  const objectId = await insertStoredObject(database, input.companyId)
  await database`
    insert into trip_delivery_proofs (company_id, stop_event_id, kind, object_id, actor_user_id)
    values (${input.companyId}, ${input.eventId}, ${input.kind}, ${objectId}, ${input.userId})
  `
}

async function captureFailure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run()
  } catch (error) {
    return error
  }
  return undefined
}

export async function assertDeliveryProofCargoSumsAndGuardsRollback(
  probe: DeliveryProofCargoProbe,
): Promise<void> {
  const { companyId, database, userId } = probe
  const stopId = crypto.randomUUID()
  const eventId = crypto.randomUUID()
  await database`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${probe.tripId}, 1, '3550308|01001000|182', 'Carga, 182')
  `
  await database`
    insert into trip_stop_events (id, company_id, stop_id, kind, actor_user_id)
    values (${eventId}, ${companyId}, ${stopId}, 'arrived', ${userId})
  `

  // CA01: duas fotos de carga no mesmo evento convivem
  await insertProof(database, { companyId, eventId, kind: 'cargo', userId })
  await insertProof(database, { companyId, eventId, kind: 'cargo', userId })

  // CA02: o canhoto continua único por evento — o segundo esbarra na unicidade parcial
  await insertProof(database, { companyId, eventId, kind: 'photo', userId })
  const duplicatePhoto = await captureFailure(() =>
    insertProof(database, { companyId, eventId, kind: 'photo', userId }),
  )
  expect(String(duplicatePhoto)).toContain('trip_delivery_proofs_company_event_kind_unique')

  // CA08: com foto de carga gravada, o rollback recusa e não apaga nada
  const directory = probe.directories.find((name) => name.endsWith(CARGO_MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('Delivery proof cargo migration is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const refusal = await captureFailure(() => database.unsafe(rollback))
  await database.unsafe('ROLLBACK')
  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(CARGO_REFUSAL_MESSAGE)

  const [{ cargo }] = (await database`
    select count(*)::int as cargo from trip_delivery_proofs
    where stop_event_id = ${eventId} and kind = 'cargo'
  `) as [{ cargo: number }]
  expect(cargo).toBe(2)

  // Esvazia o que a sonda gravou, na ordem das FKs: o rollback completo da suíte vem depois
  const objects = (await database`
    delete from trip_delivery_proofs where stop_event_id = ${eventId} returning object_id
  `) as { object_id: string }[]
  await database`delete from trip_stop_events where id = ${eventId}`
  await database`delete from trip_stops where id = ${stopId}`
  for (const { object_id: objectId } of objects) {
    await database`delete from stored_objects where id = ${objectId}`
  }
}
