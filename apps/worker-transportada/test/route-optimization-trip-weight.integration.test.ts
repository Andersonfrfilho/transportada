/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 067 no roteirizador — **o peso da parada da viagem vem da nota**, contra Postgres.
 *
 * O caminho de `readStops` não tinha cobertura de integração nenhuma: o pool tem a dele, e a
 * sugestão de uma viagem só era provada por typecheck. É aqui que a junção `trip_documents` →
 * `nfe_volumes` → parada se prova — errá-la compila, e o efeito seria silencioso: toda parada
 * voltaria à média da empresa, que é exatamente o defeito que esta spec fecha.
 *
 * Real: o repositório, o efeito, o solver e o banco. **Stub: só a matriz** (ADR-0044 §1).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { handleRouteOptimization } from '../src/routing/application/route-optimization-handler.service.js'
import type { RoutingMatrixPort } from '../src/routing/application/routing-matrix.port.js'
import { createDrizzleRouteOptimizationRepository } from '../src/routing/infrastructure/drizzle-route-optimization.repository.js'
import { createRouteOptimizationPorts } from '../src/routing/infrastructure/route-optimization-ports.factory.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
const db = provider.db

const CONSTANT_DISTANCE_METRES = 5_000
const CONSTANT_DURATION_SECONDS = 400

const DEPOT = { addressKey: 'depot-trip', latitude: '-21.1767000', longitude: '-47.8208000' }
/** A primeira parada recebe as duas notas medidas; a segunda, a nota que veio sem massa. */
const MEASURED = {
  addressKey: '3543402|14020000|100',
  latitude: '-21.1800000',
  longitude: '-47.8100000',
}
const UNMEASURED = {
  addressKey: '3543402|14025000|200',
  latitude: '-21.2100000',
  longitude: '-47.7900000',
}

describeDatabase('o peso da parada da viagem (spec 067 no roteirizador)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const suggestionId = crypto.randomUUID()
  const measuredStopId = crypto.randomUUID()
  const unmeasuredStopId = crypto.randomUUID()
  /** Duas notas na mesma parada, as duas com `pesoB`: é a soma que o solver passa a enxergar. */
  const measuredDocumentIds = [crypto.randomUUID(), crypto.randomUUID()]
  const unmeasuredDocumentId = crypto.randomUUID()

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state, capacity_kg)
      values (${vehicleId}, ${companyId}, 'GCQ9T11', 'traction', 'truck', 'SP', 8000)
    `)
    await db.execute(sql`
      insert into nfe_imports
        (id, company_id, correlation_id, idempotency_key, request_fingerprint,
         requested_by_user_id, source, status)
      values (${importId}, ${companyId}, 'trip-weight-e2e', 'trip-weight-e2e', 'trip-weight-e2e',
        ${userId}, 'upload', 'completed')
    `)
    /**
     * ⚠️ `fallback_weight_kilograms` alto de propósito: com ele igual ao peso real, o teste passaria
     * mesmo se a junção não achasse nota nenhuma.
     */
    await db.execute(sql`
      insert into company_route_optimization_settings
        (company_id, origin_address_key, timezone, fallback_weight_kilograms)
      values (${companyId}, ${DEPOT.addressKey}, 'America/Sao_Paulo', '900.00')
    `)
    for (const point of [DEPOT, MEASURED, UNMEASURED]) {
      await db.execute(sql`
        insert into geocoded_addresses (address_key, latitude, longitude, precision, source, external_place_id)
        values (${point.addressKey}, ${point.latitude}, ${point.longitude}, 'rooftop', 'google',
          ${`place-${point.addressKey}`})
        on conflict (address_key) do nothing
      `)
    }

    await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tripId}, ${companyId}, ${vehicleId}, 'draft')
    `)
    await db.execute(sql`
      insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
      values
        (${measuredStopId}, ${companyId}, ${tripId}, 1, ${MEASURED.addressKey}, 'Medida'),
        (${unmeasuredStopId}, ${companyId}, ${tripId}, 2, ${UNMEASURED.addressKey}, 'Sem massa')
    `)

    const seeded = [
      {
        documentId: measuredDocumentIds[0] as string,
        grossWeight: '37.6620',
        stopId: measuredStopId,
      },
      {
        documentId: measuredDocumentIds[1] as string,
        grossWeight: '107.8440',
        stopId: measuredStopId,
      },
      { documentId: unmeasuredDocumentId, grossWeight: null, stopId: unmeasuredStopId },
    ]

    for (const [index, entry] of seeded.entries()) {
      const objectId = crypto.randomUUID()
      await db.execute(sql`
        insert into stored_objects
          (id, company_id, bucket, object_key, mime_type, provider, purpose, sha256, size_bytes, status)
        values (${objectId}, ${companyId}, 'integration', ${`nfe/trip-${index}.xml`},
          'application/xml', 's3', 'nfe_document', ${String(index + 1).repeat(64)}, 100, 'final')
      `)
      await db.execute(sql`
        insert into nfe_documents
          (id, company_id, import_id, access_key, model, series, number, issued_at,
           operation_nature, operation_type, products_value, freight_value, total_value, status,
           source, authorization_protocol, xml_object_id, xml_sha256, created_by_user_id)
        values (${entry.documentId}, ${companyId}, ${importId},
          ${`${7 - index}${'2'.repeat(43)}`}, '55', '1', ${`91000${index}`},
          '2026-08-20T06:00:00.000Z', 'Venda', '1', '1000.0000', '0.0000', '1000.0000',
          'authorized', 'upload', ${`protocol-trip-${index}`}, ${objectId},
          ${String(index + 1).repeat(64)}, ${userId})
      `)
      if (entry.grossWeight !== null) {
        await db.execute(sql`
          insert into nfe_volumes (id, company_id, document_id, ordinal, quantity, gross_weight, net_weight)
          values (${crypto.randomUUID()}, ${companyId}, ${entry.documentId}, 1, '8',
            ${entry.grossWeight}, ${entry.grossWeight})
        `)
      }
      await db.execute(sql`
        insert into trip_documents (id, company_id, trip_id, nfe_document_id, stop_id)
        values (${crypto.randomUUID()}, ${companyId}, ${tripId}, ${entry.documentId}, ${entry.stopId})
      `)
    }

    await db.execute(sql`
      insert into route_suggestions (id, company_id, trip_id, status, seed, assumptions)
      values (${suggestionId}, ${companyId}, ${tripId}, 'queued', 1, '{}'::jsonb)
    `)
  })

  afterAll(async () => {
    await db.execute(
      sql`delete from route_suggestion_stop_documents where company_id = ${companyId}`,
    )
    await db.execute(sql`delete from route_suggestion_stops where company_id = ${companyId}`)
    await db.execute(sql`delete from route_suggestions where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_documents where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_stops where company_id = ${companyId}`)
    await db.execute(sql`delete from trips where company_id = ${companyId}`)
    await db.execute(sql`delete from nfe_volumes where company_id = ${companyId}`)
    await db.execute(sql`delete from nfe_documents where company_id = ${companyId}`)
    await db.execute(sql`delete from stored_objects where company_id = ${companyId}`)
    await db.execute(sql`delete from nfe_imports where company_id = ${companyId}`)
    await db.execute(
      sql`delete from company_route_optimization_settings where company_id = ${companyId}`,
    )
    await db.execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
    await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await db.execute(sql`
      delete from geocoded_addresses where address_key in
        (${DEPOT.addressKey}, ${MEASURED.addressKey}, ${UNMEASURED.addressKey})
    `)
    await provider.close?.()
  })

  test('a parada com pesoB sai medida, e a sem massa continua marcada', async () => {
    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: { companyId, correlationId: 'trip-weight-e2e', suggestionId },
      maxAttempts: 3,
      ports: createRouteOptimizationPorts({
        matrix: constantMatrix(),
        repository: createDrizzleRouteOptimizationRepository(db),
      }),
    })

    expect(disposition).toBe('ack')

    const [suggestion] = (await db.execute(sql`
      select "status", "error_code" from route_suggestions where "id" = ${suggestionId}
    `)) as unknown as { readonly error_code: string; readonly status: string }[]

    expect(suggestion?.status).toBe('ready')
    expect(suggestion?.error_code).toBe('')

    const stops = (await db.execute(sql`
      select "stop_id", "weight_estimated" from route_suggestion_stops
      where "suggestion_id" = ${suggestionId}
    `)) as unknown as { readonly stop_id: null | string; readonly weight_estimated: boolean }[]

    expect(stops).toHaveLength(2)
    /**
     * O que este teste existe para provar: a parada cujas notas declararam `pesoB` **deixou de ser
     * estimativa**. Antes da spec 067 no roteirizador as duas saíam marcadas, com a mesma média.
     */
    expect(stops.find((stop) => stop.stop_id === measuredStopId)?.weight_estimated).toBe(false)
    /** E a nota que o emitente mandou sem massa continua no peso de parada, marcada. */
    expect(stops.find((stop) => stop.stop_id === unmeasuredStopId)?.weight_estimated).toBe(true)
  })
})

function constantMatrix(): RoutingMatrixPort {
  return {
    async table(coordinates) {
      const size = coordinates.length
      const row = (value: number, index: number): number[] =>
        Array.from({ length: size }, (_unused, column) => (column === index ? 0 : value))

      return {
        distancesMeters: Array.from({ length: size }, (_unused, index) =>
          row(CONSTANT_DISTANCE_METRES, index),
        ),
        durationsSeconds: Array.from({ length: size }, (_unused, index) =>
          row(CONSTANT_DURATION_SECONDS, index),
        ),
      }
    },
  }
}
