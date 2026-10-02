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
import { eq, sql } from 'drizzle-orm'
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
  tripDeliveryProofs,
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
import { geocodedAddresses } from '../../src/database/geocoding.schema.js'
import {
  findTripCompanyScope,
  findTripDocumentScope,
  listTripTimeline,
  parseTripTimelineCursor,
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
        /** Spec 196 D2: coordenada e estado são a mesma afirmação, e o CHECK recusa uma sem a outra. */
        locationState: 'captured',
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
        'objectKey',
      ]) {
        expect(serialized).not.toContain(forbiddenKey)
      }
      // Emenda spec 196 T4.1: o ADR-0081 §6.1 revogou o veto à coordenada. Ela segue proibida como
      // chave solta no item — só existe dentro de `location`, com as cinco chaves do contrato do painel.
      for (const item of result.items) {
        expect(Object.keys(item)).not.toContain('latitude')
        expect(Object.keys(item)).not.toContain('longitude')
        expect(Object.keys(item)).not.toContain('accuracyMeters')
      }
      const located = result.items.find((item) => item.location !== null)
      expect(Object.keys(located?.location ?? {}).sort()).toEqual([
        'accuracyMeters',
        'capturedAt',
        'distanceMeters',
        'latitude',
        'longitude',
      ])
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
    existence: {
      findTripCompanyScope: (input) => findTripCompanyScope(database.db, input),
      findTripDocumentScope: (input) => findTripDocumentScope(database.db, input),
    },
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

/**
 * Spec 196 T4.2 (ADR-0081 §6): a coordenada e o estado do carimbo chegam à linha do tempo, contra o
 * Postgres de verdade. Só `trip_stop_events` carimba nesta fatia — as outras fontes respondem
 * `location: null` e `locationState: null` ("não se aplica"), e o teste prova exatamente isso.
 */
type LocatedTimelineItem = {
  readonly id: string
  readonly kind: string
  readonly location: {
    readonly accuracyMeters: number | null
    readonly capturedAt: string
    readonly distanceMeters: number | null
    readonly latitude: number
    readonly longitude: number
  } | null
  readonly locationState: string | null
}

function contextWithPermissions(
  company: Company,
  permissions: readonly string[],
): AuthenticatedContext<CompanyContext> {
  const context = fakeContext(company)
  return {
    ...context,
    scope: { ...context.scope, permissions: new Set(permissions) as never },
  }
}

async function requestLocatedTimeline(input: {
  readonly company: Company
  readonly database: TestDatabase
  readonly permissions: readonly string[]
  readonly tripId: string
}): Promise<readonly LocatedTimelineItem[]> {
  const response = await findTimelineRoute(input.database).execute({
    context: contextWithPermissions(input.company, input.permissions),
    correlationId: 'integration-event-location',
    pathParameters: { id: input.tripId },
    request: new Request(`http://localhost/trips/${input.tripId}/timeline`),
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { data: { items: readonly LocatedTimelineItem[] } }
  return body.data.items
}

describe('GET /trips/:id/timeline carrega onde o motorista tocou (spec 196 T4.2)', () => {
  testWithPostgres(
    'os quatro estados saem com o ponto, a distância derivada e o recorte por permissão',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const referencedStopId = await seedStop(database, company, tripId, 1)
        const unreferencedStopId = await seedStop(database, company, tripId, 2)
        await database.db.insert(geocodedAddresses).values({
          addressKey: `3550308|01001000|${referencedStopId}`,
          latitude: '-23.5505000',
          longitude: '-46.6333000',
          precision: 'rooftop',
          source: 'manual',
        })
        const eventBase = {
          actorUserId: company.userId,
          channel: 'driver_app' as const,
          companyId: company.companyId,
        }
        const capturedId = crypto.randomUUID()
        const capturedWithoutReferenceId = crypto.randomUUID()
        const unavailableId = crypto.randomUUID()
        const expiredId = crypto.randomUUID()
        const notApplicableId = crypto.randomUUID()
        await database.db.insert(tripStopEvents).values([
          {
            ...eventBase,
            accuracyMeters: '12.50',
            capturedAt: new Date('2026-10-01T10:00:00.000Z'),
            createdAt: new Date('2026-10-01T10:00:01.000Z'),
            id: capturedId,
            kind: 'arrived',
            latitude: '-23.5505000',
            locationState: 'captured',
            longitude: '-46.6334000',
            stopId: referencedStopId,
          },
          {
            ...eventBase,
            capturedAt: new Date('2026-10-01T11:00:00.000Z'),
            createdAt: new Date('2026-10-01T11:00:01.000Z'),
            id: capturedWithoutReferenceId,
            kind: 'arrived',
            latitude: '-23.5600000',
            locationState: 'captured',
            longitude: '-46.6400000',
            stopId: unreferencedStopId,
          },
          {
            ...eventBase,
            createdAt: new Date('2026-10-01T12:00:00.000Z'),
            id: unavailableId,
            kind: 'departed',
            locationState: 'unavailable',
            stopId: referencedStopId,
          },
          {
            ...eventBase,
            createdAt: new Date('2026-10-01T13:00:00.000Z'),
            id: expiredId,
            kind: 'departed',
            locationState: 'expired',
            stopId: unreferencedStopId,
          },
          {
            ...eventBase,
            channel: 'backoffice' as const,
            createdAt: new Date('2026-10-01T14:00:00.000Z'),
            id: notApplicableId,
            kind: 'arrived',
            stopId: referencedStopId,
          },
        ])
        await database.db.insert(tripStopOccurrences).values({
          actorUserId: company.userId,
          channel: 'driver_app',
          companyId: company.companyId,
          createdAt: new Date('2026-10-01T15:00:00.000Z'),
          description: 'sem carimbo',
          id: crypto.randomUUID(),
          kind: 'long_wait',
          stopId: referencedStopId,
        })
        await database.db.insert(tripStatusEvents).values({
          actorUserId: company.userId,
          channel: 'backoffice',
          companyId: company.companyId,
          fromStatus: 'route_planned',
          id: crypto.randomUUID(),
          occurredAt: new Date('2026-10-01T16:00:00.000Z'),
          toStatus: 'separating',
          tripId,
        })

        const operatorItems = await requestLocatedTimeline({
          company,
          database,
          permissions: ['fleet.read', 'trip.event-location'],
          tripId,
        })
        const byId = new Map(operatorItems.map((item) => [item.id, item]))

        expect(byId.get(capturedId)?.locationState).toBe('captured')
        expect(byId.get(capturedId)?.location).toMatchObject({
          accuracyMeters: 12.5,
          capturedAt: '2026-10-01T10:00:00.000Z',
          latitude: -23.5505,
          longitude: -46.6334,
        })
        expect(byId.get(capturedId)?.location?.distanceMeters).toBeGreaterThan(0)
        expect(byId.get(capturedId)?.location?.distanceMeters).toBeLessThan(200)
        expect(byId.get(capturedWithoutReferenceId)?.location?.distanceMeters).toBeNull()
        expect(byId.get(capturedWithoutReferenceId)?.location?.accuracyMeters).toBeNull()
        expect(byId.get(unavailableId)).toMatchObject({
          location: null,
          locationState: 'unavailable',
        })
        expect(byId.get(expiredId)).toMatchObject({ location: null, locationState: 'expired' })
        expect(byId.get(notApplicableId)).toMatchObject({ location: null, locationState: null })
        for (const item of operatorItems.filter((entry) =>
          ['stop.occurrence', 'trip.status_changed'].includes(entry.kind),
        )) {
          expect(item).toMatchObject({ location: null, locationState: null })
        }

        const officeItems = await requestLocatedTimeline({
          company,
          database,
          permissions: ['fleet.read'],
          tripId,
        })
        expect(officeItems.map((item) => item.location)).toEqual(officeItems.map(() => null))
        expect(officeItems.find((item) => item.id === capturedId)?.locationState).toBe('captured')
        expect(JSON.stringify(officeItems)).not.toContain('-23.5505')
      })
    },
  )

  testWithPostgres(
    '250 eventos com os quatro estados paginam em 100 sem pular nem repetir, estado preservado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const states = ['captured', 'unavailable', 'expired', null] as const

        const rows = Array.from({ length: 250 }, (_unused, index) => {
          const state = states[index % states.length] ?? null
          return {
            actorUserId: company.userId,
            channel: 'driver_app' as const,
            companyId: company.companyId,
            createdAt: new Date(Date.UTC(2026, 9, 1 + Math.floor(index / 50), 8, 0, 0)),
            id: crypto.randomUUID(),
            kind: 'arrived' as const,
            stopId,
            ...(state === 'captured' ? { latitude: '-23.5505000', longitude: '-46.6333000' } : {}),
            locationState: state,
          }
        })
        await database.db.insert(tripStopEvents).values(rows)
        const stateById = new Map<string, string | null>(
          rows.map((row) => [row.id, row.locationState]),
        )

        const seen: string[] = []
        let cursor: ReadTripTimelineParams['cursor'] = null
        for (let page = 0; page < 4; page += 1) {
          const result = await listTripTimeline(database.db, {
            companyId: company.companyId,
            cursor,
            limit: 100,
            tripId,
          })
          for (const item of result.items) {
            expect(item.locationState as string | null).toBe(stateById.get(item.id) ?? null)
            expect(item.location === null).toBe(item.locationState !== 'captured')
          }
          seen.push(...result.items.map((item) => item.id))
          if (result.nextCursor === null) break
          cursor = parseTripTimelineCursor(result.nextCursor)
        }

        expect(seen).toHaveLength(250)
        expect(new Set(seen)).toEqual(new Set(rows.map((row) => row.id)))
      })
    },
  )

  testWithPostgres('404 para viagem de outra empresa, mesmo com trip.event-location', async () => {
    await withDisposableDatabase(async (database) => {
      const companyA = await seedCompany(database)
      const companyB = await seedCompany(database)
      const tripOfCompanyB = await seedTrip(database, companyB)

      await expect(
        findTimelineRoute(database).execute({
          context: contextWithPermissions(companyA, ['fleet.read', 'trip.event-location']),
          correlationId: 'integration-event-location',
          pathParameters: { id: tripOfCompanyB },
          request: new Request(`http://localhost/trips/${tripOfCompanyB}/timeline`),
        }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND', status: 404 })
    })
  })
})

describe('trip-timeline.query com documentId (spec 227 T5.1) contra o Postgres', () => {
  type DocumentFilterSeed = {
    readonly company: Company
    readonly documentA: string
    readonly documentB: string
    readonly idsOfA: ReadonlySet<string>
    readonly idsOfB: ReadonlySet<string>
    readonly idsWithoutDocument: ReadonlySet<string>
    readonly stopId: string
    readonly tripId: string
  }

  async function seedDocumentFilterTrip(database: TestDatabase): Promise<DocumentFilterSeed> {
    const company = await seedCompany(database)
    const tripId = await seedTrip(database, company)
    const stopId = await seedStop(database, company, tripId, 1)
    const documentA = await seedTripDocument(database, company, tripId, stopId)
    const documentB = await seedTripDocument(database, company, tripId, stopId)
    const base = {
      actorUserId: company.userId,
      channel: 'driver_app' as const,
      companyId: company.companyId,
      stopId,
    }
    const arrivedId = crypto.randomUUID()
    const deliveredAId = crypto.randomUUID()
    const deliveredBId = crypto.randomUUID()
    await database.db.insert(tripStopEvents).values([
      {
        ...base,
        capturedAt: new Date('2026-10-01T10:00:00.000Z'),
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        id: arrivedId,
        kind: 'arrived',
        latitude: '-23.5505000',
        locationState: 'captured',
        longitude: '-46.6334000',
      },
      {
        ...base,
        capturedAt: new Date('2026-10-01T11:00:00.000Z'),
        createdAt: new Date('2026-10-01T11:00:00.000Z'),
        id: deliveredAId,
        kind: 'delivered',
        latitude: '-23.5505000',
        locationState: 'captured',
        longitude: '-46.6334000',
        tripDocumentId: documentA,
      },
      {
        ...base,
        capturedAt: new Date('2026-10-01T12:00:00.000Z'),
        createdAt: new Date('2026-10-01T12:00:00.000Z'),
        id: deliveredBId,
        kind: 'delivered',
        latitude: '-23.5505000',
        locationState: 'captured',
        longitude: '-46.6334000',
        tripDocumentId: documentB,
      },
    ])
    const statusAId = crypto.randomUUID()
    const statusBId = crypto.randomUUID()
    await database.db.insert(tripDocumentEvents).values([
      {
        actorUserId: company.userId,
        channel: 'backoffice',
        companyId: company.companyId,
        fromStatus: 'pending',
        id: statusAId,
        occurredAt: new Date('2026-10-01T09:00:00.000Z'),
        toStatus: 'separated',
        tripDocumentId: documentA,
      },
      {
        actorUserId: company.userId,
        channel: 'backoffice',
        companyId: company.companyId,
        fromStatus: 'pending',
        id: statusBId,
        occurredAt: new Date('2026-10-01T09:30:00.000Z'),
        toStatus: 'separated',
        tripDocumentId: documentB,
      },
    ])
    const occurrenceTypeId = crypto.randomUUID()
    await database.db.insert(companyOccurrenceTypes).values({
      companyId: company.companyId,
      id: occurrenceTypeId,
      name: 'Item faltante',
      stage: 'separation',
    })
    const occurrenceAId = crypto.randomUUID()
    const occurrenceBId = crypto.randomUUID()
    await database.db.insert(tripDocumentOccurrences).values(
      [
        { documentId: documentA, id: occurrenceAId },
        { documentId: documentB, id: occurrenceBId },
      ].map((row) => ({
        actorUserId: company.userId,
        channel: 'driver_app' as const,
        companyId: company.companyId,
        id: row.id,
        note: 'ocorrência da nota',
        occurrenceTypeId,
        stage: 'separation' as const,
        tripDocumentId: row.documentId,
      })),
    )
    const stopOccurrenceId = crypto.randomUUID()
    await database.db.insert(tripStopOccurrences).values({
      actorUserId: company.userId,
      channel: 'driver_app',
      companyId: company.companyId,
      createdAt: new Date('2026-10-01T13:00:00.000Z'),
      description: 'sem nota',
      id: stopOccurrenceId,
      kind: 'long_wait',
      stopId,
    })
    const tripStatusId = crypto.randomUUID()
    await database.db.insert(tripStatusEvents).values({
      actorUserId: company.userId,
      channel: 'backoffice',
      companyId: company.companyId,
      fromStatus: 'route_planned',
      id: tripStatusId,
      toStatus: 'separating',
      tripId,
    })

    return {
      company,
      documentA,
      documentB,
      idsOfA: new Set([deliveredAId, statusAId, occurrenceAId]),
      idsOfB: new Set([deliveredBId, statusBId, occurrenceBId]),
      idsWithoutDocument: new Set([arrivedId, stopOccurrenceId, tripStatusId]),
      stopId,
      tripId,
    }
  }

  testWithPostgres('a nota A traz os eventos dela e os sem nota; nada da nota B', async () => {
    await withDisposableDatabase(async (database) => {
      const seed = await seedDocumentFilterTrip(database)

      const result = await listTripTimeline(database.db, {
        companyId: seed.company.companyId,
        cursor: null,
        documentId: seed.documentA,
        documentStopId: seed.stopId,
        limit: 100,
        tripId: seed.tripId,
      })

      expect(new Set(result.items.map((item) => item.id))).toEqual(
        new Set([...seed.idsOfA, ...seed.idsWithoutDocument]),
      )
      for (const item of result.items) {
        expect(item.document === null || item.document.id === seed.documentA).toBe(true)
      }
    })
  })

  testWithPostgres(
    'revisão A1: eventos e ocorrências de OUTRA parada não entram na nota; nota sem parada não traz nenhum',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedDocumentFilterTrip(database)
        const otherStopId = await seedStop(database, seed.company, seed.tripId, 2)
        const otherStopDocument = await seedTripDocument(
          database,
          seed.company,
          seed.tripId,
          otherStopId,
        )
        const departedAtThisStopId = crypto.randomUUID()
        const departedOtherStopId = crypto.randomUUID()
        const occurrenceOtherStopId = crypto.randomUUID()
        const base = {
          actorUserId: seed.company.userId,
          channel: 'driver_app' as const,
          companyId: seed.company.companyId,
        }
        await database.db.insert(tripStopEvents).values([
          {
            ...base,
            createdAt: new Date('2026-10-01T14:00:00.000Z'),
            id: departedAtThisStopId,
            kind: 'departed',
            stopId: seed.stopId,
          },
          {
            ...base,
            createdAt: new Date('2026-10-01T15:00:00.000Z'),
            id: departedOtherStopId,
            kind: 'departed',
            stopId: otherStopId,
          },
        ])
        await database.db.insert(tripStopOccurrences).values({
          ...base,
          createdAt: new Date('2026-10-01T15:30:00.000Z'),
          description: 'de outra parada',
          id: occurrenceOtherStopId,
          kind: 'long_wait',
          stopId: otherStopId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: seed.company.companyId,
          cursor: null,
          documentId: seed.documentA,
          documentStopId: seed.stopId,
          limit: 100,
          tripId: seed.tripId,
        })
        const ids = new Set(result.items.map((item) => item.id))
        expect(ids.has(departedAtThisStopId)).toBe(true)
        expect(ids.has(departedOtherStopId)).toBe(false)
        expect(ids.has(occurrenceOtherStopId)).toBe(false)

        const withoutStop = await listTripTimeline(database.db, {
          companyId: seed.company.companyId,
          cursor: null,
          documentId: otherStopDocument,
          documentStopId: null,
          limit: 100,
          tripId: seed.tripId,
        })
        expect(withoutStop.items.filter((item) => item.stop !== null)).toEqual([])
      })
    },
  )

  testWithPostgres('sem o filtro a linha do tempo segue completa', async () => {
    await withDisposableDatabase(async (database) => {
      const seed = await seedDocumentFilterTrip(database)

      const result = await listTripTimeline(database.db, {
        companyId: seed.company.companyId,
        cursor: null,
        limit: 100,
        tripId: seed.tripId,
      })

      expect(new Set(result.items.map((item) => item.id))).toEqual(
        new Set([...seed.idsOfA, ...seed.idsOfB, ...seed.idsWithoutDocument]),
      )
    })
  })

  testWithPostgres('o cursor com o filtro não repete nem pula, em páginas de 2', async () => {
    await withDisposableDatabase(async (database) => {
      const seed = await seedDocumentFilterTrip(database)
      const expected = new Set([...seed.idsOfB, ...seed.idsWithoutDocument])

      const seen: string[] = []
      let cursor: ReadTripTimelineParams['cursor'] = null
      for (let page = 0; page < 10; page += 1) {
        const result = await listTripTimeline(database.db, {
          companyId: seed.company.companyId,
          cursor,
          documentId: seed.documentB,
          documentStopId: seed.stopId,
          limit: 2,
          tripId: seed.tripId,
        })
        seen.push(...result.items.map((item) => item.id))
        if (result.nextCursor === null) break
        cursor = parseTripTimelineCursor(result.nextCursor)
      }

      expect(seen).toHaveLength(expected.size)
      expect(new Set(seen)).toEqual(expected)
    })
  })

  testWithPostgres(
    'nota de outra empresa ou de outra viagem: 404 TRIP_DOCUMENT_NOT_FOUND pela rota',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedDocumentFilterTrip(database)
        const otherCompany = await seedCompany(database)
        const otherTrip = await seedTrip(database, otherCompany)
        const otherStop = await seedStop(database, otherCompany, otherTrip, 1)
        const foreignDocument = await seedTripDocument(database, otherCompany, otherTrip, otherStop)
        const sameCompanyOtherTrip = await seedTrip(database, seed.company)
        const sameCompanyOtherStop = await seedStop(database, seed.company, sameCompanyOtherTrip, 1)
        const documentOfOtherTrip = await seedTripDocument(
          database,
          seed.company,
          sameCompanyOtherTrip,
          sameCompanyOtherStop,
        )

        for (const documentId of [foreignDocument, documentOfOtherTrip, crypto.randomUUID()]) {
          await expect(
            findTimelineRoute(database).execute({
              context: contextWithPermissions(seed.company, ['fleet.read']),
              correlationId: 'integration-document-filter',
              pathParameters: { id: seed.tripId },
              request: new Request(
                `http://localhost/trips/${seed.tripId}/timeline?documentId=${documentId}`,
              ),
            }),
          ).rejects.toMatchObject({ code: 'TRIP_DOCUMENT_NOT_FOUND', status: 404 })
        }
      })
    },
  )

  testWithPostgres(
    'a posição do filtro obedece trip.event-location: sem a permissão sai nula, com ela sai',
    async () => {
      await withDisposableDatabase(async (database) => {
        const seed = await seedDocumentFilterTrip(database)
        const query = `?documentId=${seed.documentA}`

        async function readLocations(permissions: readonly string[]): Promise<(object | null)[]> {
          const response = await findTimelineRoute(database).execute({
            context: contextWithPermissions(seed.company, permissions),
            correlationId: 'integration-document-filter-location',
            pathParameters: { id: seed.tripId },
            request: new Request(`http://localhost/trips/${seed.tripId}/timeline${query}`),
          })
          const body = (await response.json()) as {
            data: { items: Array<{ location: object | null; locationState: string | null }> }
          }
          return body.data.items
            .filter((item) => item.locationState === 'captured')
            .map((item) => item.location)
        }

        const withoutPermission = await readLocations(['fleet.read'])
        const withPermission = await readLocations(['fleet.read', 'trip.event-location'])

        expect(withoutPermission).toHaveLength(2)
        expect(withoutPermission.every((location) => location === null)).toBe(true)
        expect(withPermission).toHaveLength(2)
        expect(withPermission.every((location) => location !== null)).toBe(true)
      })
    },
  )
})

describe('trip-timeline.query com a foto do canhoto (spec 228 T2.1) contra o Postgres', () => {
  type ProofOverrides = Partial<typeof tripDeliveryProofs.$inferInsert>

  type SeededDelivery = {
    readonly documentId: string
    readonly eventId: string
    readonly objectId: string
    readonly proofId: string
  }

  async function seedDeliveryWithProof(
    database: TestDatabase,
    input: {
      readonly company: Company
      readonly documentId: string
      readonly eventCreatedAt: Date
      readonly proof: ProofOverrides
      readonly stopId: string
    },
  ): Promise<SeededDelivery> {
    const eventId = crypto.randomUUID()
    const objectId = crypto.randomUUID()
    const proofId = crypto.randomUUID()
    await database.db.insert(tripStopEvents).values({
      actorUserId: input.company.userId,
      channel: 'driver_app',
      companyId: input.company.companyId,
      createdAt: input.eventCreatedAt,
      id: eventId,
      kind: 'delivered',
      stopId: input.stopId,
      tripDocumentId: input.documentId,
    })
    await database.db.insert(storedObjects).values({
      bucket: 'integration',
      companyId: input.company.companyId,
      id: objectId,
      mimeType: 'image/jpeg',
      objectKey: `proof/${objectId}`,
      provider: 's3',
      purpose: 'delivery_proof',
      sha256: 'a'.repeat(64),
      sizeBytes: 10n,
      status: 'final',
    })
    await database.db.insert(tripDeliveryProofs).values({
      actorUserId: input.company.userId,
      companyId: input.company.companyId,
      id: proofId,
      kind: 'photo',
      objectId,
      stopEventId: eventId,
      ...input.proof,
    })
    return { documentId: input.documentId, eventId, objectId, proofId }
  }

  async function forceProofCreatedAt(
    database: TestDatabase,
    proofId: string,
    instant: string,
  ): Promise<void> {
    await database.db.execute(
      sql`update trip_delivery_proofs set created_at = ${instant}::timestamptz where id = ${proofId}`,
    )
  }

  async function readAllPages(
    database: TestDatabase,
    base: { readonly companyId: string; readonly tripId: string },
    limit: number,
  ): Promise<readonly { readonly id: string; readonly kind: string }[]> {
    const collected: { readonly id: string; readonly kind: string }[] = []
    let cursor: ReadTripTimelineParams['cursor'] = null
    for (let page = 0; page < 20; page += 1) {
      const result = await listTripTimeline(database.db, { ...base, cursor, limit })
      collected.push(...result.items.map((item) => ({ id: item.id, kind: item.kind })))
      if (result.nextCursor === null) break
      cursor = parseTripTimelineCursor(result.nextCursor)
    }
    return collected
  }

  testWithPostgres(
    'CA01: duas notas na mesma parada — ?documentId=A traz só a foto de A; nota sem parada não traz foto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentA = await seedTripDocument(database, company, tripId, stopId)
        const documentB = await seedTripDocument(database, company, tripId, stopId)
        const proofA = await seedDeliveryWithProof(database, {
          company,
          documentId: documentA,
          eventCreatedAt: new Date('2026-10-01T10:00:00.000Z'),
          proof: { capturedAt: new Date('2026-10-01T09:59:00.000Z') },
          stopId,
        })
        await seedDeliveryWithProof(database, {
          company,
          documentId: documentB,
          eventCreatedAt: new Date('2026-10-01T11:00:00.000Z'),
          proof: { capturedAt: new Date('2026-10-01T10:59:00.000Z') },
          stopId,
        })

        const filtered = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          documentId: documentA,
          documentStopId: stopId,
          limit: 100,
          tripId,
        })
        const photos = filtered.items.filter((item) => item.kind === 'document.canhoto_photo')
        expect(photos.map((item) => item.id)).toEqual([proofA.proofId])
        expect(photos[0]?.document?.id).toBe(documentA)
        expect(photos[0]?.document?.number).not.toBeNull()
        expect(photos[0]?.stop?.sequence).toBe(1)

        const whole = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })
        expect(whole.items.filter((item) => item.kind === 'document.canhoto_photo')).toHaveLength(2)

        const withoutStop = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          documentId: documentA,
          documentStopId: null,
          limit: 100,
          tripId,
        })
        expect(withoutStop.items.filter((item) => item.kind === 'document.canhoto_photo')).toEqual(
          [],
        )
      })
    },
  )

  testWithPostgres(
    'CA02: foto unavailable, sem estado (antiga) e expired aparecem sem ponto; a captada leva o ponto e a distância',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        await database.db.insert(geocodedAddresses).values({
          addressKey: `3550308|01001000|${stopId}`,
          latitude: '-23.5505000',
          longitude: '-46.6333000',
          precision: 'rooftop',
          source: 'manual',
        })
        const variants: readonly ProofOverrides[] = [
          { locationState: 'unavailable' },
          {},
          {
            capturedAt: new Date('2026-10-01T10:00:00.000Z'),
            locationState: 'expired',
          },
          {
            accuracyMeters: '12.50',
            capturedAt: new Date('2026-10-01T10:00:00.000Z'),
            latitude: '-23.5505000',
            locationState: 'captured',
            longitude: '-46.6334000',
          },
        ]
        const proofIds: string[] = []
        for (const [index, proof] of variants.entries()) {
          const documentId = await seedTripDocument(database, company, tripId, stopId)
          const seeded = await seedDeliveryWithProof(database, {
            company,
            documentId,
            eventCreatedAt: new Date(`2026-10-01T1${index}:00:00.000Z`),
            proof,
            stopId,
          })
          proofIds.push(seeded.proofId)
        }

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })
        const byId = new Map(result.items.map((item) => [item.id, item]))
        const [unavailable, legacy, expired, captured] = proofIds.map((id) => byId.get(id))

        expect(unavailable?.location).toBeNull()
        expect(unavailable?.locationState).toBe('unavailable')
        expect(legacy?.location).toBeNull()
        expect(legacy?.locationState).toBeNull()
        expect(expired?.location).toBeNull()
        expect(expired?.locationState).toBe('expired')
        expect(expired?.occurredAt).toBe('2026-10-01T10:00:00.000Z')
        expect(captured?.locationState).toBe('captured')
        expect(captured?.location?.latitude).toBe(-23.5505)
        expect(captured?.location?.accuracyMeters).toBe(12.5)
        expect(captured?.location?.distanceMeters).toBe(10)
      })
    },
  )

  testWithPostgres(
    'RF4: foto e baixa com created_at idêntico e captured_at nulo, em páginas de 1, saem uma vez e a baixa vem antes',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const instant = '2026-10-01T10:00:00.123456Z'
        const expectedIds: string[] = []
        for (let index = 0; index < 3; index += 1) {
          const documentId = await seedTripDocument(database, company, tripId, stopId)
          const seeded = await seedDeliveryWithProof(database, {
            company,
            documentId,
            eventCreatedAt: new Date('2026-10-01T10:00:00.123Z'),
            proof: {},
            stopId,
          })
          await database.db.execute(
            sql`update trip_stop_events set created_at = ${instant}::timestamptz where id = ${seeded.eventId}`,
          )
          await forceProofCreatedAt(database, seeded.proofId, instant)
          expectedIds.push(seeded.eventId, seeded.proofId)
        }

        const paged = await readAllPages(database, { companyId: company.companyId, tripId }, 1)

        expect(paged).toHaveLength(6)
        expect(new Set(paged.map((item) => item.id))).toEqual(new Set(expectedIds))
        const kinds = paged.map((item) => item.kind)
        const lastDelivered = kinds.lastIndexOf('document.delivered')
        const firstPhoto = kinds.indexOf('document.canhoto_photo')
        expect(lastDelivered).toBeLessThan(firstPhoto)
        const single = await readAllPages(database, { companyId: company.companyId, tripId }, 100)
        expect(paged.map((item) => item.id)).toEqual(single.map((item) => item.id))
      })
    },
  )

  testWithPostgres(
    'RF4: fotos que diferem só no microssegundo (.123456 x .123457) saem uma vez e em ordem estável',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const proofIds: string[] = []
        for (const microsecond of ['123456', '123457']) {
          const documentId = await seedTripDocument(database, company, tripId, stopId)
          const seeded = await seedDeliveryWithProof(database, {
            company,
            documentId,
            eventCreatedAt: new Date('2026-10-01T09:00:00.000Z'),
            proof: {},
            stopId,
          })
          await forceProofCreatedAt(database, seeded.proofId, `2026-10-01T10:00:00.${microsecond}Z`)
          proofIds.push(seeded.proofId)
        }

        const paged = await readAllPages(database, { companyId: company.companyId, tripId }, 1)
        const photos = paged.filter((item) => item.kind === 'document.canhoto_photo')

        expect(photos.map((item) => item.id)).toEqual([proofIds[1], proofIds[0]])
      })
    },
  )

  testWithPostgres(
    'foto de outra empresa, ou de outra viagem da mesma empresa, não entra na linha do tempo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const otherCompany = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const otherTripId = await seedTrip(database, company)
        const foreignTripId = await seedTrip(database, otherCompany)
        for (const [owner, ownerTripId] of [
          [company, otherTripId],
          [otherCompany, foreignTripId],
        ] as const) {
          const stopId = await seedStop(database, owner, ownerTripId, 1)
          const documentId = await seedTripDocument(database, owner, ownerTripId, stopId)
          await seedDeliveryWithProof(database, {
            company: owner,
            documentId,
            eventCreatedAt: new Date('2026-10-01T10:00:00.000Z'),
            proof: {},
            stopId,
          })
        }

        const own = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })
        const crossCompany = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId: foreignTripId,
        })

        expect(own.items.filter((item) => item.kind === 'document.canhoto_photo')).toEqual([])
        expect(crossCompany.items).toEqual([])
      })
    },
  )

  testWithPostgres(
    'CA06: o corpo da foto não carrega nome de quem recebeu, parentesco, objeto nem leitura do canhoto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const tripId = await seedTrip(database, company)
        const stopId = await seedStop(database, company, tripId, 1)
        const documentId = await seedTripDocument(database, company, tripId, stopId)
        const seeded = await seedDeliveryWithProof(database, {
          company,
          documentId,
          eventCreatedAt: new Date('2026-10-01T10:00:00.000Z'),
          proof: {
            canhotoReadNumber: '777777777',
            canhotoReadSeries: '99',
            latitude: '-23.5505000',
            locationState: 'captured',
            longitude: '-46.6334000',
            receivedBy: 'neighbor',
            receivedByDetail: 'casa doze do beco',
            receiverName: 'Fulano Recebedor Sigiloso',
          },
          stopId,
        })

        const result = await listTripTimeline(database.db, {
          companyId: company.companyId,
          cursor: null,
          limit: 100,
          tripId,
        })
        const body = JSON.stringify(result)

        expect(body).toContain(seeded.proofId)
        for (const forbidden of [
          'Fulano Recebedor Sigiloso',
          'casa doze do beco',
          'neighbor',
          'receiverName',
          'receivedBy',
          seeded.objectId,
          'objectId',
          'thumbnailObjectId',
          'canhotoRead',
          '777777777',
        ]) {
          expect(body).not.toContain(forbidden)
        }
      })
    },
  )
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
