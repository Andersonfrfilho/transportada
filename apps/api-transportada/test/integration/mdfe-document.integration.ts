/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 065 D9 — o MDF-e que o motorista busca, contra Postgres de verdade. A consulta muda de forma
 * conforme quem pergunta (o motorista entra por uma junção a mais), e é justamente esse tipo de
 * consulta que passa com dublê e quebra em produção. O isolamento também se prova aqui: manifesto de
 * outra viagem tem de responder como inexistente.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fiscalSequenceReservations,
  fiscalSequences,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeManifests,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDrivers, trips } from '../../src/database/trip.schema.js'
import { createMdfeDocumentSource } from '../../src/mdfe-manifests/infrastructure/mdfe-document.query.js'
import { SYNTHETIC_MDFE_ACCESS_KEY } from '../fixtures/mdfe-xml.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type World = {
  readonly companyId: string
  readonly manifestId: string
  readonly ownDriverId: string
  readonly strangerDriverId: string
}

describe('o documento do MDF-e (spec 065 D9)', () => {
  testWithPostgres('entrega ao motorista da viagem, e a mais ninguém', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedManifest(database)
      const source = createMdfeDocumentSource(database.db)

      const own = await source.findAuthorizedDocument({
        companyId: world.companyId,
        driverId: world.ownDriverId,
        manifestId: world.manifestId,
      })
      expect(own.kind).toBe('authorized')
      expect(own.kind === 'authorized' ? own.document.accessKey : '').toBe(
        SYNTHETIC_MDFE_ACCESS_KEY,
      )
      expect(own.kind === 'authorized' ? own.document.objectKey : '').toBe('mdfe/authorized.xml')

      const stranger = await source.findAuthorizedDocument({
        companyId: world.companyId,
        driverId: world.strangerDriverId,
        manifestId: world.manifestId,
      })
      expect(stranger.kind).toBe('missing')

      // O escritório entra sem vínculo de escala — a permissão dele já foi checada na rota.
      const office = await source.findAuthorizedDocument({
        companyId: world.companyId,
        manifestId: world.manifestId,
      })
      expect(office.kind).toBe('authorized')
    })
  })

  testWithPostgres('manifesto de outra empresa é ausência, nunca recusa', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedManifest(database)
      const otherCompanyId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: otherCompanyId, status: 'active' })

      const lookup = await createMdfeDocumentSource(database.db).findAuthorizedDocument({
        companyId: otherCompanyId,
        manifestId: world.manifestId,
      })

      expect(lookup.kind).toBe('missing')
    })
  })

  /** Manifesto vivo sem documento autorizado é `not-authorized`: existe, e não há o que imprimir. */
  testWithPostgres('distingue o manifesto que ainda não voltou da SEFAZ', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedManifest(database, { authorized: false })

      const lookup = await createMdfeDocumentSource(database.db).findAuthorizedDocument({
        companyId: world.companyId,
        driverId: world.ownDriverId,
        manifestId: world.manifestId,
      })

      expect(lookup.kind).toBe('not-authorized')
    })
  })
})

async function seedManifest(
  database: TestDatabase,
  options: { readonly authorized?: boolean } = {},
): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const otherTripId = crypto.randomUUID()
  const manifestId = crypto.randomUUID()
  const ownDriverId = crypto.randomUUID()
  const strangerDriverId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values([
    { companyId, id: ownDriverId, name: 'Joao da Silva', taxId: '12345678901' },
    { companyId, id: strangerDriverId, name: 'Maria de Souza', taxId: '98765432100' },
  ])
  await database.db.insert(trips).values([
    { companyId, id: tripId, status: 'dispatched', vehicleId },
    { companyId, id: otherTripId, status: 'dispatched', vehicleId },
  ])
  await database.db.insert(tripDrivers).values([
    {
      companyId,
      driverId: ownDriverId,
      driverName: 'Joao da Silva',
      driverTaxId: '12345678901',
      position: 1n,
      tripId,
    },
    {
      companyId,
      driverId: strangerDriverId,
      driverName: 'Maria de Souza',
      driverTaxId: '98765432100',
      position: 1n,
      tripId: otherTripId,
    },
  ])
  /**
   * Série e número entram porque o banco exige (`mdfe_manifests_issued_state_check`): sem eles não
   * há como encerrar nem cancelar o manifesto depois. O manifesto que ainda não voltou da SEFAZ
   * fica em `issuing` — que é o estado real dele.
   */
  await database.db.insert(mdfeManifests).values({
    companyId,
    destinationState: 'SP',
    fiscalEnvironment: 'homologation',
    ...(options.authorized === false
      ? { status: 'issuing' as const }
      : { fiscalNumber: 1n, fiscalSeries: '1', status: 'authorized' as const }),
    id: manifestId,
    originState: 'SP',
    tripId,
    vehicleId,
  })

  if (options.authorized !== false) {
    await database.db.insert(storedObjects).values({
      bucket: 'integration',
      companyId,
      id: xmlObjectId,
      mimeType: 'application/xml',
      objectKey: 'mdfe/authorized.xml',
      provider: 's3',
      purpose: 'mdfe_document',
      sha256: 'a'.repeat(64),
      sizeBytes: 100n,
      status: 'final',
    })
    const attemptId = crypto.randomUUID()
    const fiscalSequenceId = crypto.randomUUID()
    const reservationId = crypto.randomUUID()
    // A emissão reserva número — o CHECK do banco não aceita tentativa de `issue` sem reserva.
    await database.db.insert(fiscalSequences).values({
      companyId,
      environment: 'homologation',
      id: fiscalSequenceId,
      lastReservedNumber: 1n,
      model: 'mdfe',
      nextNumber: 2n,
      series: 1n,
      version: 1n,
    })
    await database.db.insert(fiscalSequenceReservations).values({
      companyId,
      fiscalSequenceId,
      id: reservationId,
      number: 1n,
      reservationKey: 'reservation-mdfe-document',
    })
    await database.db.insert(mdfeIssuanceAttempts).values({
      attemptKind: 'issue',
      attemptNumber: 1n,
      companyId,
      correlationId: crypto.randomUUID(),
      fiscalEnvironment: 'homologation',
      fiscalNumber: 1n,
      fiscalSeries: '1',
      id: attemptId,
      idempotencyFingerprint: 'a'.repeat(64),
      idempotencyKey: crypto.randomUUID(),
      manifestId,
      requestFingerprint: 'a'.repeat(64),
      reservationId,
      status: 'authorized',
    })
    await database.db.insert(mdfeFiscalDocuments).values({
      accessKey: SYNTHETIC_MDFE_ACCESS_KEY,
      attemptId,
      authorizationProtocol: '135260000000099',
      authorizedAt: new Date('2026-08-26T12:16:10.000Z'),
      companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: 1n,
      fiscalSeries: '1',
      manifestId,
      status: 'authorized',
      xmlObjectId,
      xmlSha256: 'a'.repeat(64),
    })
  }

  return { companyId, manifestId, ownDriverId, strangerDriverId }
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_065_${crypto.randomUUID().replaceAll('-', '')}`
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
