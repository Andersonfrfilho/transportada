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
  buildLocatedEventRedactionStatement,
  createDrizzleCountEligibleCompanies,
  createDrizzleRedactDeliveryProofLocations,
  createDrizzleRedactDocumentOccurrenceLocations,
  createDrizzleRedactStatusEventLocations,
  createDrizzleRedactStopOccurrenceLocations,
  createDrizzleRedactTripLocations,
} from '../src/trip-location-purge/infrastructure/drizzle-trip-location.repository.js'
import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'
import {
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../src/database/trip-execution.schema.js'

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

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Sessão em UTC: nenhum literal de data da fixture depende do fuso da máquina ou do banco que roda. */
function createUtcProvider() {
  return createDrizzleProvider({
    connection: { connection: { TimeZone: 'UTC' }, url: databaseUrl ?? 'postgres://unused' },
  })
}

const DAY_IN_MILLISECONDS = 86_400_000

/** Spec 239 D2: a empresa liga o expurgo na tela; o worker só lê a linha de configuração dela. */
async function insertRetentionSettings(
  db: Database,
  input: {
    readonly companyId: string
    readonly effectiveAt: Date | null
    readonly purgeEnabled: boolean
    readonly retentionDays: number
    readonly userId: string
  },
): Promise<void> {
  await db.execute(sql`
    insert into company_location_retention_settings
      (company_id, purge_enabled, retention_days, purge_effective_at, updated_by_user_id)
    values (
      ${input.companyId}, ${input.purgeEnabled}, ${input.retentionDays},
      ${input.effectiveAt?.toISOString() ?? null}, ${input.userId}
    )
  `)
}

/** A configuração tem FK restrict para a empresa: sai antes dela. */
async function deleteRetentionSettings(db: Database, companyId: string): Promise<void> {
  await db.execute(
    sql`delete from company_location_retention_settings where company_id = ${companyId}`,
  )
}

function buildPurgeRoutine(db: Database, logger: unknown = SILENT_LOGGER) {
  return createTripLocationPurgeRoutine({
    countEligibleCompanies: createDrizzleCountEligibleCompanies(db),
    logger: logger as never,
    now: () => NOW,
    purgeStalePings: async () => 0,
    redact: createDrizzleRedactTripLocations(db),
    redactDocumentOccurrenceLocations: createDrizzleRedactDocumentOccurrenceLocations(db),
    redactProofLocations: createDrizzleRedactDeliveryProofLocations(db),
    redactStatusEventLocations: createDrizzleRedactStatusEventLocations(db),
    redactStopOccurrenceLocations: createDrizzleRedactStopOccurrenceLocations(db),
  })
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

  const provider = createUtcProvider()
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
    await insertRetentionSettings(db, {
      companyId,
      effectiveAt: new Date(NOW.getTime() - 3_600_000),
      purgeEnabled: true,
      retentionDays: 90,
      userId,
    })
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
    await deleteRetentionSettings(db, companyId)
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
    const routine = buildPurgeRoutine(db)

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
    const routine = buildPurgeRoutine(db)

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

  const provider = createUtcProvider()
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
    await insertRetentionSettings(db, {
      companyId,
      effectiveAt: new Date(NOW.getTime() - 3_600_000),
      purgeEnabled: true,
      retentionDays: 90,
      userId,
    })
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
    await deleteRetentionSettings(db, companyId)
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
    const routine = buildPurgeRoutine(db, {
      ...SILENT_LOGGER,
      info: (_message: string, metadata?: Record<string, unknown>) => {
        infoLogs.push(metadata ?? {})
      },
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

type CompanyFixture = {
  readonly companyId: string
  readonly occurrenceTypeId: string
  readonly stopId: string
  readonly tripDocumentId: string
  readonly tripId: string
  readonly userId: string
  readonly membershipId: string
  readonly vehicleId: string
}

type LabeledRowIds = Record<(typeof POSITIONED_TABLES)[number], string>

/** Tudo que as cinco tabelas de evento exigem por FK, por empresa — o isolamento é o que se testa. */
async function createCompanyFixture(db: Database, index: number): Promise<CompanyFixture> {
  const fixture: CompanyFixture = {
    companyId: crypto.randomUUID(),
    membershipId: crypto.randomUUID(),
    occurrenceTypeId: crypto.randomUUID(),
    stopId: crypto.randomUUID(),
    tripDocumentId: crypto.randomUUID(),
    tripId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    vehicleId: crypto.randomUUID(),
  }
  const nfeImportId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const { companyId, userId } = fixture

  await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
  await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
  await db.execute(sql`
    insert into user_company_memberships (id, user_id, company_id, status)
    values (${fixture.membershipId}, ${userId}, ${companyId}, 'active')
  `)
  await db.execute(sql`
    insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
    values (${fixture.vehicleId}, ${companyId}, ${`GCQ8F${index}0`}, 'traction', 'tractor_unit', 'SP')
  `)
  await db.execute(sql`
    insert into trips (id, company_id, vehicle_id, status)
    values (${fixture.tripId}, ${companyId}, ${fixture.vehicleId}, 'completed')
  `)
  await db.execute(sql`
    insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
    values (${fixture.stopId}, ${companyId}, ${fixture.tripId}, 1, '3550308|01001000|100', 'Centro, 100')
  `)
  await insertStoredObject(db, companyId, xmlObjectId, 'nfe_document', 'application/xml')
  await db.execute(sql`
    insert into nfe_imports
      (id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
       request_fingerprint, status)
    values (${nfeImportId}, ${companyId}, 'upload', ${userId}, 'by-company', 'by-company',
            'by-company', 'completed')
  `)
  await db.execute(sql`
    insert into nfe_documents
      (id, company_id, access_key, model, number, series, issued_at, operation_nature,
       operation_type, status, source, total_value, products_value, xml_object_id, xml_sha256,
       import_id, created_by_user_id, authorization_protocol)
    values (
      ${nfeDocumentId}, ${companyId}, ${String(index).repeat(44)}, '55', '1', '1',
      ${NOW.toISOString()}, 'venda', '1', 'authorized', 'upload', '10.00', '10.00',
      ${xmlObjectId}, ${'0'.repeat(64)}, ${nfeImportId}, ${userId}, 'by-company'
    )
  `)
  await db.execute(sql`
    insert into trip_documents (id, company_id, trip_id, nfe_document_id)
    values (${fixture.tripDocumentId}, ${companyId}, ${fixture.tripId}, ${nfeDocumentId})
  `)
  await db.execute(sql`
    insert into company_occurrence_types (id, company_id, name, stage, notifies, active)
    values (${fixture.occurrenceTypeId}, ${companyId}, 'Caixa violada', 'separation', false, true)
  `)

  return fixture
}

async function insertStoredObject(
  db: Database,
  companyId: string,
  objectId: string,
  purpose: string,
  mimeType: string,
): Promise<void> {
  await db.execute(sql`
    insert into stored_objects
      (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes, status)
    values (
      ${objectId}, ${companyId}, 'integration', ${`by-company/${objectId}`}, 's3', ${purpose},
      ${mimeType}, ${objectId.replaceAll('-', '').padEnd(64, '0')}, 100, 'final'
    )
  `)
}

/** Uma linha por tabela no instante `at`; `located: false` é o evento sem ponto (`unavailable`). */
async function insertRowsAt(
  db: Database,
  fixture: CompanyFixture,
  input: { readonly at: Date; readonly located: boolean },
): Promise<LabeledRowIds> {
  const { companyId, userId } = fixture
  const at = input.at.toISOString()
  const ids: LabeledRowIds = {
    trip_delivery_proofs: crypto.randomUUID(),
    trip_document_occurrences: crypto.randomUUID(),
    trip_status_events: crypto.randomUUID(),
    trip_stop_events: crypto.randomUUID(),
    trip_stop_occurrences: crypto.randomUUID(),
  }
  const latitude = input.located ? '-23.5505199' : null
  const longitude = input.located ? '-46.6333094' : null
  const accuracy = input.located ? '9.00' : null
  const capturedAt = input.located ? at : null
  const state = input.located ? 'captured' : 'unavailable'

  await db.execute(sql`
    insert into trip_stop_events
      (id, company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at,
       actor_user_id, location_state, created_at)
    values (${ids.trip_stop_events}, ${companyId}, ${fixture.stopId}, 'delivered', ${latitude},
            ${longitude}, ${accuracy}, ${capturedAt}, ${userId}, ${state}, ${at})
  `)
  const proofObjectId = crypto.randomUUID()
  await insertStoredObject(db, companyId, proofObjectId, 'delivery_proof', 'image/jpeg')
  await db.execute(sql`
    insert into trip_delivery_proofs
      (id, company_id, stop_event_id, kind, object_id, actor_user_id, latitude, longitude,
       accuracy_meters, captured_at, punctuality, location_state, created_at)
    values (${ids.trip_delivery_proofs}, ${companyId}, ${ids.trip_stop_events}, 'photo',
            ${proofObjectId}, ${userId}, ${latitude}, ${longitude}, ${accuracy}, ${at}, 'on_time',
            ${state}, ${at})
  `)
  await db.execute(sql`
    insert into trip_status_events
      (id, company_id, trip_id, from_status, to_status, actor_user_id, occurred_at, recorded_at,
       latitude, longitude, accuracy_meters, captured_at, location_state)
    values (${ids.trip_status_events}, ${companyId}, ${fixture.tripId}, 'draft', 'route_planned',
            ${userId}, ${at}, ${at}, ${latitude}, ${longitude}, ${accuracy}, ${capturedAt}, ${state})
  `)
  await db.execute(sql`
    insert into trip_stop_occurrences
      (id, company_id, stop_id, kind, actor_user_id, occurrence_type_id, created_at, latitude,
       longitude, accuracy_meters, captured_at, location_state)
    values (${ids.trip_stop_occurrences}, ${companyId}, ${fixture.stopId}, 'unexpected_charge',
            ${userId}, ${fixture.occurrenceTypeId}, ${at}, ${latitude}, ${longitude}, ${accuracy},
            ${capturedAt}, ${state})
  `)
  await db.execute(sql`
    insert into trip_document_occurrences
      (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id, created_at,
       latitude, longitude, accuracy_meters, captured_at, location_state)
    values (${ids.trip_document_occurrences}, ${companyId}, ${fixture.tripDocumentId}, 'separation',
            ${fixture.occurrenceTypeId}, ${userId}, ${at}, ${latitude}, ${longitude}, ${accuracy},
            ${capturedAt}, ${state})
  `)

  return ids
}

async function deleteCompanyFixture(db: Database, fixture: CompanyFixture): Promise<void> {
  const { companyId } = fixture
  await deleteRetentionSettings(db, companyId)
  for (const table of [
    'trip_document_occurrences',
    'trip_stop_occurrences',
    'trip_status_events',
    'trip_delivery_proofs',
    'trip_stop_events',
    'trip_documents',
    'nfe_documents',
    'nfe_imports',
    'company_occurrence_types',
    'stored_objects',
    'trip_stops',
    'trips',
    'fleet_vehicles',
  ]) {
    await db.execute(sql`delete from ${sql.identifier(table)} where company_id = ${companyId}`)
  }
  await db.execute(sql`delete from user_company_memberships where id = ${fixture.membershipId}`)
  await db.execute(sql`delete from identity_users where id = ${fixture.userId}`)
  await db.execute(sql`delete from companies where id = ${companyId}`)
}

function daysBefore(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_IN_MILLISECONDS)
}

type Expectation = 'expired' | 'intact' | 'unavailable'

/**
 * Spec 239 CA6: o prazo é de cada empresa, e a junção é o isolamento. Seis empresas na mesma instalação,
 * relógio injetado, as cinco tabelas:
 *  - A ligada, 30 dias, vigente há 1 h: 31 d cai, 29 d / exatamente 30 d / sem ponto ficam (limite estrito);
 *  - B desligada (com data de vigência passada): 100 d intacto;
 *  - C ligada em carência (vigente daqui a 1 h): 100 d intacto;
 *  - D sem linha de configuração: 100 d intacto;
 *  - E ligada, 90 dias, vigente: 91 d cai, 60 d fica — o prazo dela não é o de A;
 *  - F ligada, 30 dias, vigente exatamente em NOW: o limite da carência é elegível.
 */
describeDatabase('expurgo por empresa, nas cinco tabelas (spec 239 CA6)', () => {
  const provider = createUtcProvider()
  const db = provider.db
  const fixtures: CompanyFixture[] = []
  const rows: Record<
    string,
    Array<{
      readonly ids: LabeledRowIds
      readonly expectation: Expectation
      readonly label: string
    }>
  > = {}

  async function seed(
    name: string,
    index: number,
    settings:
      | {
          readonly effectiveAt: Date
          readonly purgeEnabled: boolean
          readonly retentionDays: number
        }
      | undefined,
    events: ReadonlyArray<{
      readonly days: number
      readonly expectation: Expectation
      readonly located?: boolean
    }>,
  ): Promise<void> {
    const fixture = await createCompanyFixture(db, index)
    fixtures.push(fixture)
    if (settings !== undefined) {
      await insertRetentionSettings(db, {
        ...settings,
        companyId: fixture.companyId,
        userId: fixture.userId,
      })
    }
    rows[name] = []
    for (const event of events) {
      rows[name].push({
        expectation: event.expectation,
        ids: await insertRowsAt(db, fixture, {
          at: daysBefore(event.days),
          located: event.located ?? true,
        }),
        label: `${name}:${event.days}d${event.located === false ? ':sem-ponto' : ''}`,
      })
    }
  }

  async function readState(table: string, id: string): Promise<Record<string, unknown>> {
    const result = await db.execute(
      sql`select "latitude", "longitude", "accuracy_meters", "captured_at", "location_state"
          from ${sql.identifier(table)} where "id" = ${id}`,
    )
    return result[0] ?? {}
  }

  beforeAll(async () => {
    const hour = 3_600_000
    await seed(
      'A',
      1,
      { effectiveAt: new Date(NOW.getTime() - hour), purgeEnabled: true, retentionDays: 30 },
      [
        { days: 31, expectation: 'expired' },
        { days: 29, expectation: 'intact' },
        { days: 30, expectation: 'intact' },
        { days: 100, expectation: 'unavailable', located: false },
      ],
    )
    await seed('B', 2, { effectiveAt: daysBefore(10), purgeEnabled: false, retentionDays: 30 }, [
      { days: 100, expectation: 'intact' },
    ])
    await seed(
      'C',
      3,
      { effectiveAt: new Date(NOW.getTime() + hour), purgeEnabled: true, retentionDays: 30 },
      [{ days: 100, expectation: 'intact' }],
    )
    await seed('D', 4, undefined, [{ days: 100, expectation: 'intact' }])
    await seed(
      'E',
      5,
      { effectiveAt: new Date(NOW.getTime() - hour), purgeEnabled: true, retentionDays: 90 },
      [
        { days: 60, expectation: 'intact' },
        { days: 91, expectation: 'expired' },
      ],
    )
    await seed('F', 6, { effectiveAt: NOW, purgeEnabled: true, retentionDays: 30 }, [
      { days: 100, expectation: 'expired' },
    ])
  })

  afterAll(async () => {
    for (const fixture of fixtures) await deleteCompanyFixture(db, fixture)
    await provider.close()
  })

  test('só as empresas elegíveis perdem o ponto, cada uma pelo próprio prazo, em todas as tabelas', async () => {
    const infoLogs: Record<string, unknown>[] = []
    const routine = buildPurgeRoutine(db, {
      ...SILENT_LOGGER,
      info: (_message: string, metadata?: Record<string, unknown>) => {
        infoLogs.push(metadata ?? {})
      },
    })

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    const cycle = infoLogs.find((metadata) => 'redactedByTable' in metadata)
    expect(cycle?.companies).toBe(3)
    // A (31 d), E (91 d) e F (100 d): uma linha por tabela cada
    expect(cycle?.redactedByTable).toEqual(
      Object.fromEntries(POSITIONED_TABLES.map((table) => [table, 3])),
    )
    expect(JSON.stringify(infoLogs)).not.toContain('retentionDays')

    let checkedRows = 0
    for (const companyRows of Object.values(rows)) {
      for (const row of companyRows) {
        for (const table of POSITIONED_TABLES) {
          const state = await readState(table, row.ids[table])
          checkedRows += 1
          const label = `${row.label} ${table}`
          if (row.expectation === 'expired') {
            expect({ label, state: state.location_state }).toEqual({ label, state: 'expired' })
            expect(state.latitude).toBeNull()
            expect(state.longitude).toBeNull()
            expect(state.accuracy_meters).toBeNull()
            // O comprovante guarda a hora declarada da foto; as outras quatro apagam a leitura do GPS
            if (table === 'trip_delivery_proofs') expect(state.captured_at).not.toBeNull()
            else expect(state.captured_at).toBeNull()
          } else if (row.expectation === 'intact') {
            expect({ label, state: state.location_state }).toEqual({ label, state: 'captured' })
            expect(state.latitude).not.toBeNull()
            expect(state.longitude).not.toBeNull()
            expect(state.accuracy_meters).not.toBeNull()
            expect(state.captured_at).not.toBeNull()
          } else {
            expect({ label, state: state.location_state }).toEqual({ label, state: 'unavailable' })
            expect(state.latitude).toBeNull()
          }
        }
      }
    }
    // 6 empresas x as linhas semeadas x 5 tabelas: o laço não pode passar vazio
    expect(checkedRows).toBe(
      Object.values(rows).reduce((total, companyRows) => total + companyRows.length, 0) *
        POSITIONED_TABLES.length,
    )
  })

  test('a segunda execução não encontra mais nada para apagar', async () => {
    const infoLogs: Record<string, unknown>[] = []
    const routine = buildPurgeRoutine(db, {
      ...SILENT_LOGGER,
      info: (_message: string, metadata?: Record<string, unknown>) => {
        infoLogs.push(metadata ?? {})
      },
    })

    await routine.run(CONTEXT)

    expect(infoLogs.find((metadata) => 'redactedByTable' in metadata)?.redactedByTable).toEqual(
      Object.fromEntries(POSITIONED_TABLES.map((table) => [table, 0])),
    )
  })
})

/**
 * Spec 239 D2 (revisão da Fase 2): o lote do `LATERAL` tem teto, e o teto não pode furar o isolamento nem
 * deixar linha para trás. `limit: 2` com A (3 vencidas) e B (2 vencidas) precisa de três lotes — 2, 2, 1 — e
 * o quarto acha zero; a empresa desligada (C) fica intacta do começo ao fim. A ordem entre A e B não é
 * garantida (D2: sem justiça), então o teste confere o total por lote e o estado final, não quem cai antes.
 */
describeDatabase('lote pequeno do expurgo por empresa (spec 239 D2)', () => {
  const provider = createUtcProvider()
  const db = provider.db
  const fixtures: CompanyFixture[] = []
  const rowIds: Record<string, string[]> = { A: [], B: [], C: [] }
  const BATCH_LIMIT = 2

  async function seed(name: string, index: number, purgeEnabled: boolean, rowCount: number) {
    const fixture = await createCompanyFixture(db, index)
    fixtures.push(fixture)
    await insertRetentionSettings(db, {
      companyId: fixture.companyId,
      effectiveAt: daysBefore(10),
      purgeEnabled,
      retentionDays: 30,
      userId: fixture.userId,
    })
    for (let position = 0; position < rowCount; position += 1) {
      const ids = await insertRowsAt(db, fixture, {
        at: daysBefore(100 + position),
        located: true,
      })
      rowIds[name]?.push(ids.trip_stop_events)
    }
  }

  async function countLocated(ids: readonly string[]): Promise<number> {
    const result = await db.execute(
      sql`select count(*)::int as located from trip_stop_events
          where latitude is not null and id in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`,
    )
    return Number(result[0]?.located ?? -1)
  }

  beforeAll(async () => {
    await seed('A', 8, true, 3)
    await seed('B', 9, true, 2)
    await seed('C', 0, false, 3)
  })

  afterAll(async () => {
    for (const fixture of fixtures) await deleteCompanyFixture(db, fixture)
    await provider.close()
  })

  test('a sessão do teste roda em UTC', async () => {
    const result = await db.execute(sql`show timezone`)
    expect(result[0]?.TimeZone ?? result[0]?.timezone).toBe('UTC')
  })

  test('com limit 2, A (3) e B (2) caem em três lotes e a empresa desligada fica intacta', async () => {
    const batchSizes: number[] = []
    for (let batch = 0; batch < 6; batch += 1) {
      const redacted = await createDrizzleRedactTripLocations(db)({ limit: BATCH_LIMIT, now: NOW })
      batchSizes.push(redacted)
      if (redacted === 0) break
    }

    expect(batchSizes).toEqual([2, 2, 1, 0])
    expect(await countLocated(rowIds.A ?? [])).toBe(0)
    expect(await countLocated(rowIds.B ?? [])).toBe(0)
    expect(await countLocated(rowIds.C ?? [])).toBe(3)
  })
})

const STATEMENT_TABLES = [
  {
    clearsCapturedAt: true,
    index: 'trip_stop_events_company_located_created_at_idx',
    table: tripStopEvents,
    timeColumn: tripStopEvents.createdAt,
  },
  {
    clearsCapturedAt: false,
    index: 'trip_delivery_proofs_company_located_created_at_idx',
    table: tripDeliveryProofs,
    timeColumn: tripDeliveryProofs.createdAt,
  },
  {
    clearsCapturedAt: true,
    index: 'trip_status_events_company_located_recorded_at_idx',
    table: tripStatusEvents,
    timeColumn: tripStatusEvents.recordedAt,
  },
  {
    clearsCapturedAt: true,
    index: 'trip_stop_occurrences_company_located_created_at_idx',
    table: tripStopOccurrences,
    timeColumn: tripStopOccurrences.createdAt,
  },
  {
    clearsCapturedAt: true,
    index: 'trip_document_occurrences_company_located_created_at_idx',
    table: tripDocumentOccurrences,
    timeColumn: tripDocumentOccurrences.createdAt,
  },
] as const

type PlanNode = {
  readonly 'Index Cond'?: string
  readonly 'Index Name'?: string
  readonly Plans?: readonly PlanNode[]
}

function collectIndexNodes(node: PlanNode): PlanNode[] {
  const own = node['Index Name'] === undefined ? [] : [node]
  return [...own, ...(node.Plans ?? []).flatMap(collectIndexNodes)]
}

/** Linhas por tabela no volume sintético: o bastante para o planejador preferir o índice composto. */
const EXPLAIN_VOLUME_ROWS = 5000

/**
 * Semeia `rowCount` linhas com ponto nas cinco tabelas, espalhadas por 200 dias, e roda `ANALYZE`.
 * Tudo em SQL de conjunto: o plano depende das estatísticas, e linha a linha não chega a este volume.
 */
async function seedExplainVolume(
  db: Database,
  fixture: CompanyFixture,
  rowCount: number,
): Promise<void> {
  const { companyId, userId } = fixture
  const anchor = NOW.toISOString()
  await db.execute(sql`
    insert into trip_stop_events
      (id, company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at,
       actor_user_id, location_state, created_at)
    select gen_random_uuid(), ${companyId}, ${fixture.stopId}, 'delivered', '-23.5505199',
           '-46.6333094', '9.00', moment, ${userId}, 'captured', moment
    from (
      select ${anchor}::timestamptz - make_interval(secs => g * 800) as moment
      from generate_series(1, ${rowCount}::int) as g
    ) as spread
  `)
  await db.execute(sql`
    insert into stored_objects
      (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes, status)
    select id, ${companyId}, 'integration', 'volume/' || id::text, 's3', 'delivery_proof',
           'image/jpeg', rpad(replace(id::text, '-', ''), 64, '0'), 100, 'final'
    from (select gen_random_uuid() as id from generate_series(1, ${rowCount}::int)) as objects
  `)
  await db.execute(sql`
    insert into trip_delivery_proofs
      (id, company_id, stop_event_id, kind, object_id, actor_user_id, latitude, longitude,
       accuracy_meters, captured_at, punctuality, location_state, created_at)
    select gen_random_uuid(), ${companyId}, event.id, 'photo', object.id, ${userId}, '-23.5505199',
           '-46.6333094', '9.00', event.created_at, 'on_time', 'captured', event.created_at
    from (
      select id, created_at, row_number() over () as position
      from trip_stop_events where company_id = ${companyId}
    ) as event
    join (
      select id, row_number() over () as position
      from stored_objects where company_id = ${companyId} and purpose = 'delivery_proof'
    ) as object using (position)
  `)
  await db.execute(sql`
    insert into trip_status_events
      (id, company_id, trip_id, from_status, to_status, actor_user_id, occurred_at, recorded_at,
       latitude, longitude, accuracy_meters, captured_at, location_state)
    select gen_random_uuid(), ${companyId}, ${fixture.tripId}, 'draft', 'route_planned', ${userId},
           created_at, created_at, '-23.5505199', '-46.6333094', '9.00', created_at, 'captured'
    from trip_stop_events where company_id = ${companyId}
  `)
  await db.execute(sql`
    insert into trip_stop_occurrences
      (id, company_id, stop_id, kind, actor_user_id, occurrence_type_id, created_at, latitude,
       longitude, accuracy_meters, captured_at, location_state)
    select gen_random_uuid(), ${companyId}, ${fixture.stopId}, 'unexpected_charge', ${userId},
           ${fixture.occurrenceTypeId}, created_at, '-23.5505199', '-46.6333094', '9.00',
           created_at, 'captured'
    from trip_stop_events where company_id = ${companyId}
  `)
  await db.execute(sql`
    insert into trip_document_occurrences
      (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id, created_at,
       latitude, longitude, accuracy_meters, captured_at, location_state)
    select gen_random_uuid(), ${companyId}, ${fixture.tripDocumentId}, 'separation',
           ${fixture.occurrenceTypeId}, ${userId}, created_at, '-23.5505199', '-46.6333094', '9.00',
           created_at, 'captured'
    from trip_stop_events where company_id = ${companyId}
  `)
  for (const table of POSITIONED_TABLES) {
    await db.execute(sql`analyze ${sql.identifier(table)}`)
  }
}

class ExplainRollback extends Error {
  constructor(readonly explained: Array<Record<string, unknown>>) {
    super('rollback do EXPLAIN')
  }
}

async function explainRedaction(
  db: Database,
  entry: (typeof STATEMENT_TABLES)[number],
  options: { readonly forceIndexes: boolean; readonly withoutTimeOnlyIndex: boolean },
): Promise<PlanNode> {
  const statement = buildLocatedEventRedactionStatement({
    clearsCapturedAt: entry.clearsCapturedAt,
    limit: 500,
    now: NOW,
    table: entry.table,
    timeColumn: entry.timeColumn,
  })
  const rollback = await db
    .transaction(async (transaction) => {
      // Curto de propósito: o DROP INDEX pede lock exclusivo, e o teste nunca espera outra sessão
      await transaction.execute(sql`set local lock_timeout = '2s'`)
      if (options.forceIndexes) await transaction.execute(sql`set local enable_seqscan = off`)
      if (options.withoutTimeOnlyIndex) {
        // Transacional: o índice só por tempo sai do caminho do planejador e volta com o rollback
        await transaction.execute(
          sql`drop index ${sql.identifier(entry.index.replace('_company_located_', '_located_'))}`,
        )
      }
      const explained = await transaction.execute(sql`explain (format json) ${statement}`)
      throw new ExplainRollback(explained as unknown as Array<Record<string, unknown>>)
    })
    .catch((error: unknown) => {
      // Só o sentinela é rollback esperado; lock_timeout, índice ausente etc. têm de falhar o teste
      if (error instanceof ExplainRollback) return error
      throw error
    })
  const plan = rollback

  return (plan.explained[0]?.['QUERY PLAN'] as Array<{ Plan: PlanNode }>)[0]?.Plan as PlanNode
}

/**
 * Spec 239 D2/Riscos: a junção só é barata se o planejador entrar no índice `(company_id, tempo)`.
 * "Sem Seq Scan" não basta — o índice antigo, só por tempo, também satisfaz isso —, então a asserção
 * confere o **nome** do índice por empresa e `company_id` na condição de índice. O `SET LOCAL` força o
 * caminho de índice, e o índice só por tempo é derrubado **dentro da transação** (volta com o rollback):
 * com uma empresa só ele empata com o composto, e o teste prova que o composto *serve* — o predicado
 * parcial e a ordem das colunas casam com o comando —, não que o planejador o prefira. ⚠️ Isto prova que o índice **serve**, não o custo em produção: o volume de
 * staging/produção é outro, e a medição dele está em `evidence.md`.
 */
describeDatabase('o índice composto serve à sonda do expurgo por empresa (spec 239 D2)', () => {
  const provider = createUtcProvider()
  const db = provider.db
  let fixture: CompanyFixture | undefined

  beforeAll(async () => {
    fixture = await createCompanyFixture(db, 7)
    await insertRetentionSettings(db, {
      companyId: fixture.companyId,
      effectiveAt: new Date(NOW.getTime() - 3_600_000),
      purgeEnabled: true,
      retentionDays: 30,
      userId: fixture.userId,
    })
    await seedExplainVolume(db, fixture, EXPLAIN_VOLUME_ROWS)
  })

  afterAll(async () => {
    if (fixture !== undefined) await deleteCompanyFixture(db, fixture)
    await provider.close()
  })

  for (const entry of STATEMENT_TABLES) {
    test(`${entry.index}: o índice composto serve à sonda (nome do índice e company_id na condição)`, async () => {
      const root = await explainRedaction(db, entry, {
        forceIndexes: true,
        withoutTimeOnlyIndex: true,
      })

      const lookups = collectIndexNodes(root).filter((node) => node['Index Name'] === entry.index)

      // O `UPDATE` externo também pode varrer o índice parcial; a sonda do LATERAL é a que traz a empresa
      expect(lookups.length).toBeGreaterThan(0)
      expect(lookups.some((node) => (node['Index Cond'] ?? '').includes('company_id'))).toBeTrue()
    })
  }
})
