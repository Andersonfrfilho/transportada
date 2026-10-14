/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T004: a migration do estado do comprovante é aditiva — o histórico fica `null` —, o CHECK
 * recusa estado fora do vocabulário, o outbox só aceita comprovante da mesma empresa, e o rollback
 * recusa (em vez de apagar o pedido) enquanto houver comprovante esperando o tratamento ou evento
 * não publicado; sem eles, solta as colunas e a tabela, tira a migration do journal e a reaplicação
 * volta ao mesmo desenho.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_delivery_proof_processing'
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'
const ZERO_SHA256 = '0'.repeat(64)
const REFUSAL_PROOFS = 'still wait for processing'
const REFUSAL_EVENTS = 'outbox event(s) are not published'

export type DeliveryProofProcessingProbe = Readonly<{
  companyId: string
  connectionString: string
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

async function expectRollbackRefused(
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
  // O script abre `BEGIN` e a recusa deixa a transação abortada: o `ROLLBACK` vai pela mesma conexão.
  await database.unsafe('ROLLBACK')
  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(message)
}

async function columnExists(database: SQL, table: string, column: string): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
    where table_name = ${table} and column_name = ${column}
  `) as readonly unknown[]
  return rows.length > 0
}

async function tableExists(database: SQL, table: string): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.tables where table_name = ${table}
  `) as readonly unknown[]
  return rows.length > 0
}

export async function assertDeliveryProofProcessing(
  probe: DeliveryProofProcessingProbe,
): Promise<void> {
  const { companyId, connectionString, database, tripId, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('Delivery proof processing migration is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()

  const stopId = crypto.randomUUID()
  const eventId = crypto.randomUUID()
  await database`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${tripId}, 265, '3550308|01001000|265', 'Processando, 265')
  `
  await database`
    insert into trip_stop_events (id, company_id, stop_id, kind, actor_user_id)
    values (${eventId}, ${companyId}, ${stopId}, 'arrived', ${userId})
  `
  const originalObjectId = await insertStoredObject(database, companyId)
  const refusedObjectId = await insertStoredObject(database, companyId)
  const objectIds = [originalObjectId, refusedObjectId]

  // Linha que já existia antes do estado: o histórico fica nulo, sem backfill (RNF4).
  const proofId = crypto.randomUUID()
  await database`
    insert into trip_delivery_proofs (id, company_id, stop_event_id, kind, object_id, actor_user_id)
    values (${proofId}, ${companyId}, ${eventId}, 'photo', ${originalObjectId}, ${userId})
  `
  const [legacy] = (await database`
    select processing_state, original_object_id, processing_error
    from trip_delivery_proofs where id = ${proofId}
  `) as [{ processing_state: null; original_object_id: null; processing_error: null }]
  expect(legacy).toEqual({
    original_object_id: null,
    processing_error: null,
    processing_state: null,
  })

  await expectQueryToFail(
    database`update trip_delivery_proofs set processing_state = 'bogus' where id = ${proofId}`,
    CHECK_VIOLATION,
    'trip_delivery_proofs_processing_state_check',
  )
  await expectQueryToFail(
    database`
      update trip_delivery_proofs set original_object_id = ${crypto.randomUUID()}
      where id = ${proofId}
    `,
    FOREIGN_KEY_VIOLATION,
    'trip_delivery_proofs_company_original_fk',
  )

  await database`
    update trip_delivery_proofs
    set processing_state = 'received', original_object_id = ${originalObjectId}
    where id = ${proofId}
  `
  await expectQueryToFail(
    database`
      insert into delivery_proof_outbox (company_id, proof_id, event_type, correlation_id, payload)
      values (${companyId}, ${crypto.randomUUID()}, 'delivery-proof.processing.requested', 'c', '{}')
    `,
    FOREIGN_KEY_VIOLATION,
    'delivery_proof_outbox_company_proof_fk',
  )
  await expectQueryToFail(
    database`
      insert into delivery_proof_outbox (company_id, proof_id, event_type, correlation_id, payload)
      values (${companyId}, ${proofId}, 'other.event', 'c', '{}')
    `,
    CHECK_VIOLATION,
    'delivery_proof_outbox_event_type_check',
  )
  await database`
    insert into delivery_proof_outbox (company_id, proof_id, event_type, correlation_id, payload)
    values (${companyId}, ${proofId}, 'delivery-proof.processing.requested', 'c', '{}')
  `

  // O rollback recusa com trabalho pendente: `received`, depois `processing`.
  await expectRollbackRefused(database, rollback, REFUSAL_PROOFS)
  await database`update trip_delivery_proofs set processing_state = 'processing' where id = ${proofId}`
  await expectRollbackRefused(database, rollback, REFUSAL_PROOFS)

  // `ready` sem evento publicado: o pedido ainda existe, e o rollback não o apaga.
  await database`update trip_delivery_proofs set processing_state = 'ready' where id = ${proofId}`
  await expectRollbackRefused(database, rollback, REFUSAL_EVENTS)
  expect(await tableExists(database, 'delivery_proof_outbox')).toBe(true)

  // Sem pendência, o rollback solta colunas e tabela, mas o arquivo continua em `object_id`.
  await database`update delivery_proof_outbox set published_at = now() where proof_id = ${proofId}`
  const reserved = await database.reserve()
  await reserved.unsafe(rollback)
  reserved.release()
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await tableExists(database, 'delivery_proof_outbox')).toBe(false)
  for (const column of ['processing_state', 'original_object_id', 'processing_error']) {
    expect(await columnExists(database, 'trip_delivery_proofs', column)).toBe(false)
  }
  const [kept] = (await database`
    select object_id from trip_delivery_proofs where id = ${proofId}
  `) as [{ object_id: string }]
  expect(kept.object_id).toBe(originalObjectId)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await tableExists(database, 'delivery_proof_outbox')).toBe(true)
  const [reapplied] = (await database`
    select processing_state from trip_delivery_proofs where id = ${proofId}
  `) as [{ processing_state: null }]
  expect(reapplied.processing_state).toBeNull()

  // Esvazia o que a sonda gravou, na ordem das FKs: o rollback completo da suíte vem depois.
  await database`delete from trip_delivery_proofs where id = ${proofId}`
  await database`delete from trip_stop_events where id = ${eventId}`
  await database`delete from trip_stops where id = ${stopId}`
  for (const objectId of objectIds)
    await database`delete from stored_objects where id = ${objectId}`
}
