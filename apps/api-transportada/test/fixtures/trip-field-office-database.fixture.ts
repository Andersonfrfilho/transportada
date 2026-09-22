/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156: o molde das integrações do escritório contra o Postgres — banco descartável, empresa com
 * dois motoristas, viagem `in_transit` com uma parada e uma nota, e as rotas montadas como em
 * `main.ts`. Compartilhado por `trip-field-office.integration.ts` e pelas revisões da T15.
 */
import { SQL } from 'bun'
import { test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  companyOccurrenceTypes,
  trips,
  tripDispatchSnapshots,
  tripDocuments,
  tripDrivers,
  tripStops,
} from '../../src/database/trip.schema.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import type { RemovableObjectStoragePort } from '../../src/trips/application/stored-object-cleanup.service.js'
import { reportFieldProof } from '../../src/trips/application/report-field-proof.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { startFieldTrip } from '../../src/trips/application/start-field-trip.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { createTripFieldOfficeRoutes } from '../../src/trips/presentation/trip-field-office.routes.js'
import { registerOfficeDocumentOccurrences } from '../../src/trips/application/register-office-document-occurrences.use-case.js'
import { readOccurrenceLabelsForDocuments } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleOfficeOccurrenceBatchUnitOfWork } from '../../src/trips/infrastructure/drizzle-office-occurrence-batch.repository.js'
import { createOccurrenceNotifier } from '../../src/trips/infrastructure/occurrence-notifier.gateway.js'
import { createTripFieldOfficeOccurrenceRoutes } from '../../src/trips/presentation/trip-field-office-occurrence.routes.js'

/** As rotas do escritório nunca colhem assinatura (D8) — o comprovante do canhoto é sempre `photo`. */
export const FAKE_ENVELOPE = { ciphertext: 'x', iv: 'y', keyId: 'test', tag: 'z' } as never

/** Um JPEG mínimo: a assinatura de bytes `FF D8 FF` que as rotas do escritório conferem (T15 seg B2). */
export const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
])

export const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
export const testWithPostgres = databaseUrl === undefined ? test.skip : test

export type TestDatabase = ReturnType<typeof createDrizzleProvider>

export type Company = {
  readonly companyId: string
  readonly firstDriverId: string
  readonly secondDriverId: string
  readonly userId: string
  readonly vehicleId: string
}

export type SeededTrip = {
  readonly documentId: string
  readonly stopId: string
  readonly tripId: string
}

export function fakeContext(company: Company): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: company.companyId,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set(['trip.report-on-behalf'] as never),
      roles: ['operator'],
      userId: company.userId,
    },
  }
}

export function jsonRequest(input: {
  readonly body?: object
  readonly idempotencyKey?: string
}): Request {
  const headers: Record<string, string> = {}
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  return new Request('http://localhost/trips/x', {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers,
    method: 'POST',
  })
}

/**
 * Spec 156 T6/T7b: `field-delivery`/`field-proof`/`field-occurrences` são multipart — sem `file`, a
 * foto é "não veio". Um valor em array (`documentIds` do lote) vira campos repetidos.
 */
export function multipartRequest(input: {
  readonly fields: Record<string, readonly string[] | string>
  readonly file?: { readonly bytes: Uint8Array; readonly mimeType: string }
  readonly idempotencyKey?: string
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item)
    } else {
      form.set(key, value as string)
    }
  }
  if (input.file !== undefined) {
    form.set('file', new File([input.file.bytes], 'canhoto.jpg', { type: input.file.mimeType }))
  }
  const headers: Record<string, string> = {}
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  return new Request('http://localhost/trips/x', { body: form, headers, method: 'POST' })
}

/**
 * Spec 156 T7b: dublê de armazenamento, no molde do `storage` de `wireRoutes` — o MinIO local não
 * é exercitado aqui, e um `sha256` fabricado basta: a impressão do lote (aceite "outro conteúdo")
 * usa o hash dos bytes recebidos, calculado no caso de uso, não o que o dublê devolve.
 */
export function fakeAttachmentStorage(
  uploads: { objectId: string; objectKey: string }[],
): RemovableObjectStoragePort {
  let counter = 0
  return {
    async remove() {},
    async store(input) {
      uploads.push({ objectId: input.objectId, objectKey: input.objectKey })
      counter += 1
      return { sha256: `${counter}`.padStart(64, '0') }
    },
  }
}

export function wireOccurrenceRoute(
  database: TestDatabase,
  options: {
    readonly logger?: { warn(event: string, meta?: Record<string, unknown>): void }
  } = {},
) {
  const logger = options.logger ?? { warn() {} }
  const sent: { dedupeKey: string; recipientUserId: string }[] = []
  const uploads: { objectId: string; objectKey: string }[] = []
  const routes = createTripFieldOfficeOccurrenceRoutes({
    listFieldOccurrenceTypes: async () => [],
    registerOccurrences: (input) =>
      registerOfficeDocumentOccurrences({
        ...input,
        attachment: {
          newObjectId: () => crypto.randomUUID(),
          storage: fakeAttachmentStorage(uploads),
          upload: input.attachment,
        },
        notifications: {
          notifier: createOccurrenceNotifier({
            logger,
            queryable: database.db,
            send: async (notice) => void sent.push(notice),
          }),
          logger,
          readLabels: (query) => readOccurrenceLabelsForDocuments(database.db, query),
        },
        unitOfWork: new DrizzleOfficeOccurrenceBatchUnitOfWork(database.db),
      }),
    targets: new DrizzleFieldTripTargetRepository(database.db),
  })
  const route = routes.find((candidate) => candidate.method === 'POST')
  if (route === undefined) throw new Error('route missing')
  return { route, sent, uploads }
}

export async function seedDeliveryOccurrenceType(
  database: TestDatabase,
  company: Company,
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name: 'Cliente ausente',
    notifies: true,
    stage: 'delivery',
  })
  return id
}

/** Dublê do bucket: conta o que subiu e o que a limpeza de órfãos apagou (spec 156 T15). */
export function fakeProofStorage(): RemovableObjectStoragePort & {
  readonly removed: string[]
  readonly stored: string[]
} {
  const stored: string[] = []
  const removed: string[] = []
  return {
    async remove(input) {
      removed.push(input.objectKey)
    },
    removed,
    async store(input) {
      stored.push(input.objectKey)
      return { sha256: `${stored.length}`.padStart(64, '0') }
    },
    stored,
  }
}

export function wireRoutes(
  database: TestDatabase,
  options: { readonly storage?: RemovableObjectStoragePort } = {},
) {
  const targets = new DrizzleFieldTripTargetRepository(database.db)
  const currentDriverTrips = new DrizzleCurrentDriverTripRepository(database.db)
  const driverFieldReports = new DrizzleDriverFieldReportUnitOfWork(database.db)
  const deliveryProofs = new DrizzleDeliveryProofRepository(database.db)
  const attachment = {
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    resolveSettings: (settings: { readonly companyId: string; readonly documentId: string }) =>
      deliveryProofs.resolveProofFieldSettings(settings),
    sealDocument: async () => FAKE_ENVELOPE,
    storage: options.storage ?? fakeProofStorage(),
  }

  return createTripFieldOfficeRoutes({
    attachProof: (input) =>
      reportFieldProof({
        actorUserId: input.actorUserId,
        attachment,
        companyId: input.companyId,
        documentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        officeAudit: input.officeAudit,
        target: input.target,
        unitOfWork: driverFieldReports,
        upload: input.proof,
      }),
    reportArrival: (input) =>
      reportStopArrival({
        ...input,
        location: null,
        now: input.arrivedAt,
        recordedAt: new Date(),
        unitOfWork: driverFieldReports,
      }),
    reportDelivery: (input) =>
      reportDocumentDelivery({
        ...input,
        location: null,
        now: input.deliveredAt,
        proof: { ...attachment, upload: input.proof },
        recordedAt: new Date('2026-09-18T13:00:00.000Z'),
        unitOfWork: driverFieldReports,
      }),
    reportOccurrence: (input) =>
      reportStopOccurrence({ ...input, attachmentObjectId: null, unitOfWork: driverFieldReports }),
    reportReturn: (input) =>
      reportDocumentReturn({
        ...input,
        location: null,
        now: input.returnedAt,
        recordedAt: new Date('2026-09-18T13:00:00.000Z'),
        unitOfWork: driverFieldReports,
      }),
    startFieldTrip: (input) => startFieldTrip({ ...input, repository: currentDriverTrips }),
    targets,
  })
}

export async function seedCompany(database: TestDatabase): Promise<Company> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const firstDriverId = crypto.randomUUID()
  const secondDriverId = crypto.randomUUID()

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
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
  await database.db.insert(fleetDrivers).values([
    { companyId, id: firstDriverId, name: 'Motorista Um', taxId: '11122233344' },
    { companyId, id: secondDriverId, name: 'Motorista Dois', taxId: '22233344455' },
  ])

  return { companyId, firstDriverId, secondDriverId, userId, vehicleId }
}

export async function seedTrip(
  database: TestDatabase,
  company: Company,
  status: 'in_transit',
): Promise<SeededTrip> {
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const documentId = crypto.randomUUID()

  await database.db.insert(trips).values({
    companyId: company.companyId,
    /** Spec 156 T15 M9: sem despacho congelado, a janela da hora informada começa aqui. */
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
    id: tripId,
    status,
    vehicleId: company.vehicleId,
  })
  await database.db.insert(tripDrivers).values([
    {
      companyId: company.companyId,
      driverId: company.firstDriverId,
      driverName: 'Motorista Um',
      driverTaxId: '11122233344',
      position: 1n,
      tripId,
    },
    {
      companyId: company.companyId,
      driverId: company.secondDriverId,
      driverName: 'Motorista Dois',
      driverTaxId: '22233344455',
      position: 2n,
      tripId,
    },
  ])
  await database.db.insert(tripStops).values({
    addressKey: `3550308|01001000|${tripId}`,
    arrivedAt: null,
    companyId: company.companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    id: documentId,
    loadedAt: new Date('2026-09-18T08:00:00.000Z'),
    nfeDocumentId: await seedNfeDocument(database, company),
    separatedAt: new Date('2026-09-18T07:00:00.000Z'),
    separationStatus: 'loaded',
    stopId,
    tripId,
  })

  return { documentId, stopId, tripId }
}

/** Liga o cadastro de motorista a uma conta — é assim que a nota acha o motorista do evento. */
export async function linkDriverMembership(
  database: TestDatabase,
  company: Company,
  driverId: string,
): Promise<string> {
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId: company.companyId, id: membershipId, status: 'active', userId })
  await database.db.update(fleetDrivers).set({ membershipId }).where(eq(fleetDrivers.id, driverId))

  return userId
}

/**
 * A chegada do motorista, antes da baixa. Sem ela, o canal `office` preenche `arrived_at` ao fechar a
 * parada (spec 156 T15 C1); o motorista continua precisando dela (`trip_stops_completed_requires_arrived_check`).
 */
export async function seedStopArrival(
  database: TestDatabase,
  trip: SeededTrip,
  arrivedAt: Date,
): Promise<void> {
  await database.db.update(tripStops).set({ arrivedAt }).where(eq(tripStops.id, trip.stopId))
}

/** Nota a mais na viagem — sem parada é o caso que decide se o roteiro existe (A2). */
export async function seedExtraDocument(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  input: {
    readonly releasedAt?: Date
    readonly returnReason?: string
    readonly separationStatus: 'loaded' | 'pending' | 'returned'
    readonly stopId?: string
  },
): Promise<string> {
  const documentId = crypto.randomUUID()
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    id: documentId,
    nfeDocumentId: await seedNfeDocument(database, company),
    releasedAt: input.releasedAt ?? null,
    returnReason: input.returnReason ?? null,
    separationStatus: input.separationStatus,
    stopId: input.stopId ?? null,
    tripId: trip.tripId,
  })
  return documentId
}

/** ADR-0067 §3: a fonte de "quando a viagem despachou" para validar `deliveredAt`/`returnedAt`. */
export async function seedDispatchSnapshot(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  dispatchedAt: Date,
): Promise<void> {
  await database.db.insert(tripDispatchSnapshots).values({
    actorUserId: company.userId,
    companyId: company.companyId,
    dispatchedAt,
    id: crypto.randomUUID(),
    snapshot: { stops: [] },
    snapshotSha256: '0'.repeat(64),
    tripId: trip.tripId,
  })
}

export async function seedNfeDocument(database: TestDatabase, company: Company): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const suffix = documentId.replaceAll('-', '')
  const sha = suffix.padEnd(64, '0').slice(0, 64)
  const digits = suffix.replace(/[a-f]/g, (letter) => String(letter.charCodeAt(0) % 10))

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: company.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/trip-field-office-${suffix}.xml`,
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
    idempotencyKey: `trip-field-office-${suffix}`,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: company.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${digits}${'0'.repeat(12)}`,
    authorizationProtocol: `protocol-${suffix}`,
    companyId: company.companyId,
    createdByUserId: company.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-18T06:00:00.000Z'),
    model: '55',
    number: `1${digits.slice(0, 5)}`,
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

  return documentId
}

export async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_156_t5_${crypto.randomUUID().replaceAll('-', '')}`
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
