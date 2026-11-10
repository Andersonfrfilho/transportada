/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 T1 (Etapa 1, banco): a cobrança no recebimento vai para os acertos. Prova, contra o Postgres: a CHECK
 * de valor aceita `0` só para `receiving_charge`; a linha só existe amarrada à ocorrência de parada, com nota ou
 * marcador de agrupada; o reenvio não duplica (índices únicos parciais por nota e por agrupada); o PIX é
 * obrigatório quando o motorista pagou; as vagas e as fotos são únicas por chave; a semeadura do tipo
 * `unexpected_charge` renomeia só o nome padrão, desliga o e-mail à contratante e cria as duas vagas obrigatórias,
 * e é idempotente. O rollback recusa com dado gravado e, sem ele, desfaz tudo; a migration reaplica.
 */
import { join } from 'node:path'

import type { SQL } from 'bun'
import { expect } from 'bun:test'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
} from './business-calendar-constraints.assertion.js'
import { expectQueryToFail, migrationsDirectory, readMigrationNames } from './support.js'

const MIGRATION_SUFFIX = '_receiving_charge_to_settlements'
const DEFAULT_NAME = 'Cobrança inesperada'
const NEW_NAME = 'Cobrança no recebimento'

export type ReceivingChargeProbe = Readonly<{
  companyId: string
  connectionString: string
  database: SQL
  directories: readonly string[]
  tripId: string
  userId: string
}>

async function columnExists(database: SQL, table: string, column: string): Promise<boolean> {
  const rows = (await database`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = ${table} and column_name = ${column}
  `) as unknown[]
  return rows.length === 1
}

async function insertStopType(
  database: SQL,
  companyId: string,
  name: string,
  stopKind: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, flow, stop_kind, emails_contractor)
    values (${id}, ${companyId}, ${name}, 'delivery', 'stop', ${stopKind}, true)
  `
  return id
}

async function insertCharge(
  database: SQL,
  input: {
    amount: string
    chargeType: string
    clientId: string
    companyId: string
    documentId: null | string
    grouped?: boolean
    origin?: string
    status?: string
    stopOccurrenceId: null | string
  },
): Promise<void> {
  await database`
    insert into delivery_charges (
      company_id, delivery_client_id, trip_document_id, stop_occurrence_id, grouped_documents,
      charge_type, amount, charged_on, status, origin
    ) values (
      ${input.companyId}, ${input.clientId}, ${input.documentId}, ${input.stopOccurrenceId},
      ${input.grouped ?? false}, ${input.chargeType}, ${input.amount}, '2026-11-10',
      ${input.status ?? 'recorded'}, ${input.origin ?? 'occurrence'}
    )
  `
}

export async function assertReceivingCharge(probe: ReceivingChargeProbe): Promise<void> {
  const { companyId, connectionString, database, tripId, userId } = probe
  const directory = probe.directories.find((name) => name.endsWith(MIGRATION_SUFFIX))
  if (directory === undefined) throw new Error('receiving_charge_to_settlements is required')
  const rollback = await Bun.file(
    join(migrationsDirectory.pathname, directory, 'rollback.sql'),
  ).text()
  expect(rollback).toContain('refusing to roll back spec 317')

  expect(await columnExists(database, 'delivery_charges', 'stop_occurrence_id')).toBe(true)

  const stopId = crypto.randomUUID()
  const occurrenceId = crypto.randomUUID()
  const otherOccurrenceId = crypto.randomUUID()
  const clientId = crypto.randomUUID()
  const documentA = crypto.randomUUID()
  const documentB = crypto.randomUUID()
  await database`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${stopId}, ${companyId}, ${tripId}, 91, 'probe-address-317', 'Parada de prova 317')
  `
  for (const id of [occurrenceId, otherOccurrenceId]) {
    await database`
      insert into trip_stop_occurrences (id, company_id, stop_id, kind, actor_user_id)
      values (${id}, ${companyId}, ${stopId}, 'unexpected_charge', ${userId})
    `
  }
  await database`
    insert into delivery_clients (id, company_id, tax_id, display_name)
    values (${clientId}, ${companyId}, ${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}, 'Cliente 317')
  `
  const base = { clientId, companyId, stopOccurrenceId: occurrenceId }

  // `0` é valor declarado (spec 247): vale para a cobrança no recebimento e para mais nenhuma.
  await insertCharge(database, {
    ...base,
    amount: '0',
    chargeType: 'receiving_charge',
    documentId: documentA,
  })
  await expectQueryToFail(
    insertCharge(database, {
      amount: '0',
      chargeType: 'other',
      clientId,
      companyId,
      documentId: null,
      origin: 'manual',
      stopOccurrenceId: null,
    }),
    CHECK_VIOLATION,
    'delivery_charges_amount_check',
  )

  // Reenvio da fila: a mesma nota na mesma ocorrência não duplica; outra nota ou outra ocorrência, sim.
  await expectQueryToFail(
    insertCharge(database, {
      ...base,
      amount: '10',
      chargeType: 'receiving_charge',
      documentId: documentA,
    }),
    UNIQUE_VIOLATION,
    'delivery_charges_stop_occurrence_document_unique',
  )
  await insertCharge(database, {
    ...base,
    amount: '12.5',
    chargeType: 'receiving_charge',
    documentId: documentB,
  })
  await insertCharge(database, {
    ...base,
    amount: '1',
    chargeType: 'receiving_charge',
    documentId: documentA,
    stopOccurrenceId: otherOccurrenceId,
  })

  // Linha agrupada: uma por ocorrência, sem nota própria.
  await insertCharge(database, {
    ...base,
    amount: '30',
    chargeType: 'receiving_charge',
    documentId: null,
    grouped: true,
    stopOccurrenceId: otherOccurrenceId,
  })
  await expectQueryToFail(
    insertCharge(database, {
      ...base,
      amount: '31',
      chargeType: 'receiving_charge',
      documentId: null,
      grouped: true,
      stopOccurrenceId: otherOccurrenceId,
    }),
    UNIQUE_VIOLATION,
    'delivery_charges_stop_occurrence_grouped_unique',
  )

  // O discriminador: sem ocorrência, sem origem de ocorrência ou sem nota, o tipo é recusado.
  for (const bad of [
    { documentId: documentA, origin: 'occurrence', stopOccurrenceId: null },
    { documentId: documentB, origin: 'manual', stopOccurrenceId: occurrenceId },
    { documentId: null, origin: 'occurrence', stopOccurrenceId: occurrenceId },
  ]) {
    await expectQueryToFail(
      insertCharge(database, {
        amount: '5',
        chargeType: 'receiving_charge',
        clientId,
        companyId,
        ...bad,
      }),
      CHECK_VIOLATION,
      'delivery_charges_receiving_charge_check',
    )
  }
  await expectQueryToFail(
    insertCharge(database, {
      amount: '5',
      chargeType: 'other',
      clientId,
      companyId,
      documentId: null,
      origin: 'manual',
      stopOccurrenceId: occurrenceId,
    }),
    CHECK_VIOLATION,
    'delivery_charges_stop_occurrence_type_check',
  )

  // Notas da linha agrupada: a nota precisa existir.
  const [grouped] = (await database`
    select id from delivery_charges where stop_occurrence_id = ${otherOccurrenceId} and grouped_documents
  `) as [{ id: string }]
  await expectQueryToFail(
    database`
      insert into delivery_charge_documents (company_id, charge_id, trip_document_id)
      values (${companyId}, ${grouped.id}, ${crypto.randomUUID()})
    `,
    FOREIGN_KEY_VIOLATION,
  )

  // Valor pago, quem pagou e o PIX do motorista.
  await database`
    update trip_stop_occurrences set declared_amount = '0', paid_by = 'company' where id = ${occurrenceId}
  `
  await expectQueryToFail(
    database`update trip_stop_occurrences set declared_amount = '-1' where id = ${occurrenceId}`,
    CHECK_VIOLATION,
    'trip_stop_occurrences_declared_amount_check',
  )
  await expectQueryToFail(
    database`update trip_stop_occurrences set paid_by = 'driver' where id = ${occurrenceId}`,
    CHECK_VIOLATION,
    'trip_stop_occurrences_driver_pix_check',
  )
  await expectQueryToFail(
    database`update trip_stop_occurrences set paid_by = 'bank' where id = ${occurrenceId}`,
    CHECK_VIOLATION,
    'trip_stop_occurrences_paid_by_check',
  )
  await expectQueryToFail(
    database`
      update trip_stop_occurrences set paid_by = 'driver', driver_pix_key = 'a@b.co', driver_pix_key_type = 'sms'
      where id = ${occurrenceId}
    `,
    CHECK_VIOLATION,
    'trip_stop_occurrences_driver_pix_check',
  )
  await database`
    update trip_stop_occurrences
    set paid_by = 'driver', driver_pix_key = 'motorista@example.com', driver_pix_key_type = 'email'
    where id = ${occurrenceId}
  `

  // Vagas de foto e fotos por vaga: uma por chave.
  const slotTypeId = await insertStopType(database, companyId, 'Tipo de prova 317', 'other')
  await database`
    insert into company_occurrence_type_photo_slots (company_id, occurrence_type_id, slot_key, label)
    values (${companyId}, ${slotTypeId}, 'charge_sign', 'Foto da placa')
  `
  await expectQueryToFail(
    database`
      insert into company_occurrence_type_photo_slots (company_id, occurrence_type_id, slot_key, label)
      values (${companyId}, ${slotTypeId}, 'charge_sign', 'Outra')
    `,
    UNIQUE_VIOLATION,
  )
  await expectQueryToFail(
    database`
      insert into company_occurrence_type_photo_slots (company_id, occurrence_type_id, slot_key, label)
      values (${companyId}, ${slotTypeId}, 'Charge Sign', 'Chave inválida')
    `,
    CHECK_VIOLATION,
    'company_occurrence_type_photo_slots_key_check',
  )

  // A marca do cliente só existe com a data.
  await expectQueryToFail(
    database`
      update delivery_clients set receiving_charge_source_stop_occurrence_id = ${occurrenceId}
      where id = ${clientId}
    `,
    CHECK_VIOLATION,
    'delivery_clients_receiving_charge_mark_check',
  )
  await database`
    update delivery_clients
    set receiving_charge_flagged_at = now(), receiving_charge_source_stop_occurrence_id = ${occurrenceId}
    where id = ${clientId}
  `

  // Com dado gravado, o rollback recusa e nada muda.
  await expectQueryToFail(database.unsafe(rollback), 'P0001')
  await database.unsafe('ROLLBACK') // o rollback.sql abre a própria transação: a recusa a deixa abortada
  expect(await readMigrationNames(database)).toContain(directory)
  expect(await columnExists(database, 'delivery_charges', 'stop_occurrence_id')).toBe(true)

  // Limpa o dado: o rollback desfaz, e a migration reaplica sobre tipos já existentes (semeadura).
  await database`update delivery_clients set receiving_charge_flagged_at = null, receiving_charge_source_stop_occurrence_id = null where id = ${clientId}`
  await database`delete from delivery_charges where company_id = ${companyId} and delivery_client_id = ${clientId}`
  await database`update trip_stop_occurrences set declared_amount = null, paid_by = null, driver_pix_key = null, driver_pix_key_type = null where id in (${occurrenceId}, ${otherOccurrenceId})`
  await database`delete from company_occurrence_type_photo_slots where occurrence_type_id = ${slotTypeId}`
  await database`delete from company_occurrence_types where id = ${slotTypeId}`

  const defaultTypeId = await insertStopType(database, companyId, DEFAULT_NAME, 'unexpected_charge')
  const editedTypeId = await insertStopType(
    database,
    companyId,
    'Taxa na portaria',
    'unexpected_charge',
  )
  const otherTypeId = await insertStopType(database, companyId, 'Espera 317', 'long_wait')

  await database.unsafe(rollback)
  expect(await readMigrationNames(database)).not.toContain(directory)
  expect(await columnExists(database, 'delivery_charges', 'stop_occurrence_id')).toBe(false)
  expect(await columnExists(database, 'trip_stop_occurrences', 'declared_amount')).toBe(false)
  expect(
    await columnExists(database, 'company_occurrence_types', 'show_client_charge_seal_to_driver'),
  ).toBe(false)
  const gone = (await database`
    select count(*)::int as total from information_schema.tables
    where table_schema = 'public' and table_name in ('delivery_charge_documents', 'company_occurrence_type_photo_slots', 'trip_stop_occurrence_photos')
  `) as [{ total: number }]
  expect(gone[0].total).toBe(0)

  await runDatabaseMigrations({ connectionString })
  expect(await readMigrationNames(database)).toContain(directory)

  const types = (await database`
    select id, name, declared_amount_mode, declared_amount_scope, emails_contractor, show_client_charge_seal_to_driver
    from company_occurrence_types where id in (${defaultTypeId}, ${editedTypeId}, ${otherTypeId})
  `) as {
    declared_amount_mode: string
    declared_amount_scope: string
    emails_contractor: boolean
    id: string
    name: string
    show_client_charge_seal_to_driver: boolean
  }[]
  const byId = new Map(types.map((row) => [row.id, row]))
  expect(byId.get(defaultTypeId)?.name).toBe(NEW_NAME)
  expect(byId.get(editedTypeId)?.name).toBe('Taxa na portaria')
  for (const id of [defaultTypeId, editedTypeId]) {
    expect(byId.get(id)).toMatchObject({
      declared_amount_mode: 'required',
      declared_amount_scope: 'occurrence',
      emails_contractor: false,
      show_client_charge_seal_to_driver: true,
    })
  }
  expect(byId.get(otherTypeId)).toMatchObject({ emails_contractor: true, name: 'Espera 317' })

  const slots = (await database`
    select occurrence_type_id, slot_key, label, required, position
    from company_occurrence_type_photo_slots
    where occurrence_type_id in (${defaultTypeId}, ${editedTypeId}, ${otherTypeId})
    order by occurrence_type_id, position
  `) as {
    label: string
    occurrence_type_id: string
    position: number
    required: boolean
    slot_key: string
  }[]
  expect(slots.filter((row) => row.occurrence_type_id === otherTypeId)).toHaveLength(0)
  for (const id of [defaultTypeId, editedTypeId]) {
    expect(
      slots
        .filter((row) => row.occurrence_type_id === id)
        .map((row) => [row.slot_key, row.label, row.required, row.position]),
    ).toEqual([
      ['charge_sign', 'Foto da placa de cobrança', true, 0],
      ['payment_receipt', 'Foto do comprovante de pagamento', true, 1],
    ])
  }

  await database`delete from company_occurrence_types where id in (${defaultTypeId}, ${editedTypeId}, ${otherTypeId})`
  await database`delete from trip_stop_occurrences where id in (${occurrenceId}, ${otherOccurrenceId})`
  await database`delete from delivery_clients where id = ${clientId}`
  await database`delete from trip_stops where id = ${stopId}`
}
