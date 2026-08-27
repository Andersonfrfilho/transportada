/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 058 P2 — **a geração da proposta multi-veículo, ponta a ponta**, contra Postgres. Até aqui a
 * P2 tinha o aceite provado (na API) e a leitura do pool só por typecheck: nada exercitava o caminho
 * que leva a sugestão de `queued` a `ready`, que é justamente onde o worker agrupa notas por
 * endereço, monta o problema e escreve o resultado.
 *
 * Real: o repositório, o efeito, o solver e o banco. **Stub: só a matriz** — o OSRM não sobe no CI, e
 * a distância vira uma tabela calculada por haversine **no teste**, nunca no código (ADR-0044 §1: a
 * matriz fora do ar não vira estimativa; aqui ela não está fora do ar, está sendo dublada).
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

const EARTH_RADIUS_METRES = 6_371_000
const AVERAGE_SPEED_METRES_PER_SECOND = 12

/** Ribeirão Preto: o depósito e três destinos, longe o bastante para a ordem importar. */
const DEPOT = { addressKey: 'depot', latitude: '-21.1767000', longitude: '-47.8208000' }
const POINTS = [
  { addressKey: '3543402|14020000|100', latitude: '-21.1800000', longitude: '-47.8100000' },
  { addressKey: '3543402|14025000|200', latitude: '-21.2100000', longitude: '-47.7900000' },
  { addressKey: '3543402|14030000|300', latitude: '-21.1500000', longitude: '-47.8600000' },
] as const

describeDatabase('a proposta multi-veículo contra Postgres (spec 058 P2)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const suggestionId = crypto.randomUUID()
  const firstVehicleId = crypto.randomUUID()
  const secondVehicleId = crypto.randomUUID()
  const documentIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
  /** A quarta nota fica no mesmo endereço da primeira: uma parada, duas notas. */
  const twinDocumentId = crypto.randomUUID()

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    /** A importação referencia a **membership**, não o usuário solto: sem ela a FK recusa. */
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state, capacity_kg)
      values
        (${firstVehicleId}, ${companyId}, 'GCQ8E47', 'traction', 'toco', 'SP', 4000),
        (${secondVehicleId}, ${companyId}, 'GCQ8E48', 'traction', 'truck', 'SP', 8000)
    `)
    await db.execute(sql`
      insert into nfe_imports
        (id, company_id, correlation_id, idempotency_key, request_fingerprint,
         requested_by_user_id, source, status)
      values (${importId}, ${companyId}, 'pool-e2e', 'pool-e2e', 'pool-e2e', ${userId},
        'upload', 'completed')
    `)

    /** O depósito da empresa e os três destinos precisam de coordenada: sem ela a parada sai da conta. */
    await db.execute(sql`
      insert into company_route_optimization_settings (company_id, origin_address_key)
      values (${companyId}, ${DEPOT.addressKey})
    `)
    for (const point of [DEPOT, ...POINTS]) {
      await db.execute(sql`
        insert into geocoded_addresses (address_key, latitude, longitude, precision, source, external_place_id)
        values (${point.addressKey}, ${point.latitude}, ${point.longitude}, 'rooftop', 'google',
          ${`place-${point.addressKey}`})
        on conflict (address_key) do nothing
      `)
    }

    const seeded = [
      { documentId: documentIds[0] as string, point: POINTS[0], number: '900001' },
      { documentId: documentIds[1] as string, point: POINTS[1], number: '900002' },
      { documentId: documentIds[2] as string, point: POINTS[2], number: '900003' },
      { documentId: twinDocumentId, point: POINTS[0], number: '900004' },
    ]

    for (const [index, entry] of seeded.entries()) {
      const objectId = crypto.randomUUID()
      const participantId = crypto.randomUUID()
      const [postalCode = '', number = ''] = entry.point.addressKey.split('|').slice(1)

      await db.execute(sql`
        insert into stored_objects
          (id, company_id, bucket, object_key, mime_type, provider, purpose, sha256, size_bytes, status)
        values (${objectId}, ${companyId}, 'integration', ${`nfe/pool-${entry.number}.xml`},
          'application/xml', 's3', 'nfe_document', ${String(index + 1).repeat(64)}, 100, 'final')
      `)
      await db.execute(sql`
        insert into nfe_documents
          (id, company_id, import_id, access_key, model, series, number, issued_at,
           operation_nature, operation_type, products_value, freight_value, total_value, status,
           source, authorization_protocol, xml_object_id, xml_sha256, created_by_user_id)
        values (${entry.documentId}, ${companyId}, ${importId}, ${`${9 - index}${'1'.repeat(43)}`},
          '55', '1', ${entry.number}, '2026-08-20T06:00:00.000Z', 'Venda', '1',
          '1000.0000', '0.0000', '1000.0000', 'authorized', 'upload',
          ${`protocol-${entry.number}`}, ${objectId}, ${String(index + 1).repeat(64)}, ${userId})
      `)
      await db.execute(sql`
        insert into nfe_participants (id, company_id, document_id, role, tax_id, legal_name)
        values (${participantId}, ${companyId}, ${entry.documentId}, 'recipient',
          '98765432000109', 'Destinatário')
      `)
      await db.execute(sql`
        insert into nfe_addresses
          (id, company_id, participant_id, street, number, district, city, city_code, state, postal_code)
        values (${crypto.randomUUID()}, ${companyId}, ${participantId}, 'Rua', ${number},
          'Centro', 'Ribeirão Preto', '3543402', 'SP', ${postalCode})
      `)
    }

    await db.execute(sql`
      insert into route_suggestions (id, company_id, trip_id, status, seed, assumptions)
      values (${suggestionId}, ${companyId}, null, 'queued', 7,
        ${JSON.stringify({ solverTimeBudgetSeconds: 2 })}::jsonb)
    `)
    for (const documentId of [...documentIds, twinDocumentId]) {
      await db.execute(sql`
        insert into route_suggestion_documents (id, company_id, suggestion_id, nfe_document_id)
        values (${crypto.randomUUID()}, ${companyId}, ${suggestionId}, ${documentId})
      `)
    }
    await db.execute(sql`
      insert into route_suggestion_vehicles (id, company_id, suggestion_id, vehicle_id, position)
      values
        (${crypto.randomUUID()}, ${companyId}, ${suggestionId}, ${firstVehicleId}, 0),
        (${crypto.randomUUID()}, ${companyId}, ${suggestionId}, ${secondVehicleId}, 1)
    `)
  })

  afterAll(async () => {
    await db.execute(
      sql`delete from route_suggestion_stop_documents where company_id = ${companyId}`,
    )
    await db.execute(sql`delete from route_suggestion_stops where company_id = ${companyId}`)
    await db.execute(sql`delete from route_suggestion_documents where company_id = ${companyId}`)
    await db.execute(sql`delete from route_suggestion_vehicles where company_id = ${companyId}`)
    await db.execute(sql`delete from route_suggestions where company_id = ${companyId}`)
    await db.execute(sql`delete from nfe_addresses where company_id = ${companyId}`)
    await db.execute(sql`delete from nfe_participants where company_id = ${companyId}`)
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
    await provider.close()
  })

  test('leva a sugestão de queued a ready, com nota agrupada por endereço e veículo por parada', async () => {
    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: { companyId, correlationId: 'pool-e2e', suggestionId },
      maxAttempts: 3,
      ports: createRouteOptimizationPorts({
        matrix: haversineMatrix(),
        repository: createDrizzleRouteOptimizationRepository(db),
      }),
    })

    expect(disposition).toBe('ack')

    const [suggestion] = (await db.execute(sql`
      select "status", "error_code", "estimated_distance_meters", "estimated_cost_amount"
      from route_suggestions where "id" = ${suggestionId}
    `)) as unknown as {
      readonly error_code: string
      readonly estimated_cost_amount: string
      readonly estimated_distance_meters: number
      readonly status: string
    }[]

    expect(suggestion?.status).toBe('ready')
    expect(suggestion?.error_code).toBe('')
    /** Distância e custo saem da matriz e do custo do veículo — zero aqui seria proposta vazia. */
    expect(Number(suggestion?.estimated_distance_meters ?? 0)).toBeGreaterThan(0)

    const stops = (await db.execute(sql`
      select "address_key", "sequence", "vehicle_id", "weight_estimated"
      from route_suggestion_stops
      where "suggestion_id" = ${suggestionId}
      order by "sequence"
    `)) as unknown as {
      readonly address_key: string
      readonly sequence: string
      readonly vehicle_id: null | string
      readonly weight_estimated: boolean
    }[]

    /**
     * **Três paradas, não quatro notas.** As duas notas do mesmo endereço viram uma parada — é o
     * mesmo agrupamento que a reconciliação da 056 faz quando a nota entra na viagem, e é o que faz
     * a parada proposta e a parada criada no aceite serem a mesma coisa.
     */
    expect(stops).toHaveLength(3)
    expect(new Set(stops.map((stop) => stop.address_key))).toEqual(
      new Set(POINTS.map((point) => point.addressKey)),
    )

    /** Toda parada saiu com veículo: é por ele que o aceite sabe quantas viagens criar. */
    for (const stop of stops) expect(stop.vehicle_id).not.toBeNull()
    const knownVehicles = new Set<string>([firstVehicleId, secondVehicleId])
    for (const stop of stops) expect(knownVehicles.has(stop.vehicle_id ?? '')).toBe(true)

    /** O peso vem **marcado**: a nota do pool não passou pelo cálculo de frete (ADR-0044 §5). */
    for (const stop of stops) expect(stop.weight_estimated).toBe(true)

    const links = (await db.execute(sql`
      select d."nfe_document_id", s."address_key"
      from route_suggestion_stop_documents d
      join route_suggestion_stops s on s."id" = d."suggestion_stop_id"
      where s."suggestion_id" = ${suggestionId}
    `)) as unknown as {
      readonly address_key: string
      readonly nfe_document_id: string
    }[]

    /** As quatro notas ficam amarradas às paradas: sem isso o aceite reagruparia por endereço de novo. */
    expect(new Set(links.map((link) => link.nfe_document_id))).toEqual(
      new Set([...documentIds, twinDocumentId]),
    )
    const twinAddress = links.find((link) => link.nfe_document_id === twinDocumentId)?.address_key
    const firstAddress = links.find((link) => link.nfe_document_id === documentIds[0])?.address_key
    expect(twinAddress).toBe(firstAddress)
  })

  /**
   * ADR-0044 §1: matriz fora do ar **não vira haversine**. E ela tem duas metades, que este teste
   * cobre nesta ordem: enquanto há tentativa sobrando a mensagem é reentregue e a sugestão continua
   * `running` — o conferente vê "calculando" em vez de um erro que se resolve sozinho em trinta
   * segundos —; esgotadas as tentativas, ela vai a `failed` com código estável, e **sem parada
   * nenhuma gravada**.
   */
  test('a queda da matriz reentrega e, esgotadas as tentativas, falha com código estável', async () => {
    const secondSuggestionId = crypto.randomUUID()
    await db.execute(sql`
      insert into route_suggestions (id, company_id, trip_id, status, seed, assumptions)
      values (${secondSuggestionId}, ${companyId}, null, 'queued', 9, '{}'::jsonb)
    `)
    await db.execute(sql`
      insert into route_suggestion_documents (id, company_id, suggestion_id, nfe_document_id)
      values (${crypto.randomUUID()}, ${companyId}, ${secondSuggestionId}, ${documentIds[0]})
    `)
    await db.execute(sql`
      insert into route_suggestion_vehicles (id, company_id, suggestion_id, vehicle_id, position)
      values (${crypto.randomUUID()}, ${companyId}, ${secondSuggestionId}, ${firstVehicleId}, 0)
    `)

    const ports = createRouteOptimizationPorts({
      matrix: unavailableMatrix(),
      repository: createDrizzleRouteOptimizationRepository(db),
    })
    const job = { companyId, correlationId: 'pool-e2e-down', suggestionId: secondSuggestionId }

    expect(await handleRouteOptimization({ attempt: 1, job, maxAttempts: 3, ports })).toBe('retry')

    const [retried] = (await db.execute(sql`
      select "status", "error_code" from route_suggestions where "id" = ${secondSuggestionId}
    `)) as unknown as { readonly error_code: string; readonly status: string }[]
    /**
     * ⚠️ **`queued`, não `running`.** A reserva é devolvida antes do retry — sem isso a reentrega não
     * consegue reservar de novo (`claim` só pega `queued`) e a sugestão ficaria `running` para
     * sempre, com o painel dizendo "calculando". Foi este teste que achou o defeito.
     */
    expect(retried?.status).toBe('queued')
    expect(retried?.error_code).toBe('')

    /** Esgotadas as tentativas, ela falha de verdade — e é o código estável que a tela traduz. */
    expect(await handleRouteOptimization({ attempt: 3, job, maxAttempts: 3, ports })).toBe('ack')

    const [exhausted] = (await db.execute(sql`
      select "status", "error_code" from route_suggestions where "id" = ${secondSuggestionId}
    `)) as unknown as { readonly error_code: string; readonly status: string }[]
    expect(exhausted?.status).toBe('failed')
    expect(exhausted?.error_code).toBe('ROUTING_MATRIX_UNAVAILABLE')

    const stops = (await db.execute(sql`
      select "id" from route_suggestion_stops where "suggestion_id" = ${secondSuggestionId}
    `)) as unknown as { readonly id: string }[]
    expect(stops).toHaveLength(0)
  })
})

/**
 * ⚠️ **Dublê da matriz, e só dela.** A distância é a de linha reta, calculada aqui — o produto nunca
 * faz isso, e é justamente o que o segundo teste guarda. Ela existe porque o OSRM não sobe no CI e
 * porque o que este teste prova é o **encanamento** do pool: agrupamento, distribuição e escrita.
 */
function haversineMatrix(): RoutingMatrixPort {
  return {
    async table(coordinates) {
      const points = coordinates.map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
      }))
      const distancesMeters = points.map((origin) =>
        points.map((destination) => haversineMetres(origin, destination)),
      )

      return {
        distancesMeters,
        durationsSeconds: distancesMeters.map((row) =>
          row.map((metres) => Math.round(metres / AVERAGE_SPEED_METRES_PER_SECOND)),
        ),
      }
    },
  }
}

function unavailableMatrix(): RoutingMatrixPort {
  return {
    table: async () => {
      throw new RoutingMatrixUnavailable()
    },
  }
}

class RoutingMatrixUnavailable extends Error {
  public readonly code = 'ROUTING_MATRIX_UNAVAILABLE'

  public constructor() {
    super('ROUTING_MATRIX_UNAVAILABLE')
    this.name = 'RoutingMatrixUnavailableError'
  }
}

function haversineMetres(
  origin: Readonly<{ latitude: number; longitude: number }>,
  destination: Readonly<{ latitude: number; longitude: number }>,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180
  const deltaLatitude = toRadians(destination.latitude - origin.latitude)
  const deltaLongitude = toRadians(destination.longitude - origin.longitude)
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(origin.latitude)) *
      Math.cos(toRadians(destination.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2

  return Math.round(2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a))))
}
