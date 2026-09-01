/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 069 — **CA10**, e ele é o teste que separa esta feature de tudo o que veio antes: uma
 * sugestão cujos endereços **não estão** em `geocoded_addresses` termina com parada **dentro** da
 * otimização. Até esta spec isso era impossível: a tabela nascia vazia, ninguém a preenchia, e toda
 * parada saía `excludedFromOptimization` — o solver corria sobre nada e a sugestão respondia vazia,
 * sem erro nenhum a traduzir na tela.
 *
 * Real: o repositório, a cascata, o centroide lido do banco, o efeito, o solver e o Postgres.
 * **Stub: a matriz e o transporte do CEP.** A matriz pela mesma razão do teste do pool — o OSRM não
 * sobe no CI —, e o transporte porque bater na BrasilAPI dentro da suíte tornaria o teste refém de
 * um serviço público e gratuito. O corpo dublado é o **medido** em 2026-09-01.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { handleRouteOptimization } from '../src/routing/application/route-optimization-handler.service.js'
import type { RoutingMatrixPort } from '../src/routing/application/routing-matrix.port.js'
import { createBrasilApiPostalCodeGateway } from '../src/routing/infrastructure/brasil-api-postal-code.gateway.js'
import { createDrizzleGeocodedAddressRepository } from '../src/routing/infrastructure/drizzle-geocoded-address.repository.js'
import { createDrizzleRouteOptimizationRepository } from '../src/routing/infrastructure/drizzle-route-optimization.repository.js'
import { createMunicipalityCentroidGateway } from '../src/routing/infrastructure/municipality-centroid.gateway.js'
import { createRouteOptimizationPorts } from '../src/routing/infrastructure/route-optimization-ports.factory.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
const db = provider.db

const DEPOT = { addressKey: 'depot-069', latitude: '-21.1767000', longitude: '-47.8208000' }

/** Ribeirão Preto. O primeiro resolve pelo CEP; o segundo cai no município, e sai da otimização. */
const RESOLVED_BY_POSTAL_CODE = {
  addressKey: '3543402|14015000|100',
  latitude: '-21.1800000',
  longitude: '-47.8100000',
  postalCode: '14015000',
}
const FALLS_BACK_TO_CITY = {
  addressKey: '3543402|14099999|200',
  postalCode: '14099999',
}
/** O centroide do município, semeado como o seed real faz. */
const RIBEIRAO_CENTROID = { cityCode: '3543402', latitude: '-21.2138406', longitude: '-47.8218619' }

/** O corpo que a BrasilAPI devolve — medido; o CEP desconhecido responde 404 e desce a cascata. */
function postalCodeTransport(): typeof fetch {
  return (async (input: string | URL) => {
    const known = String(input).endsWith(RESOLVED_BY_POSTAL_CODE.postalCode)

    return new Response(
      JSON.stringify(
        known
          ? {
              cep: RESOLVED_BY_POSTAL_CODE.postalCode,
              city: 'Ribeirão Preto',
              location: {
                coordinates: {
                  latitude: RESOLVED_BY_POSTAL_CODE.latitude,
                  longitude: RESOLVED_BY_POSTAL_CODE.longitude,
                },
                type: 'Point',
              },
              street: 'Rua Visconde do Rio Branco',
            }
          : { message: 'CEP não encontrado' },
      ),
      { headers: { 'content-type': 'application/json' }, status: known ? 200 : 404 },
    )
  }) as unknown as typeof fetch
}

function constantMatrix(): RoutingMatrixPort {
  return {
    table: (coordinates) => {
      const size = coordinates.length

      return Promise.resolve({
        distancesMeters: Array.from({ length: size }, (_row, from) =>
          Array.from({ length: size }, (_column, to) => (from === to ? 0 : 5_000)),
        ),
        durationsSeconds: Array.from({ length: size }, (_row, from) =>
          Array.from({ length: size }, (_column, to) => (from === to ? 0 : 600)),
        ),
      })
    },
  }
}

describeDatabase('a sugestão geocodifica o que falta (spec 069, CA10)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const suggestionId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const documents = [
    { documentId: crypto.randomUUID(), number: '990001', point: RESOLVED_BY_POSTAL_CODE },
    { documentId: crypto.randomUUID(), number: '990002', point: FALLS_BACK_TO_CITY },
  ]

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state, capacity_kg)
      values (${vehicleId}, ${companyId}, 'GCQ9E47', 'traction', 'toco', 'SP', 4000)
    `)
    await db.execute(sql`
      insert into nfe_imports
        (id, company_id, correlation_id, idempotency_key, request_fingerprint,
         requested_by_user_id, source, status)
      values (${importId}, ${companyId}, 'geo-e2e', 'geo-e2e', 'geo-e2e', ${userId},
        'upload', 'completed')
    `)
    await db.execute(sql`
      insert into company_route_optimization_settings (company_id, origin_address_key, timezone)
      values (${companyId}, ${DEPOT.addressKey}, 'America/Sao_Paulo')
    `)
    /**
     * ⚠️ **Só o depósito** entra em `geocoded_addresses`. Os destinos ficam de fora de propósito: é
     * exatamente isso que este teste existe para exercitar.
     */
    await db.execute(sql`
      insert into geocoded_addresses
        (address_key, latitude, longitude, precision, source, external_place_id)
      values (${DEPOT.addressKey}, ${DEPOT.latitude}, ${DEPOT.longitude}, 'rooftop', 'manual', '')
      on conflict (address_key) do nothing
    `)
    await db.execute(sql`
      insert into municipality_centroids (city_code, state, latitude, longitude)
      values (${RIBEIRAO_CENTROID.cityCode}, 'SP', ${RIBEIRAO_CENTROID.latitude},
        ${RIBEIRAO_CENTROID.longitude})
      on conflict (city_code) do nothing
    `)

    for (const [index, entry] of documents.entries()) {
      const objectId = crypto.randomUUID()
      const participantId = crypto.randomUUID()
      const [postalCode = '', number = ''] = entry.point.addressKey.split('|').slice(1)

      await db.execute(sql`
        insert into stored_objects
          (id, company_id, bucket, object_key, mime_type, provider, purpose, sha256, size_bytes, status)
        values (${objectId}, ${companyId}, 'integration', ${`nfe/geo-${entry.number}.xml`},
          'application/xml', 's3', 'nfe_document', ${String(index + 5).repeat(64)}, 100, 'final')
      `)
      await db.execute(sql`
        insert into nfe_documents
          (id, company_id, import_id, access_key, model, series, number, issued_at,
           operation_nature, operation_type, products_value, freight_value, total_value, status,
           source, authorization_protocol, xml_object_id, xml_sha256, created_by_user_id)
        values (${entry.documentId}, ${companyId}, ${importId}, ${`${7 - index}${'2'.repeat(43)}`},
          '55', '1', ${entry.number}, '2026-08-20T06:00:00.000Z', 'Venda', '1',
          '1000.0000', '0.0000', '1000.0000', 'authorized', 'upload',
          ${`protocol-${entry.number}`}, ${objectId}, ${String(index + 5).repeat(64)}, ${userId})
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
      values (${suggestionId}, ${companyId}, null, 'queued', 11,
        ${JSON.stringify({ solverTimeBudgetSeconds: 2 })}::jsonb)
    `)
    for (const entry of documents) {
      await db.execute(sql`
        insert into route_suggestion_documents (id, company_id, suggestion_id, nfe_document_id)
        values (${crypto.randomUUID()}, ${companyId}, ${suggestionId}, ${entry.documentId})
      `)
    }
    await db.execute(sql`
      insert into route_suggestion_vehicles (id, company_id, suggestion_id, vehicle_id, position)
      values (${crypto.randomUUID()}, ${companyId}, ${suggestionId}, ${vehicleId}, 0)
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
    await db.execute(
      sql`delete from geocoded_addresses where address_key in
        (${DEPOT.addressKey}, ${RESOLVED_BY_POSTAL_CODE.addressKey}, ${FALLS_BACK_TO_CITY.addressKey})`,
    )
    await provider.close()
  })

  test('resolve o endereço que faltava e põe a parada dentro da otimização', async () => {
    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: { companyId, correlationId: 'geo-e2e', suggestionId },
      maxAttempts: 3,
      ports: createRouteOptimizationPorts({
        geocoding: {
          centroids: createMunicipalityCentroidGateway(db),
          geocoding: createBrasilApiPostalCodeGateway({
            baseUrl: 'https://brasilapi.com.br/api/cep/v2',
            fetchImplementation: postalCodeTransport(),
          }),
          repository: createDrizzleGeocodedAddressRepository(db),
        },
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

    /** A cascata gravou os dois endereços que faltavam — é o que faz a segunda sugestão ser grátis. */
    const stored = (await db.execute(sql`
      select "address_key", "precision", "source" from geocoded_addresses
      where "address_key" in (${RESOLVED_BY_POSTAL_CODE.addressKey}, ${FALLS_BACK_TO_CITY.addressKey})
      order by "address_key"
    `)) as unknown as {
      readonly address_key: string
      readonly precision: string
      readonly source: string
    }[]

    expect(stored).toHaveLength(2)
    expect(
      stored.find((row) => row.address_key === RESOLVED_BY_POSTAL_CODE.addressKey),
    ).toMatchObject({ precision: 'postal_code', source: 'postal_code' })
    /** ADR-0044 §5: o que caiu no município entra em base como palpite, e continua marcado. */
    expect(stored.find((row) => row.address_key === FALLS_BACK_TO_CITY.addressKey)).toMatchObject({
      precision: 'city',
      source: 'city',
    })

    /**
     * O que este teste existe para provar: **a parada entrou na rota**. Antes da spec 069 esta lista
     * era vazia para qualquer endereço não semeado à mão, e a sugestão saía `ready` sem propor nada.
     */
    const stops = (await db.execute(sql`
      select "address_key" from route_suggestion_stops where "suggestion_id" = ${suggestionId}
    `)) as unknown as { readonly address_key: string }[]

    expect(stops.map((row) => row.address_key)).toContain(RESOLVED_BY_POSTAL_CODE.addressKey)
  })
})
