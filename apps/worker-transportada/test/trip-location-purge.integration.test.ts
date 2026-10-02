/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O expurgo contra Postgres de verdade. `trip_stop_events` é tabela que o worker apenas **copia** —
 * coluna renomeada na API passa pelo typecheck deste lado e só falharia no ciclo, em produção,
 * calada. E a promessa que esta rotina cumpre é de LGPD: se ela não apagar, o `docs/SECURITY.md`
 * está mentindo, e mentir sobre retenção é pior do que não ter prazo nenhum.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createTripLocationPurgeRoutine } from '../src/trip-location-purge/application/trip-location-purge.routine.js'
import {
  createDrizzleRedactDeliveryProofLocations,
  createDrizzleRedactDocumentOccurrenceLocations,
  createDrizzleRedactStatusEventLocations,
  createDrizzleRedactStopOccurrenceLocations,
  createDrizzleRedactTripLocations,
} from '../src/trip-location-purge/infrastructure/drizzle-trip-location.repository.js'
import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

/** Relógio injetado: o corte é relativo a este instante, e nada aqui depende da data em que roda. */
const NOW = new Date('2026-08-26T09:00:00.000Z')

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

const CONTEXT: JobRoutineContext = {
  correlationId: 'purge-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.location.purge',
  origin: 'schedule',
}

describeDatabase('expurgo da coordenada de entrega (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const expiredEventId = crypto.randomUUID()
  const freshEventId = crypto.randomUUID()
  const withoutLocationEventId = crypto.randomUUID()
  const expiredProofId = crypto.randomUUID()
  const freshProofId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db

  async function insertEvent(input: {
    readonly createdAt: string
    readonly id: string
    readonly located: boolean
  }): Promise<void> {
    await db.execute(sql`
      insert into trip_stop_events
        (id, company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at,
         actor_user_id, location_state, created_at)
      values (
        ${input.id}, ${companyId}, ${stopId}, 'delivered',
        ${input.located ? '-23.5505199' : null}, ${input.located ? '-46.6333094' : null},
        ${input.located ? '12.50' : null}, ${input.located ? input.createdAt : null},
        ${userId}, ${input.located ? 'captured' : 'unavailable'}, ${input.createdAt}
      )
    `)
  }

  /** Spec 159 T11: a foto do comprovante presa ao evento, com a posição que o aparelho leu. */
  async function insertProof(input: {
    readonly createdAt: string
    readonly eventId: string
    readonly id: string
  }): Promise<void> {
    const objectId = crypto.randomUUID()
    await db.execute(sql`
      insert into stored_objects
        (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes,
         status)
      values (
        ${objectId}, ${companyId}, 'integration', ${`proof/${objectId}.jpg`}, 's3',
        'delivery_proof', 'image/jpeg', ${objectId.replaceAll('-', '').padEnd(64, '0')}, 100,
        'final'
      )
    `)
    await db.execute(sql`
      insert into trip_delivery_proofs
        (id, company_id, stop_event_id, kind, object_id, actor_user_id, latitude, longitude,
         accuracy_meters, captured_at, punctuality, location_state, created_at)
      values (
        ${input.id}, ${companyId}, ${input.eventId}, 'photo', ${objectId}, ${userId},
        '-23.5505199', '-46.6333094', '8.00', ${input.createdAt}, 'on_time', 'captured',
        ${input.createdAt}
      )
    `)
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyId}, 'GCQ8E47', 'traction', 'tractor_unit', 'SP')
    `)
    await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tripId}, ${companyId}, ${vehicleId}, 'completed')
    `)
    await db.execute(sql`
      insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
      values (${stopId}, ${companyId}, ${tripId}, 1, '3550308|01001000|100', 'Centro, 100')
    `)

    // Noventa e um dias: passou do prazo por um dia, que é exatamente onde o corte tem de morder
    await insertEvent({ createdAt: '2026-05-27T09:00:00.000Z', id: expiredEventId, located: true })
    // Um dia: dentro do prazo, e a prova de que a rotina não varre o que ainda é comprovante
    await insertEvent({ createdAt: '2026-08-25T09:00:00.000Z', id: freshEventId, located: true })
    // Entrega confirmada sem GPS — o caso que a §3.1 protege, e que o expurgo não pode tocar
    await insertEvent({
      createdAt: '2026-05-27T09:00:00.000Z',
      id: withoutLocationEventId,
      located: false,
    })
    await insertProof({
      createdAt: '2026-05-27T09:00:00.000Z',
      eventId: expiredEventId,
      id: expiredProofId,
    })
    await insertProof({
      createdAt: '2026-08-25T09:00:00.000Z',
      eventId: freshEventId,
      id: freshProofId,
    })
  })

  afterAll(async () => {
    await db.execute(sql`delete from trip_delivery_proofs where company_id = ${companyId}`)
    await db.execute(sql`delete from stored_objects where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_stop_events where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_stops where company_id = ${companyId}`)
    await db.execute(sql`delete from trips where company_id = ${companyId}`)
    await db.execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
    await db.execute(sql`delete from user_company_memberships where id = ${membershipId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  test('apaga a coordenada vencida e preserva o evento inteiro', async () => {
    const routine = createTripLocationPurgeRoutine({
      enabled: true,
      logger: SILENT_LOGGER as never,
      purgeStalePings: async () => 0,
      now: () => NOW,
      redact: createDrizzleRedactTripLocations(db),
      redactDocumentOccurrenceLocations: createDrizzleRedactDocumentOccurrenceLocations(db),
      redactProofLocations: createDrizzleRedactDeliveryProofLocations(db),
      redactStatusEventLocations: createDrizzleRedactStatusEventLocations(db),
      redactStopOccurrenceLocations: createDrizzleRedactStopOccurrenceLocations(db),
    })

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(result.counters.redacted).toBe(1)

    const rows = await db.execute(sql`
      select "id", "latitude", "longitude", "accuracy_meters", "captured_at", "kind",
             "location_state"
      from trip_stop_events where company_id = ${companyId} order by "created_at", "id"
    `)
    const byId = new Map(rows.map((row) => [String(row.id), row]))

    /**
     * O evento continua lá: a viagem continua auditável, e o que some é onde a pessoa estava. O
     * estado vira `expired` junto, e não é cosmético — a linha que diz `captured` sem coordenada
     * mente, e o CHECK da spec 196 recusa o `UPDATE` inteiro quando ele tenta escrevê-la.
     */
    expect(byId.size).toBe(3)
    expect(byId.get(expiredEventId)).toMatchObject({
      accuracy_meters: null,
      captured_at: null,
      kind: 'delivered',
      latitude: null,
      location_state: 'expired',
      longitude: null,
    })
    expect(byId.get(freshEventId)?.latitude).not.toBeNull()
    expect(byId.get(freshEventId)?.location_state).toBe('captured')
    expect(byId.get(withoutLocationEventId)?.latitude).toBeNull()
    // O expurgo não varre quem nunca teve posição: `unavailable` é um fato, não um vencimento
    expect(byId.get(withoutLocationEventId)?.location_state).toBe('unavailable')

    // Spec 159 T11: a foto vencida perde a posição e guarda o resto; a recente fica inteira
    expect(result.counters.redactedProofs).toBe(1)
    const proofs = await db.execute(sql`
      select "id", "latitude", "longitude", "accuracy_meters", "captured_at", "punctuality",
             "location_state"
      from trip_delivery_proofs where company_id = ${companyId}
    `)
    const proofById = new Map(proofs.map((row) => [String(row.id), row]))
    expect(proofById.get(expiredProofId)).toMatchObject({
      accuracy_meters: null,
      latitude: null,
      location_state: 'expired',
      longitude: null,
      punctuality: 'on_time',
    })
    expect(proofById.get(expiredProofId)?.captured_at).not.toBeNull()
    expect(proofById.get(freshProofId)?.latitude).not.toBeNull()
    expect(proofById.get(freshProofId)?.location_state).toBe('captured')
  })

  /** Correr de novo não tem o que apagar — e é assim que a batida diária se comporta todo dia. */
  test('o segundo ciclo não encontra mais nada para apagar', async () => {
    const routine = createTripLocationPurgeRoutine({
      enabled: true,
      logger: SILENT_LOGGER as never,
      purgeStalePings: async () => 0,
      now: () => NOW,
      redact: createDrizzleRedactTripLocations(db),
      redactDocumentOccurrenceLocations: createDrizzleRedactDocumentOccurrenceLocations(db),
      redactProofLocations: createDrizzleRedactDeliveryProofLocations(db),
      redactStatusEventLocations: createDrizzleRedactStatusEventLocations(db),
      redactStopOccurrenceLocations: createDrizzleRedactStopOccurrenceLocations(db),
    })

    /**
     * ⚠️ `purgedPings` entrou com o teto de idade da 082, e `toEqual` exige igualdade exata: a
     * chave nova reprovava aqui sem que nada no expurgo estivesse errado. Afirmar os três é o que
     * mantém o contrato honesto — contador novo tem de aparecer neste teste, não passar despercebido.
     */
    expect((await routine.run(CONTEXT)).counters).toEqual({
      batches: 0,
      purgedPings: 0,
      redacted: 0,
      redactedProofs: 0,
    })
  })
})

/** Spec 196 D8: noventa e um dias passam do prazo por um dia; oitenta e nove ainda estão dentro. */
const EXPIRED_AT = '2026-05-27T09:00:00.000Z'
const WITHIN_RETENTION_AT = '2026-05-29T09:00:00.000Z'

const POSITIONED_TABLES = [
  'trip_stop_events',
  'trip_delivery_proofs',
  'trip_status_events',
  'trip_stop_occurrences',
  'trip_document_occurrences',
] as const

describeDatabase('expurgo da posição nas cinco tabelas de evento (spec 196 T2.2)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const tripDocumentId = crypto.randomUUID()
  const occurrenceTypeId = crypto.randomUUID()
  const nfeImportId = crypto.randomUUID()
  const nfeXmlObjectId = crypto.randomUUID()
  const rowIds = {
    expired: Object.fromEntries(POSITIONED_TABLES.map((table) => [table, crypto.randomUUID()])),
    within: Object.fromEntries(POSITIONED_TABLES.map((table) => [table, crypto.randomUUID()])),
  } as const

  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db

  async function insertObject(objectId: string, purpose: string, mimeType: string): Promise<void> {
    await db.execute(sql`
      insert into stored_objects
        (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes,
         status)
      values (
        ${objectId}, ${companyId}, 'integration', ${`five-tables/${objectId}`}, 's3', ${purpose},
        ${mimeType}, ${objectId.replaceAll('-', '').padEnd(64, '0')}, 100, 'final'
      )
    `)
  }

  /** Uma linha por tabela, com o ponto completo e a hora de tempo da tabela no instante dado. */
  async function insertPositionedRows(at: string, ids: Record<string, string>): Promise<void> {
    const position = { accuracy: '9.00', latitude: '-23.5505199', longitude: '-46.6333094' }
    await db.execute(sql`
      insert into trip_stop_events
        (id, company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at,
         actor_user_id, location_state, created_at)
      values (
        ${ids.trip_stop_events}, ${companyId}, ${stopId}, 'delivered', ${position.latitude},
        ${position.longitude}, ${position.accuracy}, ${at}, ${userId}, 'captured', ${at}
      )
    `)
    const proofObjectId = crypto.randomUUID()
    await insertObject(proofObjectId, 'delivery_proof', 'image/jpeg')
    await db.execute(sql`
      insert into trip_delivery_proofs
        (id, company_id, stop_event_id, kind, object_id, actor_user_id, latitude, longitude,
         accuracy_meters, captured_at, punctuality, location_state, created_at)
      values (
        ${ids.trip_delivery_proofs}, ${companyId}, ${ids.trip_stop_events}, 'photo',
        ${proofObjectId}, ${userId}, ${position.latitude}, ${position.longitude},
        ${position.accuracy}, ${at}, 'on_time', 'captured', ${at}
      )
    `)
    await db.execute(sql`
      insert into trip_status_events
        (id, company_id, trip_id, from_status, to_status, actor_user_id, occurred_at, recorded_at,
         latitude, longitude, accuracy_meters, captured_at, location_state)
      values (
        ${ids.trip_status_events}, ${companyId}, ${tripId}, 'draft', 'route_planned', ${userId},
        ${at}, ${at}, ${position.latitude}, ${position.longitude}, ${position.accuracy}, ${at},
        'captured'
      )
    `)
    await db.execute(sql`
      insert into trip_stop_occurrences
        (id, company_id, stop_id, kind, actor_user_id, occurrence_type_id, created_at, latitude,
         longitude, accuracy_meters, captured_at, location_state)
      values (
        ${ids.trip_stop_occurrences}, ${companyId}, ${stopId}, 'unexpected_charge', ${userId},
        ${occurrenceTypeId}, ${at}, ${position.latitude}, ${position.longitude},
        ${position.accuracy}, ${at}, 'captured'
      )
    `)
    await db.execute(sql`
      insert into trip_document_occurrences
        (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id, created_at,
         latitude, longitude, accuracy_meters, captured_at, location_state)
      values (
        ${ids.trip_document_occurrences}, ${companyId}, ${tripDocumentId}, 'separation',
        ${occurrenceTypeId}, ${userId}, ${at}, ${position.latitude}, ${position.longitude},
        ${position.accuracy}, ${at}, 'captured'
      )
    `)
  }

  async function readRow(table: string, id: string): Promise<Record<string, unknown> | undefined> {
    const rows = await db.execute(
      sql`select "latitude", "longitude", "accuracy_meters", "captured_at", "location_state"
          from ${sql.identifier(table)} where "id" = ${id}`,
    )
    return rows[0]
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyId}, 'GCQ8E49', 'traction', 'tractor_unit', 'SP')
    `)
    await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tripId}, ${companyId}, ${vehicleId}, 'completed')
    `)
    await db.execute(sql`
      insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
      values (${stopId}, ${companyId}, ${tripId}, 1, '3550308|01001000|100', 'Centro, 100')
    `)
    await insertObject(nfeXmlObjectId, 'nfe_document', 'application/xml')
    await db.execute(sql`
      insert into nfe_imports
        (id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
         request_fingerprint, status)
      values (
        ${nfeImportId}, ${companyId}, 'upload', ${userId}, 'five-tables', 'five-tables',
        'five-tables', 'completed'
      )
    `)
    const nfeDocumentId = crypto.randomUUID()
    await db.execute(sql`
      insert into nfe_documents
        (id, company_id, access_key, model, number, series, issued_at, operation_nature,
         operation_type, status, source, total_value, products_value, xml_object_id, xml_sha256,
         import_id, created_by_user_id, authorization_protocol)
      values (
        ${nfeDocumentId}, ${companyId}, ${'1'.repeat(44)}, '55', '1', '1', ${NOW.toISOString()},
        'venda', '1', 'authorized', 'upload', '10.00', '10.00', ${nfeXmlObjectId},
        ${'0'.repeat(64)}, ${nfeImportId}, ${userId}, 'five-tables'
      )
    `)
    await db.execute(sql`
      insert into trip_documents (id, company_id, trip_id, nfe_document_id)
      values (${tripDocumentId}, ${companyId}, ${tripId}, ${nfeDocumentId})
    `)
    await db.execute(sql`
      insert into company_occurrence_types (id, company_id, name, stage, notifies, active)
      values (${occurrenceTypeId}, ${companyId}, 'Caixa violada', 'separation', false, true)
    `)

    await insertPositionedRows(EXPIRED_AT, rowIds.expired)
    await insertPositionedRows(WITHIN_RETENTION_AT, rowIds.within)
  })

  afterAll(async () => {
    await db.execute(sql`delete from trip_document_occurrences where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_stop_occurrences where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_status_events where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_delivery_proofs where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_stop_events where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_documents where company_id = ${companyId}`)
    await db.execute(sql`delete from nfe_documents where company_id = ${companyId}`)
    await db.execute(sql`delete from nfe_imports where company_id = ${companyId}`)
    await db.execute(sql`delete from company_occurrence_types where company_id = ${companyId}`)
    await db.execute(sql`delete from stored_objects where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_stops where company_id = ${companyId}`)
    await db.execute(sql`delete from trips where company_id = ${companyId}`)
    await db.execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
    await db.execute(sql`delete from user_company_memberships where id = ${membershipId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  test('91 dias perdem as quatro colunas e ficam expired; 89 ficam intactos; a linha nunca some', async () => {
    const infoLogs: Record<string, unknown>[] = []
    const routine = createTripLocationPurgeRoutine({
      enabled: true,
      logger: {
        ...SILENT_LOGGER,
        info: (_message: string, metadata?: Record<string, unknown>) => {
          infoLogs.push(metadata ?? {})
        },
      } as never,
      now: () => NOW,
      purgeStalePings: async () => 0,
      redact: createDrizzleRedactTripLocations(db),
      redactDocumentOccurrenceLocations: createDrizzleRedactDocumentOccurrenceLocations(db),
      redactProofLocations: createDrizzleRedactDeliveryProofLocations(db),
      redactStatusEventLocations: createDrizzleRedactStatusEventLocations(db),
      redactStopOccurrenceLocations: createDrizzleRedactStopOccurrenceLocations(db),
    })

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    const redactedByTable = infoLogs.find((metadata) => 'redactedByTable' in metadata)
      ?.redactedByTable as Record<string, number> | undefined
    expect(redactedByTable).toEqual(
      Object.fromEntries(POSITIONED_TABLES.map((table) => [table, 1])),
    )

    for (const table of POSITIONED_TABLES) {
      expect(await readRow(table, rowIds.expired[table] ?? '')).toMatchObject({
        accuracy_meters: null,
        latitude: null,
        location_state: 'expired',
        longitude: null,
      })
      // O comprovante guarda o horário declarado da foto; as outras quatro tabelas apagam o `captured_at`
      const expiredCapturedAt = (await readRow(table, rowIds.expired[table] ?? ''))?.captured_at
      if (table === 'trip_delivery_proofs') expect(expiredCapturedAt).not.toBeNull()
      else expect(expiredCapturedAt).toBeNull()

      const within = await readRow(table, rowIds.within[table] ?? '')
      expect(within).toBeDefined()
      expect(within?.latitude).not.toBeNull()
      expect(within?.longitude).not.toBeNull()
      expect(within?.accuracy_meters).not.toBeNull()
      expect(within?.captured_at).not.toBeNull()
      expect(within?.location_state).toBe('captured')
    }
  })
})
