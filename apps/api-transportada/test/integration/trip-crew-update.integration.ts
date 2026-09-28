/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 216: o `UPDATE`/`DELETE`+`INSERT` de `updateCrew` roda numa transação com lock — o teste com
 * repositório fake nunca exercita a constraint composta `trips_company_vehicle_fk` nem o
 * compare-and-set do status sob `SELECT … FOR NO KEY UPDATE`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { trips, tripDrivers, tripStops } from '../../src/database/trip.schema.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { resolveCrewStatus } from '../../src/trips/domain/trip-state.policy.js'
import { resolveTripAllowedActions } from '../../src/trips/domain/trip-allowed-actions.policy.js'
import { DrizzleTripPlannedRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-planned-route.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_crewupdate_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}

async function seedCompanyFleet(database: TestDatabase['db']): Promise<{
  readonly companyId: string
  readonly firstDriverId: string
  readonly firstVehicleId: string
  readonly secondDriverId: string
  readonly secondVehicleId: string
  readonly userId: string
}> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const firstDriverId = crypto.randomUUID()
  const secondDriverId = crypto.randomUUID()
  const firstVehicleId = crypto.randomUUID()
  const secondVehicleId = crypto.randomUUID()

  await database.insert(companies).values({ id: companyId, status: 'active' })
  await database.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  await database.insert(fleetVehicles).values([
    {
      companyId,
      /** Spec 217 T306: eixos distintos entre os dois veículos — é o que faz o pedágio diferir. */
      axleCount: 6,
      id: firstVehicleId,
      plate: 'ABC1D23',
      role: 'traction',
      state: 'SP',
      vehicleType: 'tractor_unit',
    },
    {
      companyId,
      axleCount: 2,
      id: secondVehicleId,
      plate: 'XYZ9E88',
      role: 'traction',
      state: 'SP',
      vehicleType: 'truck',
    },
  ])
  await database.insert(fleetDrivers).values([
    { companyId, id: firstDriverId, name: 'Primeiro Motorista', taxId: '11111111111' },
    { companyId, id: secondDriverId, name: 'Segundo Motorista', taxId: '22222222222' },
  ])

  return { companyId, firstDriverId, firstVehicleId, secondDriverId, secondVehicleId, userId }
}

/**
 * Spec 217 T103: a criação por HTTP ainda exige o par completo — abrir `POST /trips` para viagem sem
 * tripulação é a RF2, implementada na T202 e provada na T201. Até lá o estado inicial
 * `awaiting_crew` nasce daqui, como o `route_planned` do teste da 216 logo acima.
 */
async function createAwaitingCrewTrip(
  database: TestDatabase['db'],
  fleet: { readonly companyId: string; readonly userId: string },
): Promise<string> {
  const repository = new DrizzleTripRepository(database)
  const created = await repository.create({
    actorUserId: fleet.userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId: fleet.companyId,
    crew: [],
    vehicleId: null,
  })
  await database.update(trips).set({ status: 'awaiting_crew' }).where(eq(trips.id, created.id))
  return created.id
}

async function readCrewState(
  database: TestDatabase['db'],
  input: { readonly companyId: string; readonly tripId: string },
): Promise<{
  readonly driverIds: readonly string[]
  readonly status: string
  readonly vehicleId: string | null
}> {
  const [tripRow] = await database
    .select({ status: trips.status, vehicleId: trips.vehicleId })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
  if (tripRow === undefined) throw new Error('TRIP_NOT_FOUND')
  const driverRows = await database
    .select({ driverId: tripDrivers.driverId })
    .from(tripDrivers)
    .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)))
  return {
    driverIds: driverRows.map((row) => row.driverId),
    status: tripRow.status,
    vehicleId: tripRow.vehicleId,
  }
}

/**
 * Spec 217 D1: a coerência é a invariante que importa — o status gravado é exatamente
 * `resolveCrewStatus` do par que ficou no banco, nunca `draft` sem as duas coisas.
 */
function expectStatusDerivedFromStoredCrew(
  state: {
    readonly driverIds: readonly string[]
    readonly status: string
    readonly vehicleId: string | null
  },
  /**
   * Spec 217 D3-ter: com roteiro congelado sobrevivendo à troca, o par completo descreve
   * `route_planned`, não `draft` — `resolveCrewStatus` responde só a metade da pergunta.
   */
  options: { readonly routeSurvived?: boolean } = {},
): void {
  const byPair = resolveCrewStatus({
    hasDriver: state.driverIds.length > 0,
    hasVehicle: state.vehicleId !== null,
  })
  const expected = options.routeSurvived === true && byPair === 'draft' ? 'route_planned' : byPair
  expect(state.status).toBe(expected)
}

describe('troca de motorista/veículo de uma viagem, contra Postgres', () => {
  /**
   * Spec 217 T307, a necessidade que abriu esta spec: **trocar o motorista de uma viagem já
   * roteirizada.** A rota e o pedágio saem da classe e dos eixos do caminhão, e quem dirige não entra
   * nessa conta (097 D1/D3/D4) — então o roteiro fica de pé, a viagem nem sai de `route_planned`, e
   * não há nada a replanejar.
   *
   * ⚠️ O que este teste prende contra regressão é o **par** de fatos: o motorista trocou E o pedágio
   * continua lá. Provar só o primeiro deixaria passar uma limpeza de rota disparada por engano na
   * troca de motorista, que é o defeito mais caro possível aqui — perder o pedágio congelado de uma
   * viagem pronta para separar.
   */
  testWithPostgres(
    'trocar só o motorista de uma viagem roteirizada deixa a rota e o pedágio de pé',
    async () => {
      await withDisposableDatabase(async (database) => {
        const fleet = await seedCompanyFleet(database.db)
        const repository = new DrizzleTripRepository(database.db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })

        const frozenRoute = { criterion: 'cheapest', legs: [], points: [], signature: 'abc' }
        const frozenToll = { total: '12.34' }
        /**
         * ⚠️ `trips_planned_route_check` é a 153 D4 em forma de banco: `planned_route`,
         * `planned_distance_meters`, `planned_return_distance_meters` e `planned_duration_seconds`
         * são nulos **juntos** ou preenchidos **juntos** com o carimbo. Deixar o retorno de fora
         * derrubou este teste na CI com `23514` — o seed tem de congelar a rota inteira, como o
         * congelador de verdade faz.
         */
        await database.db
          .update(trips)
          .set({
            plannedDistanceMeters: 42_000,
            plannedDurationSeconds: 3_600,
            plannedReturnDistanceMeters: 8_000,
            plannedRoute: frozenRoute,
            plannedRouteFrozenAt: new Date(),
            plannedToll: frozenToll,
            plannedTollFrozenAt: new Date(),
            status: 'route_planned',
          })
          .where(eq(trips.id, created.id))

        await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.secondDriverId,
              driverName: 'Segundo Motorista',
              driverTaxId: '22222222222',
              position: 1,
            },
          ],
          tripId: created.id,
          vehicleId: fleet.firstVehicleId,
        })

        const state = await readCrewState(database.db, {
          companyId: fleet.companyId,
          tripId: created.id,
        })
        expect(state.driverIds).toEqual([fleet.secondDriverId])
        expect(state.vehicleId).toBe(fleet.firstVehicleId)
        expect(state.status).toBe('route_planned')
        expectStatusDerivedFromStoredCrew(state, { routeSurvived: true })

        const [routeRow] = await database.db
          .select({
            plannedDistanceMeters: trips.plannedDistanceMeters,
            plannedReturnDistanceMeters: trips.plannedReturnDistanceMeters,
            plannedRoute: trips.plannedRoute,
            plannedRouteFrozenAt: trips.plannedRouteFrozenAt,
            plannedToll: trips.plannedToll,
            plannedTollFrozenAt: trips.plannedTollFrozenAt,
          })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(routeRow?.plannedRoute).toEqual(frozenRoute)
        expect(routeRow?.plannedToll).toEqual(frozenToll)
        expect(routeRow?.plannedDistanceMeters).toBe(42_000)
        expect(routeRow?.plannedReturnDistanceMeters).toBe(8_000)
        expect(routeRow?.plannedRouteFrozenAt).not.toBeNull()
        expect(routeRow?.plannedTollFrozenAt).not.toBeNull()
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /** Spec 217 D2: da separação em diante a troca é recusada, e o nome da recusa diz o motivo. */
  testWithPostgres(
    'a separação iniciada recusa a troca',
    async () => {
      await withDisposableDatabase(async (database) => {
        const fleet = await seedCompanyFleet(database.db)
        const repository = new DrizzleTripRepository(database.db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        await database.db
          .update(trips)
          .set({ status: 'separating' })
          .where(eq(trips.id, created.id))

        await expect(
          repository.updateCrew({
            actorUserId: fleet.userId,
            channel: TRIP_FIELD_CHANNELS.backoffice,
            companyId: fleet.companyId,
            crew: [
              {
                driverId: fleet.secondDriverId,
                driverName: 'Segundo Motorista',
                driverTaxId: '22222222222',
                position: 1,
              },
            ],
            tripId: created.id,
            vehicleId: fleet.firstVehicleId,
          }),
          /**
           * ⚠️ Pelo **código**, nunca pela mensagem: `TripStateTransitionNotAllowedError` carrega o
           * motivo em `reason` e põe o texto humano em `message`. Assertar a mensagem quebrou na CI e
           * prenderia o teste à redação, que muda sem o comportamento mudar.
           */
        ).rejects.toMatchObject({ reason: 'TRIP_SEPARATION_STARTED' })

        const state = await readCrewState(database.db, {
          companyId: fleet.companyId,
          tripId: created.id,
        })
        expect(state.driverIds).toEqual([fleet.firstDriverId])
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'troca a tripulação de uma viagem draft para outro motorista e veículo',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
              role: 'driver',
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        expect(created.status).toBe('draft')

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.secondDriverId,
              driverName: 'Segundo Motorista',
              driverTaxId: '22222222222',
              position: 1,
              role: 'driver',
            },
          ],
          tripId: created.id,
          vehicleId: fleet.secondVehicleId,
        })

        expect(updated?.status).toBe('draft')

        const [tripRow] = await db
          .select({ vehicleId: trips.vehicleId })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(tripRow?.vehicleId).toBe(fleet.secondVehicleId)

        const drivers = await db
          .select({ driverId: tripDrivers.driverId })
          .from(tripDrivers)
          .where(
            and(eq(tripDrivers.companyId, fleet.companyId), eq(tripDrivers.tripId, created.id)),
          )
        expect(drivers).toEqual([{ driverId: fleet.secondDriverId }])
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /**
   * Spec 217 D2/D3: este teste **afirmava a recusa** em `route_planned` (216) e virou o oposto — a
   * troca é permitida lá, e trocar o veículo devolve a viagem para `draft`, porque o roteiro
   * congelado descrevia o caminhão antigo. A limpeza das sete colunas é a T305 (Fase 3B); aqui se
   * prende a transição e a gravação do veículo novo.
   */
  testWithPostgres(
    'trocar o veículo de uma viagem roteirizada devolve a viagem para draft',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
              role: 'driver',
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        /**
         * Spec 217 T304: a rota nasce inteira (as sete colunas de `trips_planned_route_check`) e o ETA
         * vem carimbado — é a única forma de o teste distinguir o que a troca **mata** do que ela
         * **preserva** (D3 contra D3-bis). Viagem sem ETA gravado provaria só metade.
         */
        /**
         * ⚠️ A viagem precisa de **parada** para o teste dizer a verdade: `resolveTripHasRoute` deriva
         * de paradas e notas, e viagem sem parada nenhuma nunca oferece `planRoute` — por motivo que
         * não tem nada a ver com a troca. Viagem que chegou a `route_planned` na vida real sempre tem.
         */
        await db.insert(tripStops).values({
          addressKey: '3550308|01001000|100',
          companyId: fleet.companyId,
          id: crypto.randomUUID(),
          label: 'Centro, 100',
          sequence: 1n,
          tripId: created.id,
        })

        const frozenAt = new Date()
        await db
          .update(trips)
          .set({
            estimatedArrivalFrozenAt: frozenAt,
            etaDepartureAt: frozenAt,
            plannedDistanceMeters: 42_000,
            plannedDurationSeconds: 3_600,
            plannedReturnDistanceMeters: 8_000,
            plannedRoute: { criterion: 'cheapest', legs: [], points: [], signature: 'abc' },
            plannedRouteFrozenAt: frozenAt,
            plannedToll: { total: '12.34' },
            plannedTollFrozenAt: frozenAt,
            status: 'route_planned',
          })
          .where(eq(trips.id, created.id))

        await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.secondDriverId,
              driverName: 'Segundo Motorista',
              driverTaxId: '22222222222',
              position: 1,
              role: 'driver',
            },
          ],
          tripId: created.id,
          vehicleId: fleet.secondVehicleId,
        })

        const [tripRow] = await db
          .select({ status: trips.status, vehicleId: trips.vehicleId })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(tripRow?.vehicleId).toBe(fleet.secondVehicleId)
        expect(tripRow?.status).toBe('draft')

        /**
         * Spec 217 D3: **as sete colunas de rota e pedágio morrem juntas**, na mesma escrita da
         * troca. O número velho foi congelado com os eixos do caminhão antigo, e deixá-lo por aí é o
         * defeito que esta decisão existe para evitar — a valoração o leria como se valesse.
         */
        const [routeRow] = await db
          .select({
            estimatedArrivalFrozenAt: trips.estimatedArrivalFrozenAt,
            etaDepartureAt: trips.etaDepartureAt,
            plannedDistanceMeters: trips.plannedDistanceMeters,
            plannedDurationSeconds: trips.plannedDurationSeconds,
            plannedReturnDistanceMeters: trips.plannedReturnDistanceMeters,
            plannedRoute: trips.plannedRoute,
            plannedRouteFrozenAt: trips.plannedRouteFrozenAt,
            plannedToll: trips.plannedToll,
            plannedTollFrozenAt: trips.plannedTollFrozenAt,
          })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(routeRow?.plannedRoute).toBeNull()
        expect(routeRow?.plannedRouteFrozenAt).toBeNull()
        expect(routeRow?.plannedToll).toBeNull()
        expect(routeRow?.plannedTollFrozenAt).toBeNull()
        expect(routeRow?.plannedDistanceMeters).toBeNull()
        expect(routeRow?.plannedReturnDistanceMeters).toBeNull()
        expect(routeRow?.plannedDurationSeconds).toBeNull()

        /**
         * Spec 217 D3-bis: **o ETA sobrevive.** A hora que vale é a ancorada na partida real do
         * motorista, e zerar `eta_departure_at` desligaria o deslocamento do despacho em silêncio —
         * a viagem não ficaria sem previsão, ficaria com previsão que nunca mais se corrige.
         */
        expect(routeRow?.etaDepartureAt).not.toBeNull()
        expect(routeRow?.estimatedArrivalFrozenAt).not.toBeNull()

        /**
         * Spec 217 T306: a metade do ciclo que se prova **sem** o roteirizador. Zerar o pedágio velho
         * só vale se o replanejamento usar os eixos do caminhão **novo** — e é `readVehicleContext`
         * que os entrega ao congelador. Seis eixos antes, dois depois: se a troca não tivesse
         * atualizado `trips.vehicle_id`, esta leitura devolveria os seis e o pedágio recongelaria
         * errado, com a rota parecendo nova.
         *
         * O ciclo completo (replanejar de fato e comparar o valor do pedágio) depende do OSRM e fica
         * para o teste de ponta a ponta com roteirizador dublado.
         */
        const vehicleContext = await new DrizzleTripPlannedRouteRepository(db).readVehicleContext({
          companyId: fleet.companyId,
          tripId: created.id,
        })
        expect(vehicleContext?.axles).toEqual({ count: 2, source: 'declared' })

        /**
         * ⚠️ **O elo que fecha a D3, e sem o qual ela seria um defeito grave.** Zerar `planned_route`
         * só é aceitável se o operador puder replanejar — senão o pedágio morre para sempre e a troca
         * de veículo destrói informação em silêncio.
         *
         * Funciona porque `resolveTripHasRoute` deriva de **paradas e notas**, não do roteiro
         * congelado: a viagem continua tendo parada, então `planRoute` volta a ser oferecido assim que
         * o status é `draft`. Se algum dia alguém fizer `hasRoute` olhar `planned_route`, este teste
         * cai — e é ele que impede o defeito de passar.
         */
        const tripAfterSwap = await repository.findById({
          companyId: fleet.companyId,
          tripId: created.id,
        })
        const offered = resolveTripAllowedActions({
          capabilities: { canManage: true, canReportOnBehalf: false },
          trip: {
            documents: (tripAfterSwap?.documents ?? []).map((document) => ({
              id: document.id,
              releasedAt: document.releasedAt,
              separationStatus: document.separationStatus,
              stopId: document.stopId,
            })),
            hasDriver: (tripAfterSwap?.drivers.length ?? 0) > 0,
            status: tripAfterSwap?.status ?? 'draft',
            stops: (tripAfterSwap?.stops ?? []).map((stop) => ({
              arrivedAt: stop.arrivedAt,
              id: stop.id,
            })),
          },
        })
        expect(offered.trip).toContain('planRoute')
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
  testWithPostgres(
    'define o par completo numa viagem awaiting_crew e grava draft no banco',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)
        const tripId = await createAwaitingCrewTrip(db, fleet)

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          tripId,
          vehicleId: fleet.firstVehicleId,
        })
        expect(updated?.status).toBe('draft')

        const state = await readCrewState(db, { companyId: fleet.companyId, tripId })
        expect(state.status).toBe('draft')
        expect(state.vehicleId).toBe(fleet.firstVehicleId)
        expect(state.driverIds).toEqual([fleet.firstDriverId])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'só o veículo não promove a viagem awaiting_crew, e o veículo fica gravado',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)
        const tripId = await createAwaitingCrewTrip(db, fleet)

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [],
          tripId,
          vehicleId: fleet.firstVehicleId,
        })
        expect(updated?.status).toBe('awaiting_crew')

        const state = await readCrewState(db, { companyId: fleet.companyId, tripId })
        expect(state.status).toBe('awaiting_crew')
        expect(state.vehicleId).toBe(fleet.firstVehicleId)
        expect(state.driverIds).toEqual([])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'só o motorista não promove a viagem awaiting_crew, e o veículo segue nulo',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)
        const tripId = await createAwaitingCrewTrip(db, fleet)

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          tripId,
          vehicleId: null,
        })
        expect(updated?.status).toBe('awaiting_crew')

        const state = await readCrewState(db, { companyId: fleet.companyId, tripId })
        expect(state.status).toBe('awaiting_crew')
        expect(state.vehicleId).toBeNull()
        expect(state.driverIds).toEqual([fleet.firstDriverId])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'desfazer a tripulação de uma viagem draft regride para awaiting_crew no banco',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        expect(created.status).toBe('draft')

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [],
          tripId: created.id,
          vehicleId: null,
        })
        expect(updated?.status).toBe('awaiting_crew')

        const state = await readCrewState(db, {
          companyId: fleet.companyId,
          tripId: created.id,
        })
        expect(state.status).toBe('awaiting_crew')
        expect(state.vehicleId).toBeNull()
        expect(state.driverIds).toEqual([])
        expectStatusDerivedFromStoredCrew(state)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})
