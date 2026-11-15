/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 342 T6: confere, em ambiente real, a leitura de estrada da cotação por endereço contra viagens já roteirizadas.
 * Somente leitura. Roda DENTRO do container da api (bundle gerado por `tmp/ops/staging-orcamento-confere.sh`).
 *
 * Para cada viagem recente com exatamente duas paradas, lê a estrada entre as coordenadas guardadas das duas paradas
 * pelo MESMO gateway da cotação (OSRM, pedágio por eixo, ajuste da empresa) e compara com o que a viagem congelou.
 * O localizador de endereço é substituído por um que devolve a coordenada guardada da parada: o Google não é chamado
 * e a geocodificação em si não é medida aqui.
 *
 * Imprime só linhas `__RESULT__` com números e códigos. Nenhum endereço, coordenada, nome ou credencial.
 */
import { sql } from 'drizzle-orm'

import { DrizzleFuelPriceRepository } from '../src/companies/infrastructure/drizzle-fuel-price.repository.js'
import { DrizzleTollBoothChargeRepository } from '../src/companies/infrastructure/drizzle-toll-booth-charge.repository.js'
import { createDatabaseProvider } from '../src/database/database-client.service.js'
import {
  createCalculateFreightQuoteByAddressUseCase,
  type QuoteAddress,
  type QuoteLocation,
} from '../src/freight-quote/application/freight-quote-by-address.use-case.js'
import { createCalculateFreightQuoteUseCase } from '../src/freight-quote/application/freight-quote.use-case.js'
import { DrizzleFreightQuoteSettingsRepository } from '../src/freight-quote/infrastructure/drizzle-freight-quote-settings.repository.js'
import { createQuoteRoadGateway } from '../src/freight-quote/infrastructure/quote-road.gateway.js'
import { createDrizzleTollBoothRepository } from '../src/toll-booths/infrastructure/drizzle-toll-booth.repository.js'
import { createCompanyScopedTollBoothGateway } from '../src/trips/infrastructure/company-scoped-toll-booth.gateway.js'
import { createOsrmRouteGeometryGateway } from '../src/trips/infrastructure/osrm-route-geometry.gateway.js'

type Row = Record<string, unknown>

const LIMIT = Math.min(Number(process.env.TRIP_LIMIT ?? '5') || 5, 20)
const routingUrl = process.env.ROUTING_MATRIX_URL
const databaseUrl = process.env.DATABASE_URL
if (routingUrl === undefined || routingUrl === '' || databaseUrl === undefined) {
  console.log('__RESULT__ erro=ambiente_incompleto (ROUTING_MATRIX_URL ou DATABASE_URL ausente)')
  process.exit(2)
}

const provider = createDatabaseProvider({
  pool: { connectTimeoutSeconds: 10, max: 2, queryTimeoutMs: 30_000 },
  url: databaseUrl,
} as Parameters<typeof createDatabaseProvider>[0])
const database = provider.db as never

function rowsOf(result: unknown): readonly Row[] {
  if (Array.isArray(result)) return result as Row[]
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as Row[]) : []
}

const exec = (query: unknown) =>
  (database as { execute: (query: unknown) => Promise<unknown> }).execute(query)
const [counts] = rowsOf(
  await exec(sql`
    select count(*) as total,
      count(*) filter (where planned_distance_meters is not null) as com_distancia,
      count(*) filter (where planned_toll is not null) as com_pedagio,
      count(*) filter (where planned_distance_meters is not null and (select count(*) from trip_stops s where s.trip_id = t.id) >= 2) as com_distancia_e_duas_paradas
    from trips t`),
)
console.log(
  `__RESULT__ diagnostico viagens=${String(counts?.total)} com_distancia=${String(counts?.com_distancia)} com_pedagio=${String(counts?.com_pedagio)} com_distancia_e_2mais_paradas=${String(counts?.com_distancia_e_duas_paradas)}`,
)
const [geo] = rowsOf(
  await exec(sql`
    select count(*) filter (where g.address_key is not null) as paradas_com_coordenada, count(*) as paradas
    from trip_stops s left join geocoded_addresses g on g.address_key = s.address_key`),
)
console.log(
  `__RESULT__ diagnostico paradas=${String(geo?.paradas)} com_coordenada=${String(geo?.paradas_com_coordenada)}`,
)

/** Viagem com distância planejada e ao menos duas paradas; o km da primeira perna vale sempre, o pedágio só quando a viagem tem exatamente a perna. */
const trips = rowsOf(
  await exec(sql`
    select t.id, t.company_id, t.planned_distance_meters, t.planned_return_distance_meters, t.planned_toll
    from trips t
    where t.planned_distance_meters is not null
      and (select count(*) from trip_stops s where s.trip_id = t.id) >= 2
    order by t.planned_route_frozen_at desc nulls last
    limit ${LIMIT}`),
)
console.log(`__RESULT__ viagens_candidatas=${trips.length}`)

const road = createQuoteRoadGateway({
  geometry: createOsrmRouteGeometryGateway({ baseUrl: routingUrl }),
  tollBoothsFor: (companyId) =>
    createCompanyScopedTollBoothGateway({
      catalog: createDrizzleTollBoothRepository(database),
      charges: new DrizzleTollBoothChargeRepository(database),
      companyId,
    }),
})

let compared = 0
for (const trip of trips) {
  const tripId = String(trip.id)
  const label = tripId.slice(0, 8)
  const stops = rowsOf(
    await (database as { execute: (query: unknown) => Promise<unknown> }).execute(sql`
      select s.address_key, s.distance_from_previous_meters, g.latitude, g.longitude, g.precision
      from trip_stops s left join geocoded_addresses g on g.address_key = s.address_key
      where s.trip_id = ${tripId} order by s.sequence asc`),
  )
  const located = stops.filter((stop) => stop.latitude != null)
  if (located.length < 2) {
    console.log(`__RESULT__ viagem=${label} pulada=sem_coordenada_guardada paradas=${stops.length}`)
    continue
  }
  const toll = (trip.planned_toll ?? {}) as {
    axles?: { count?: number }
    multiplier?: unknown
    total?: string
  }
  const axles = toll.axles?.count ?? 5
  const toLocation = (stop: Row): QuoteLocation => ({
    latitude: String(stop.latitude),
    longitude: String(stop.longitude),
    precision: stop.precision as QuoteLocation['precision'],
  })
  /** Soma das pernas entre paradas consecutivas: o que a cotação mediria perna a perna, contra o que a viagem congelou. */
  let sumMeters = 0
  let sumToll = 0
  let tollKnown = true
  const legKm: string[] = []
  let broken = false
  for (let index = 0; index < located.length - 1; index += 1) {
    const leg = await road.read({
      axles,
      companyId: String(trip.company_id),
      destination: toLocation(located[index + 1] as Row),
      origin: toLocation(located[index] as Row),
      vehicleType: 'truck',
    })
    if (leg === null) {
      broken = true
      break
    }
    sumMeters += leg.distanceMeters
    legKm.push((leg.distanceMeters / 1000).toFixed(1))
    if (
      leg.toll === null ||
      leg.toll.boothsWithoutCharge > 0 ||
      leg.toll.catalogStatus !== 'current'
    ) {
      tollKnown = false
    } else {
      sumToll += Number(leg.toll.total)
    }
  }
  if (broken) {
    console.log(`__RESULT__ viagem=${label} erro=estrada_indisponivel`)
    continue
  }
  compared += 1
  const plannedMeters = Number(trip.planned_distance_meters)
  const returnMeters = Number(trip.planned_return_distance_meters ?? 0)
  const deltaPercent =
    plannedMeters > 0 ? (((sumMeters - plannedMeters) / plannedMeters) * 100).toFixed(1) : '?'
  console.log(
    `__RESULT__ viagem=${label} eixos=${axles} paradas=${stops.length} com_coordenada=${located.length}` +
      ` km_viagem=${(plannedMeters / 1000).toFixed(1)} km_volta_viagem=${(returnMeters / 1000).toFixed(1)} km_soma_pernas=${(sumMeters / 1000).toFixed(1)} delta_km_pct=${deltaPercent}` +
      ` pedagio_viagem=${toll.total ?? '?'} pedagio_soma_pernas=${tollKnown ? sumToll.toFixed(4) : 'desconhecido'} pernas_km=${legKm.join('/')}`,
  )

  const origin = toLocation(located[0] as Row)
  const destination = toLocation(located[located.length - 1] as Row)
  const reading = await road.read({
    axles,
    companyId: String(trip.company_id),
    destination,
    origin,
    vehicleType: 'truck',
  })
  if (reading === null) continue
  const locator = {
    locate: async ({ address }: { readonly address: QuoteAddress }) =>
      address.street === 'origem' ? origin : destination,
  }
  const useCase = createCalculateFreightQuoteByAddressUseCase({
    calculate: createCalculateFreightQuoteUseCase({
      fuelPrices: new DrizzleFuelPriceRepository(database),
      settings: new DrizzleFreightQuoteSettingsRepository(database),
    }),
    locator,
    road: { read: async () => reading },
  })
  const address = (street: string): QuoteAddress => ({
    city: 'x',
    cityIbgeCode: null,
    district: 'x',
    number: '1',
    postalCode: '00000000',
    state: 'SP',
    street,
  })
  try {
    const quote = await useCase.execute({
      axles,
      cargoType: 5,
      cargoValue: '0',
      companyId: String(trip.company_id),
      destination: address('destino'),
      fuelPricePerLitre: null,
      highPerformance: false,
      origin: address('origem'),
      shareOfVehiclePercent: '100',
      vehicleType: 'truck',
    })
    console.log(
      `__RESULT__ viagem=${label} extremos_cotacao_total=${quote.totalAmount} km=${quote.distanceKm} pedagio=${quote.tollAmount}`,
    )
  } catch (error) {
    console.log(
      `__RESULT__ viagem=${label} cotacao_recusada=${error instanceof Error ? error.name : 'erro'}`,
    )
  }
}
console.log(`__RESULT__ comparadas=${compared}`)
process.exit(0)
