/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5, contra o Postgres de verdade — molde de `trip-field-office.integration.ts`
 * (`withDisposableDatabase`), mas com inserts diretos via Drizzle nas seis fontes: `listTripTimeline`
 * é leitura pura, e os casos de uso que gravam cada fonte já têm a cobertura deles (T3/T4). O que
 * falta provar aqui é a leitura: aceite 3 (retroativo vs motorista), D3 (canal não registrado),
 * aceite 5 (isolamento de tenant), aceite 7 (cursor sem repetir/pular com empate) e aceite 8 (chaves
 * proibidas ausentes), mais o p95 de RNF2.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyOccurrenceTypes,
  fleetDrivers,
  fleetVehicles,
  identityUserProfiles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  tripDocumentEvents,
  tripDocumentOccurrences,
  tripDocuments,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
  tripStops,
  trips,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  findTripCompanyScope,
  listTripTimeline,
} from '../../src/trips/infrastructure/trip-timeline.query.js'
import type { ReadTripTimelineParams } from '../../src/trips/application/trip-timeline.types.js'
import { createReadTripTimelineUseCase } from '../../src/trips/application/read-trip-timeline.use-case.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type Company = {
  readonly companyId: string
  readonly driverId: string
  readonly userId: string
  readonly vehicleId: string
}

async function seedCompany(database: TestDatabase): Promise<Company> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const driverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: 'usuaria@example.com',
    contactChannel: 'email',
    name: 'Usuária Escritório',
    userId,
    username: `usuaria.${userId.slice(0, 8)}`,
  })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E48',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db
    .insert(fleetDrivers)
    .values({ companyId, id: driverId, name: 'Motorista Um', taxId: '11122233344' })

  return { companyId, driverId, userId, vehicleId }
}

async function seedTrip(database: TestDatabase, company: Company): Promise<string> {
  const tripId = crypto.randomUUID()
  await database.db.insert(trips).values({
    companyId: company.companyId,
    id: tripId,
    status: 'in_transit',
    vehicleId: company.vehicleId,
  })
  return tripId
}

async function seedStop(
  database: TestDatabase,
  company: Company,
  tripId: string,
  sequence: number,
): Promise<string> {
  const stopId = crypto.randomUUID()
  await database.db.insert(tripStops).values({
    addressKey: `3550308|01001000|${stopId}`,
    companyId: company.companyId,
    id: stopId,
    label: `Parada ${sequence}`,
    sequence: BigInt(sequence),
    tripId,
  })
  return stopId
}

let nfeCounter = 0

async function seedTripDocument(
  database: TestDatabase,
  company: Company,
  tripId: string,
  stopId: string,
): Promise<string> {
  nfeCounter += 1
  const documentId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const suffix = documentId.replaceAll('-', '')
  const sha = suffix.padEnd(64, '0').slice(0, 64)
  const digits = String(nfeCounter).padStart(6, '0') + suffix.replace(/[a-f]/g, '1').slice(0, 20)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: company.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/trip-timeline-${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: company.companyId,
    correlationId: `correlation-${suffix}`,
    id: importId,
    idempotencyKey: `trip-timeline-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: company.userId,
    source: 'upload',
    status: 'completed',
  })
  const nfeDocumentId = crypto.randomUUID()
  await database.db.insert(nfeDocuments).values({
    accessKey: digits.padEnd(44, '0').slice(0, 44),
    authorizationProtocol: `protocol-${suffix}`,
    companyId: company.companyId,
    createdByUserId: company.userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
    importId,
    issuedAt: new Date('2026-09-18T06:00:00.000Z'),
    model: '55',
    number: String(nfeCounter),
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '10000.0000',
    xmlObjectId,
    xmlSha256: sha,
  })
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    id: documentId,
    nfeDocumentId,
    separationStatus: 'loaded',
    stopId,
    tripId,
  })
  return documentId
}

describe('trip-timeline.query (spec 158 T5) contra o Postgres', () => {
  testWithPostgres(
    'aceite 3: entrega retroativa do escritório traz recordedAt; a do motorista não',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentId = await seedTripDocument(database, company, tripId, stopId)

        const occurredAtRetroactive = new Date('2026-09-16T13:00:00.000Z')
        const recordedAtRetroactive = new Date('2026-09-18T09:00:00.000Z')
        await database.db.insert(tripStopEvents).values({
          actorUserId: company.userId,
          channel: 'office',
          companyId: company.companyId,
          createdAt: occurredAtRetroactive,
          id: crypto.randomUUID(),
          kind: 'delivered',
          onBehalfOfDriverId: company.driverId,
          recordedAt: recordedAtRetroactive,
          stopId,
          tripDocumentId: documentId,
        })

        const driverStopId = await seedStop(database, company, tripId, 2)
        const driverDocumentId = await seedTripDocument(database, company, tripId, driverStopId)
        const driverNow = new Date('2026-09-18T10:00:00.000Z')
        await database.db.insert(tripStopEvents).values({
          actorUserId: company.userId,
          channel: 'driver_app',
          companyId: company.companyId,
          createdAt: driverNow,
          id: crypto.randomUUID(),
          kind: 'delivered',
          recordedAt: driverNow,
          stopId: driverStopId,
          tripDocumentId: driverDocumentId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        const office = result.items.find((item) => item.document?.id === documentId)
        const driver = result.items.find((item) => item.document?.id === driverDocumentId)

        expect(office?.kind).toBe('document.delivered')
        expect(office?.occurredAt).toBe(occurredAtRetroactive.toISOString())
        expect(office?.recordedAt).toBe(recordedAtRetroactive.toISOString())
        expect(office?.channel).toBe('office')
        expect(office?.onBehalfOfDriverName).toBe('Motorista Um')

        expect(driver?.recordedAt).toBeNull()
      })
    },
  )

  testWithPostgres(
    'D3/ADR-0068 §4: trip_document_events com driver_app (linha antiga) sai como channel null, sem recordedAt',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentId = await seedTripDocument(database, company, tripId, stopId)

        // Molda a migration da spec 156: `recorded_at` = hora da migration, bem depois do `occurred_at`.
        const occurredAt = new Date('2026-06-01T08:00:00.000Z')
        const migrationRecordedAt = new Date('2026-09-01T00:00:00.000Z')
        await database.db.insert(tripDocumentEvents).values({
          actorUserId: company.userId,
          channel: 'driver_app',
          companyId: company.companyId,
          fromStatus: 'loaded',
          id: crypto.randomUUID(),
          occurredAt,
          recordedAt: migrationRecordedAt,
          toStatus: 'delivered',
          tripDocumentId: documentId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        const item = result.items.find((entry) => entry.kind === 'document.status_changed')
        expect(item?.channel).toBeNull()
        expect(item?.recordedAt).toBeNull()
      })
    },
  )

  testWithPostgres(
    'aceite 4: backoffice pela tela antiga aparece sem selo de motorista (onBehalfOfDriverName null)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentId = await seedTripDocument(database, company, tripId, stopId)

        await database.db.insert(tripDocumentEvents).values({
          actorUserId: company.userId,
          channel: 'backoffice',
          companyId: company.companyId,
          fromStatus: 'pending',
          id: crypto.randomUUID(),
          toStatus: 'separated',
          tripDocumentId: documentId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        const item = result.items.find((entry) => entry.kind === 'document.status_changed')
        expect(item?.channel).toBe('backoffice')
        expect(item?.onBehalfOfDriverName).toBeNull()
      })
    },
  )

  testWithPostgres(
    'spec 171 CA02/CA04: trip.created é o item mais antigo, mesmo empatado no mesmo instante',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const bornAt = new Date('2026-09-18T08:00:00.000Z')

        await database.db.insert(tripStatusEvents).values({
          actorUserId: company.userId,
          channel: 'backoffice',
          companyId: company.companyId,
          eventKind: 'created',
          fromStatus: 'draft',
          id: crypto.randomUUID(),
          occurredAt: bornAt,
          toStatus: 'draft',
          tripId,
        })
        // Mesmo instante da criação: CA04 exige a criação abaixo (mais antiga) no desempate.
        await database.db.insert(tripStatusEvents).values({
          actorUserId: company.userId,
          channel: 'backoffice',
          companyId: company.companyId,
          fromStatus: 'draft',
          id: crypto.randomUUID(),
          occurredAt: bornAt,
          toStatus: 'route_planned',
          tripId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        expect(result.items.map((item) => item.kind)).toEqual([
          'trip.status_changed',
          'trip.created',
        ])
        const created = result.items[1]
        expect(created?.actorName).toBe('Usuária Escritório')
        expect(created?.channel).toBe('backoffice')
        expect(created?.fromStatus).toBeNull()
        expect(created?.toStatus).toBeNull()
      })
    },
  )

  testWithPostgres(
    'spec 171: o banco recusa transição degenerada — event_kind = transition exige from <> to',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)

        const insertDegenerateTransition = async () => {
          await database.db.insert(tripStatusEvents).values({
            actorUserId: company.userId,
            channel: 'backoffice',
            companyId: company.companyId,
            // eventKind ausente cai no default 'transition' — a mesma linha que hoje descreve o
            // nascimento (`created`) vira degenerada aqui, e o CHECK barra sem depender de nada na
            // aplicação.
            fromStatus: 'draft',
            id: crypto.randomUUID(),
            toStatus: 'draft',
            tripId,
          })
        }
        await expect(insertDegenerateTransition()).rejects.toThrow()
      })
    },
  )

  testWithPostgres(
    'spec 171 CA03: viagem sem o evento de criação não inventa trip.created',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        await database.db.insert(tripStatusEvents).values({
          actorUserId: company.userId,
          channel: 'backoffice',
          companyId: company.companyId,
          fromStatus: 'draft',
          id: crypto.randomUUID(),
          toStatus: 'route_planned',
          tripId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        expect(result.items.map((item) => item.kind)).toEqual(['trip.status_changed'])
      })
    },
  )

  testWithPostgres('aceite 5: viagem de outra empresa não vaza nenhum item', async () => {
    await withDisposableDatabase(async (database) => {
      const companyA = await seedCompany(database)
      const tripA = await seedTrip(database, companyA)
      await database.db.insert(tripStatusEvents).values({
        actorUserId: companyA.userId,
        channel: 'backoffice',
        companyId: companyA.companyId,
        fromStatus: 'route_planned',
        id: crypto.randomUUID(),
        toStatus: 'separating',
        tripId: tripA,
      })

      const companyB = await seedCompany(database)
      const tripB = await seedTrip(database, companyB)
      await database.db.insert(tripStatusEvents).values({
        actorUserId: companyB.userId,
        channel: 'backoffice',
        companyId: companyB.companyId,
        fromStatus: 'route_planned',
        id: crypto.randomUUID(),
        toStatus: 'separating',
        tripId: tripB,
      })

      const withinTenant = await listTripTimeline(database.db, {
        companyId: companyA.companyId,
        cursor: null,
        limit: 100,
        tripId: tripA,
      })
      expect(withinTenant.items).toHaveLength(1)

      // Mesmo id de viagem existindo na empresa B, pedir com companyId de A não devolve nada dela.
      const crossTenant = await listTripTimeline(database.db, {
        companyId: companyA.companyId,
        cursor: null,
        limit: 100,
        tripId: tripB,
      })
      expect(crossTenant.items).toHaveLength(0)
    })
  })

  testWithPostgres(
    'aceite 7: 250 eventos paginados em 100 não repetem nem pulam, com occurredAt empatado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)

        // 5 grupos de 50, cada grupo no mesmo instante — força o desempate por id dentro da fonte.
        const rows = Array.from({ length: 250 }, (_unused, index) => {
          const groupIndex = Math.floor(index / 50)
          const occurredAt = new Date(2026, 8, 10 + groupIndex, 8, 0, 0)
          return {
            actorUserId: company.userId,
            channel: 'driver_app' as const,
            companyId: company.companyId,
            createdAt: occurredAt,
            description: `ocorrência ${index}`,
            id: crypto.randomUUID(),
            kind: 'long_wait' as const,
            stopId,
          }
        })
        await database.db.insert(tripStopOccurrences).values(rows)

        const seen: string[] = []
        let cursor: ReadTripTimelineParams['cursor'] = null
        for (let page = 0; page < 3; page += 1) {
          const result = await listTripTimeline(database.db, {
            companyId: company.companyId,
            cursor,
            limit: 100,
            tripId,
          })
          seen.push(...result.items.map((item) => item.id))
          if (result.nextCursor === null) break
          const { parseTripTimelineCursor } = await import(
            '../../src/trips/infrastructure/trip-timeline.query.js'
          )
          cursor = parseTripTimelineCursor(result.nextCursor)
        }

        expect(seen).toHaveLength(250)
        expect(new Set(seen).size).toBe(250)
        expect(new Set(seen)).toEqual(new Set(rows.map((row) => row.id)))
      })
    },
  )

  testWithPostgres(
    'aceite 7: empate de occurredAt entre fontes diferentes pagina na mesma ordem da página única',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)

        // Cada instante tem um item de cada fonte: o cursor precisa atravessar a fronteira entre
        // kinds, não só entre ids do mesmo kind.
        const instants = Array.from(
          { length: 40 },
          (_unused, index) => new Date(2026, 8, 10, 8, index),
        )
        await database.db.insert(tripStopOccurrences).values(
          instants.map((occurredAt, index) => ({
            actorUserId: company.userId,
            channel: 'driver_app' as const,
            companyId: company.companyId,
            createdAt: occurredAt,
            description: `ocorrência ${index}`,
            id: crypto.randomUUID(),
            kind: 'long_wait' as const,
            stopId,
          })),
        )
        await database.db.insert(tripStatusEvents).values(
          instants.map((occurredAt) => ({
            actorUserId: company.userId,
            channel: 'backoffice' as const,
            companyId: company.companyId,
            fromStatus: 'route_planned' as const,
            id: crypto.randomUUID(),
            occurredAt,
            toStatus: 'separating' as const,
            tripId,
          })),
        )

        const singlePage = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 200,
          tripId,
        })
        const { parseTripTimelineCursor } = await import(
          '../../src/trips/infrastructure/trip-timeline.query.js'
        )
        const paged: string[] = []
        let cursor: ReadTripTimelineParams['cursor'] = null
        for (let page = 0; page < 10; page += 1) {
          const result = await listTripTimeline(database.db, {
            companyId: company.companyId,
            cursor,
            limit: 30,
            tripId,
          })
          paged.push(...result.items.map((item) => item.id))
          if (result.nextCursor === null) break
          cursor = parseTripTimelineCursor(result.nextCursor)
        }

        expect(singlePage.items).toHaveLength(80)
        expect(paged).toEqual(singlePage.items.map((item) => item.id))
        // D8: no mesmo instante, a troca de status (efeito) fica acima do que não a causou.
        expect(singlePage.items[0]?.kind).toBe('trip.status_changed')
      })
    },
  )

  testWithPostgres(
    'T9 item crítico: 150 trip_document_events no mesmo now() de banco não perdem os 50 da página 2',
    async () => {
      await withDisposableDatabase(async (database) => {
        // Defeito corrigido: `occurred_at` é `timestamptz` (microssegundos); o cursor saía de
        // `Date.toISOString()` (milissegundos) e a comparação `(occurred_at, ...) < cursor`
        // excluía, na página seguinte, toda linha com o mesmo instante do cursor mas
        // microssegundos maiores — exatamente 150 eventos gravados num único INSERT, todos com o
        // `now()` (defaultNow) da mesma transação implícita, real com microssegundos do relógio.
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentId = await seedTripDocument(database, company, tripId, stopId)

        const rows = Array.from({ length: 150 }, () => ({
          actorUserId: company.userId,
          channel: 'backoffice' as const,
          companyId: company.companyId,
          fromStatus: 'loaded' as const,
          id: crypto.randomUUID(),
          toStatus: 'delivered' as const,
          tripDocumentId: documentId,
        }))
        await database.db.insert(tripDocumentEvents).values(rows)

        const page1 = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })
        expect(page1.items).toHaveLength(100)
        expect(page1.nextCursor).not.toBeNull()

        const { parseTripTimelineCursor } = await import(
          '../../src/trips/infrastructure/trip-timeline.query.js'
        )
        const page2 = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: parseTripTimelineCursor(page1.nextCursor),
          limit: 100,
          tripId,
        })

        expect(page2.items).toHaveLength(50)
        expect(page2.nextCursor).toBeNull()
        const seen = new Set([...page1.items, ...page2.items].map((item) => item.id))
        expect(seen.size).toBe(150)
        expect(seen).toEqual(new Set(rows.map((row) => row.id)))
      })
    },
  )

  testWithPostgres(
    'T9 item crítico: troca de status e evento de nota gravados no mesmo now() não se perdem entre páginas',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentId = await seedTripDocument(database, company, tripId, stopId)

        const statusIds = Array.from({ length: 10 }, () => crypto.randomUUID())
        const documentEventIds = Array.from({ length: 10 }, () => crypto.randomUUID())
        // Uma única transação: os vinte eventos compartilham exatamente o mesmo `now()` de banco.
        await database.db.transaction(async (transaction) => {
          await transaction.insert(tripStatusEvents).values(
            statusIds.map((id) => ({
              actorUserId: company.userId,
              channel: 'backoffice' as const,
              companyId: company.companyId,
              fromStatus: 'route_planned' as const,
              id,
              toStatus: 'separating' as const,
              tripId,
            })),
          )
          await transaction.insert(tripDocumentEvents).values(
            documentEventIds.map((id) => ({
              actorUserId: company.userId,
              channel: 'backoffice' as const,
              companyId: company.companyId,
              fromStatus: 'loaded' as const,
              id,
              toStatus: 'delivered' as const,
              tripDocumentId: documentId,
            })),
          )
        })

        const seen: string[] = []
        const { parseTripTimelineCursor } = await import(
          '../../src/trips/infrastructure/trip-timeline.query.js'
        )
        let cursor: ReadTripTimelineParams['cursor'] = null
        for (let page = 0; page < 5; page += 1) {
          const result = await listTripTimeline(database.db, {
            companyId: company.companyId,
            cursor,
            limit: 8,
            tripId,
          })
          seen.push(...result.items.map((item) => item.id))
          if (result.nextCursor === null) break
          cursor = parseTripTimelineCursor(result.nextCursor)
        }

        expect(seen).toHaveLength(20)
        expect(new Set(seen)).toEqual(new Set([...statusIds, ...documentEventIds]))
      })
    },
  )

  testWithPostgres(
    'T9 item alto: empate de trip_stop_events (arrived/delivered/returned) atravessa página igual à página única',
    async () => {
      await withDisposableDatabase(async (database) => {
        // Item 2 (T9): o SQL das fontes ordenava a prioridade `asc`, o inverso do keyset/merge
        // (`desc`) — o `limit + 1` de cada fonte cortava os itens de menor prioridade no instante,
        // e uma página pequena que cruzasse o empate divergia da leitura em página única.
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentId = await seedTripDocument(database, company, tripId, stopId)

        const sameInstant = new Date('2026-09-18T09:00:00.000Z')
        await database.db.insert(tripStopEvents).values([
          {
            actorUserId: company.userId,
            channel: 'driver_app',
            companyId: company.companyId,
            createdAt: sameInstant,
            id: crypto.randomUUID(),
            kind: 'arrived',
            stopId,
          },
          {
            actorUserId: company.userId,
            channel: 'driver_app',
            companyId: company.companyId,
            createdAt: sameInstant,
            id: crypto.randomUUID(),
            kind: 'delivered',
            stopId,
            tripDocumentId: documentId,
          },
          {
            actorUserId: company.userId,
            channel: 'driver_app',
            companyId: company.companyId,
            createdAt: sameInstant,
            id: crypto.randomUUID(),
            kind: 'returned',
            stopId,
            tripDocumentId: documentId,
          },
        ])

        const singlePage = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        const { parseTripTimelineCursor } = await import(
          '../../src/trips/infrastructure/trip-timeline.query.js'
        )
        const paged: string[] = []
        let cursor: ReadTripTimelineParams['cursor'] = null
        for (let page = 0; page < 5; page += 1) {
          const result = await listTripTimeline(database.db, {
            companyId: company.companyId,
            cursor,
            limit: 1,
            tripId,
          })
          paged.push(...result.items.map((item) => item.id))
          if (result.nextCursor === null) break
          cursor = parseTripTimelineCursor(result.nextCursor)
        }

        expect(paged).toEqual(singlePage.items.map((item) => item.id))
        // D8: maior prioridade primeiro — `stop.arrived` (0) < `stop.occurrence`(1) <
        // `document.occurrence` < `document.returned` < `document.delivered`. Maior valor primeiro.
        expect(singlePage.items.map((item) => item.kind)).toEqual([
          'document.delivered',
          'document.returned',
          'stop.arrived',
        ])
      })
    },
  )

  testWithPostgres('aceite 8: nenhuma chave proibida sai na resposta', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const tripId = await seedTrip(database, company)
      const stopId = await seedStop(database, company, tripId, 1)
      const documentId = await seedTripDocument(database, company, tripId, stopId)

      await database.db.insert(tripStopEvents).values({
        accuracyMeters: '10.00',
        actorUserId: company.userId,
        channel: 'driver_app',
        companyId: company.companyId,
        id: crypto.randomUUID(),
        kind: 'arrived',
        latitude: '-23.5505000',
        longitude: '-46.6333000',
        stopId,
      })
      await database.db.insert(tripStopEvents).values({
        actorUserId: company.userId,
        channel: 'driver_app',
        companyId: company.companyId,
        id: crypto.randomUUID(),
        kind: 'delivered',
        stopId,
        tripDocumentId: documentId,
      })

      const result = await listTripTimeline(database.db, {
        companyId: company.companyId,
        cursor: null,
        limit: 100,
        tripId,
      })

      const serialized = JSON.stringify(result.items)
      for (const forbiddenKey of [
        'actorUserId',
        'receiverName',
        'receiverDocumentMasked',
        'latitude',
        'longitude',
        'objectKey',
      ]) {
        expect(serialized).not.toContain(forbiddenKey)
      }
    })
  })

  testWithPostgres(
    'RNF2: p95 da leitura com 50 notas e 200 eventos fica dentro de 300 ms',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)

        const documentIds: string[] = []
        for (let index = 0; index < 50; index += 1) {
          documentIds.push(await seedTripDocument(database, company, tripId, stopId))
        }

        const statusRows = Array.from({ length: 80 }, (_unused, index) => ({
          actorUserId: company.userId,
          channel: 'backoffice' as const,
          companyId: company.companyId,
          fromStatus: 'pending' as const,
          id: crypto.randomUUID(),
          toStatus: 'separated' as const,
          tripDocumentId: documentIds[index % documentIds.length]!,
        }))
        await database.db.insert(tripDocumentEvents).values(statusRows)

        const occurrenceType = crypto.randomUUID()
        await database.db.insert(companyOccurrenceTypes).values({
          companyId: company.companyId,
          id: occurrenceType,
          name: 'Item faltante',
          stage: 'separation',
        })
        const occurrenceRows = Array.from({ length: 120 }, (_unused, index) => ({
          actorUserId: company.userId,
          channel: 'driver_app' as const,
          companyId: company.companyId,
          id: crypto.randomUUID(),
          note: `ocorrência ${index}`,
          occurrenceTypeId: occurrenceType,
          stage: 'separation' as const,
          tripDocumentId: documentIds[index % documentIds.length]!,
        }))
        await database.db.insert(tripDocumentOccurrences).values(occurrenceRows)

        const durationsMs: number[] = []
        for (let iteration = 0; iteration < 20; iteration += 1) {
          const startedAt = performance.now()
          await listTripTimeline(database.db, {
            companyId: company.companyId,
            cursor: null,
            limit: 100,
            tripId,
          })
          durationsMs.push(performance.now() - startedAt)
        }

        const sorted = [...durationsMs].sort((first, second) => first - second)
        const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
        const p95 = sorted[p95Index]!

        console.log(`trip-timeline p95 (50 notas / 200 eventos, 20 amostras): ${p95.toFixed(2)}ms`)
        expect(p95).toBeLessThanOrEqual(300)
      })
    },
  )

  testWithPostgres(
    'T12: encerramento manual (completed) traz closeReason de trips.close_reason',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const closedAt = new Date('2026-09-19T12:00:00.000Z')
        await database.db
          .update(trips)
          .set({
            closeReason: 'Canhotos recebidos no escritório',
            closedAt,
            closedByUserId: company.userId,
          })
          .where(eq(trips.id, tripId))
        await database.db.insert(tripStatusEvents).values({
          actorUserId: company.userId,
          channel: 'backoffice',
          companyId: company.companyId,
          fromStatus: 'on_delivery_route',
          id: crypto.randomUUID(),
          occurredAt: closedAt,
          toStatus: 'completed',
          tripId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        const item = result.items.find((entry) => entry.kind === 'trip.status_changed')
        expect(item?.toStatus).toBe('completed')
        expect(item?.closeReason).toBe('Canhotos recebidos no escritório')
      })
    },
  )

  testWithPostgres(
    'T12: completed derivado (sem close_reason) sai com closeReason nulo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        // Sem `close_reason`: molda a viagem que chegou a `completed` pela derivação automática,
        // nunca pelo botão de encerrar (T12: as três colunas só existem no encerramento manual).
        await database.db.insert(tripStatusEvents).values({
          actorUserId: company.userId,
          channel: 'driver_app',
          companyId: company.companyId,
          fromStatus: 'on_delivery_route',
          id: crypto.randomUUID(),
          toStatus: 'completed',
          tripId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        const item = result.items.find((entry) => entry.kind === 'trip.status_changed')
        expect(item?.toStatus).toBe('completed')
        expect(item?.closeReason).toBeNull()
      })
    },
  )

  testWithPostgres(
    'T12: closeReason não vaza para trip.status_changed que não seja completed',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        // A viagem já guarda um `close_reason` de um encerramento anterior — não é do evento abaixo.
        await database.db
          .update(trips)
          .set({
            closeReason: 'Motivo de um encerramento anterior',
            closedAt: new Date('2026-09-10T12:00:00.000Z'),
            closedByUserId: company.userId,
          })
          .where(eq(trips.id, tripId))
        await database.db.insert(tripStatusEvents).values({
          actorUserId: company.userId,
          channel: 'backoffice',
          companyId: company.companyId,
          fromStatus: 'route_planned',
          id: crypto.randomUUID(),
          toStatus: 'separating',
          tripId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })

        const item = result.items.find((entry) => entry.kind === 'trip.status_changed')
        expect(item?.toStatus).toBe('separating')
        expect(item?.closeReason).toBeNull()
      })
    },
  )
})

function fakeContext(company: Company): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: company.companyId,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set(['fleet.read'] as never),
      roles: ['operator'],
      userId: company.userId,
    },
  }
}

function findTimelineRoute(database: TestDatabase) {
  const readTripTimeline = createReadTripTimelineUseCase({
    existence: { findTripCompanyScope: (input) => findTripCompanyScope(database.db, input) },
    reader: { listTripTimeline: (input) => listTripTimeline(database.db, input) },
  })
  const dependencies = new Proxy(
    { readTripTimeline },
    { get: (target, name) => (target as Record<string, unknown>)[String(name)] },
  )
  const routes = createTripRoutes(dependencies as never)
  const route = routes.find(
    (candidate) => candidate.method === 'GET' && candidate.pathname === '/trips/:id/timeline',
  )
  if (route === undefined) throw new Error('route missing')
  return route
}

/**
 * Spec 158 T6, contra o Postgres de verdade: a rota resolve a viagem da empresa do contexto antes
 * de ler qualquer fonte, no molde de `route.execute` de `trip-field-office.integration.ts`.
 */
describe('GET /trips/:id/timeline contra o Postgres (spec 158 T6)', () => {
  testWithPostgres('200 com itens reais da viagem', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const tripId = await seedTrip(database, company)
      await database.db.insert(tripStatusEvents).values({
        actorUserId: company.userId,
        channel: 'backoffice',
        companyId: company.companyId,
        fromStatus: 'route_planned',
        id: crypto.randomUUID(),
        toStatus: 'separating',
        tripId,
      })

      const route = findTimelineRoute(database)
      const response = await route.execute({
        context: fakeContext(company),
        correlationId: 'integration-timeline',
        pathParameters: { id: tripId },
        request: new Request(`http://localhost/trips/${tripId}/timeline`),
      })

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: { items: readonly { kind: string }[]; nextCursor: string | null }
      }
      expect(body.data.items).toHaveLength(1)
      expect(body.data.items[0]?.kind).toBe('trip.status_changed')
      expect(body.data.nextCursor).toBeNull()
    })
  })

  testWithPostgres('404 TRIP_NOT_FOUND para viagem de outra empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const companyA = await seedCompany(database)
      const companyB = await seedCompany(database)
      const tripOfCompanyB = await seedTrip(database, companyB)

      const route = findTimelineRoute(database)

      await expect(
        route.execute({
          context: fakeContext(companyA),
          correlationId: 'integration-timeline',
          pathParameters: { id: tripOfCompanyB },
          request: new Request(`http://localhost/trips/${tripOfCompanyB}/timeline`),
        }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND', status: 404 })
    })
  })
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_158_t5_${crypto.randomUUID().replaceAll('-', '')}`
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
