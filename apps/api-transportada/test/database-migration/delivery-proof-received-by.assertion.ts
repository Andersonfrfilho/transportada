/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 (ADR-0079 Parte A), CA08 e CA14: quem recebeu é coluna do comprovante, nunca da foto da
 * carga; a foto do motorista passa a levar o nome; a migration aborta antes de trocar o
 * `receiver_check` se houver `cargo` com nome; e o rollback recusa enquanto houver o que ele apagaria.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'
import { join } from 'node:path'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { expectQueryToFail, migrationsDirectory } from './support.js'

const RECEIVED_BY_MIGRATION_SUFFIX = '_delivery_proof_received_by'
const CHECK_VIOLATION = '23514'
const PRE_CHECK_REFUSAL = 'refusing spec 193 receiver_check'
const ROLLBACK_REFUSALS = {
  driverPhotoName: 'trip_delivery_proofs has driver photos with receiver_name, refusing rollback',
  receivedBy: 'trip_delivery_proofs has received_by data, refusing rollback',
  settings: 'delivery proof settings have a received_by choice, refusing rollback',
} as const
const ZERO_SHA256 = '0'.repeat(64)

export type DeliveryProofReceivedByProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
  driverId: string
  tripId: string
  userId: string
}>

type ProofRow = Readonly<{
  channel?: 'driver_app' | 'office'
  kind: 'cargo' | 'photo' | 'signature'
  receivedBy?: string | null
  receivedByDetail?: string | null
  receiverName?: string
}>

type ProbeContext = Readonly<{
  eventId: string
  /** Todo objeto criado, inclusive o das inserções recusadas — a limpeza apaga todos. */
  objectIds: string[]
  probe: DeliveryProofReceivedByProbe
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

async function insertProof(context: ProbeContext, row: ProofRow): Promise<void> {
  const { companyId, database, driverId, userId } = context.probe
  const objectId = await insertStoredObject(database, companyId)
  context.objectIds.push(objectId)
  const channel = row.channel ?? 'driver_app'
  await database`
    insert into trip_delivery_proofs (
      company_id, stop_event_id, kind, object_id, actor_user_id, channel, on_behalf_of_driver_id,
      receiver_name, received_by, received_by_detail
    ) values (
      ${companyId}, ${context.eventId}, ${row.kind}, ${objectId}, ${userId}, ${channel},
      ${channel === 'office' ? driverId : null}, ${row.receiverName ?? ''},
      ${row.receivedBy ?? null}, ${row.receivedByDetail ?? null}
    )
  `
}

async function readRollback(directory: string): Promise<string> {
  return Bun.file(join(migrationsDirectory.pathname, directory, 'rollback.sql')).text()
}

async function expectRollbackRefused(
  database: SQL,
  input: Readonly<{ message: string; rollback: string }>,
): Promise<void> {
  let refusal: unknown
  try {
    await database.unsafe(input.rollback)
  } catch (error) {
    refusal = error
  }
  await database.unsafe('ROLLBACK')
  expect(refusal).toBeInstanceOf(Error)
  expect((refusal as Error).message).toContain(input.message)
}

async function countReceivedBy(database: SQL, eventId: string): Promise<number> {
  const [{ total }] = (await database`
    select count(*)::int as total from trip_delivery_proofs
    where stop_event_id = ${eventId} and received_by is not null
  `) as [{ total: number }]
  return total
}

/** CA08: os CHECKs recusam `cargo` com relação ou nome, e aceitam a foto do motorista com os três. */
async function assertChecks(context: ProbeContext): Promise<void> {
  const { database } = context.probe
  await expectQueryToFail(
    insertProof(context, { kind: 'cargo', receivedBy: 'neighbor' }),
    CHECK_VIOLATION,
    'trip_delivery_proofs_received_by_kind_check',
  )
  await expectQueryToFail(
    insertProof(context, { kind: 'cargo', receiverName: 'Maria' }),
    CHECK_VIOLATION,
    'trip_delivery_proofs_receiver_check',
  )
  await expectQueryToFail(
    insertProof(context, { kind: 'photo', receivedBy: 'cousin' }),
    CHECK_VIOLATION,
    'trip_delivery_proofs_received_by_check',
  )
  await expectQueryToFail(
    insertProof(context, { kind: 'photo', receivedByDetail: 'casa 12' }),
    CHECK_VIOLATION,
    'trip_delivery_proofs_received_by_detail_check',
  )
  await expectQueryToFail(
    database`
      update company_delivery_proof_settings set received_by = 'maybe'
      where company_id = ${context.probe.companyId}
    `,
    CHECK_VIOLATION,
    'company_delivery_proof_settings_received_by_check',
  )

  // D4: a foto do motorista leva nome, relação e detalhe; `other` sem detalhe também grava (D2)
  await insertProof(context, {
    kind: 'photo',
    receivedBy: 'neighbor',
    receivedByDetail: 'casa 12',
    receiverName: 'Maria',
  })
  await insertProof(context, { kind: 'signature', receivedBy: 'other', receiverName: 'João' })
  expect(await countReceivedBy(database, context.eventId)).toBe(2)
}

/** CA14: o rollback recusa com relação gravada, com nome na foto do motorista e com configuração. */
async function assertRollbackRefusals(context: ProbeContext, rollback: string): Promise<void> {
  const { companyId, database } = context.probe
  await expectRollbackRefused(database, { message: ROLLBACK_REFUSALS.receivedBy, rollback })
  expect(await countReceivedBy(database, context.eventId)).toBe(2)

  await database`
    update trip_delivery_proofs set received_by = null, received_by_detail = null
    where stop_event_id = ${context.eventId}
  `
  await expectRollbackRefused(database, { message: ROLLBACK_REFUSALS.driverPhotoName, rollback })

  await database`delete from trip_delivery_proofs where stop_event_id = ${context.eventId} and kind = 'photo'`
  await database`
    update company_delivery_proof_settings set received_by = 'required'
    where company_id = ${companyId}
  `
  await expectRollbackRefused(database, { message: ROLLBACK_REFUSALS.settings, rollback })
  await database`
    update company_delivery_proof_settings set received_by = 'optional'
    where company_id = ${companyId}
  `
}

/** Antes da migration as colunas novas não existem: a linha antiga, gravada pelo escritório. */
async function insertLegacyOfficeCargoWithName(context: ProbeContext): Promise<void> {
  const { companyId, database, driverId, userId } = context.probe
  const objectId = await insertStoredObject(database, companyId)
  context.objectIds.push(objectId)
  await database`
    insert into trip_delivery_proofs (
      company_id, stop_event_id, kind, object_id, actor_user_id, channel, on_behalf_of_driver_id,
      receiver_name
    ) values (
      ${companyId}, ${context.eventId}, 'cargo', ${objectId}, ${userId}, 'office', ${driverId},
      'Maria'
    )
  `
}

/**
 * A verificação prévia: com a migration desfeita (sem dado, o rollback passa), um `cargo` com nome
 * gravado pelo escritório — que o CHECK antigo aceitava — faz a migration abortar com o motivo.
 */
async function assertPreCheck(context: ProbeContext, rollback: string): Promise<void> {
  const { connectionString, database } = context.probe
  await database.unsafe(rollback)
  await insertLegacyOfficeCargoWithName(context)

  let refusal: unknown
  try {
    await runDatabaseMigrations({ connectionString })
  } catch (error) {
    refusal = error
  }
  expect(refusal).toBeInstanceOf(Error)
  const cause = (refusal as Error & { cause?: unknown }).cause
  expect(`${String(refusal)} ${String(cause)}`).toContain(PRE_CHECK_REFUSAL)

  await database`delete from trip_delivery_proofs where stop_event_id = ${context.eventId} and kind = 'cargo'`
  await runDatabaseMigrations({ connectionString })
  expect(await countReceivedBy(database, context.eventId)).toBe(0)
}

export async function assertDeliveryProofReceivedBy(
  probe: DeliveryProofReceivedByProbe,
): Promise<void> {
  const { companyId, database, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(RECEIVED_BY_MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('Delivery proof received-by migration is required')
  const rollback = await readRollback(directory)

  const stopId = crypto.randomUUID()
  const eventId = crypto.randomUUID()
  await database`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${probe.tripId}, 2, '3550308|01001000|193', 'Recebido, 193')
  `
  await database`
    insert into trip_stop_events (id, company_id, stop_id, kind, actor_user_id)
    values (${eventId}, ${companyId}, ${stopId}, 'arrived', ${userId})
  `
  /** A empresa da sonda nasce depois da migration da spec 159, que criou a linha geral das antigas. */
  const createdSettings = (await database`
    insert into company_delivery_proof_settings (company_id) values (${companyId})
    on conflict (company_id) do nothing
    returning company_id
  `) as readonly unknown[]
  const context: ProbeContext = { eventId, objectIds: [], probe }

  await assertChecks(context)
  await assertRollbackRefusals(context, rollback)
  await assertPreCheck(context, rollback)

  // Esvazia o que a sonda gravou, na ordem das FKs: o rollback completo da suíte vem depois
  await database`delete from trip_delivery_proofs where stop_event_id = ${eventId}`
  await database`delete from trip_stop_events where id = ${eventId}`
  await database`delete from trip_stops where id = ${stopId}`
  for (const objectId of context.objectIds) {
    await database`delete from stored_objects where id = ${objectId}`
  }
  if (createdSettings.length > 0) {
    await database`delete from company_delivery_proof_settings where company_id = ${companyId}`
  }
}
