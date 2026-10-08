/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 T2.4, contra o Postgres e pelo caminho HTTP inteiro: o PDF sai com um bloco por canhoto
 * (a nota sem foto ganha o seu), a foto vem do storage e a empresa vê só os próprios canhotos.
 */
import { createHash } from 'node:crypto'

import { describe, expect } from 'bun:test'
import { getDocumentProxy } from 'unpdf'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { COMPANY_ROLE_PERMISSIONS } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { storedObjects } from '../../src/database/storage.schema.js'
import { tripDeliveryProofs, tripStopEvents } from '../../src/database/trip.schema.js'
import {
  createNfeStorageGateway,
  type NfeStorageGateway,
} from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { createExportTripProofPdfUseCase } from '../../src/trips/application/export-trip-proof-pdf.use-case.js'
import { createListTripReportUseCase } from '../../src/trips/application/list-trip-report.use-case.js'
import { DrizzleTripProofReportRepository } from '../../src/trips/infrastructure/drizzle-trip-proof-report.repository.js'
import { DrizzleTripReportRepository } from '../../src/trips/infrastructure/drizzle-trip-report.repository.js'
import { createTripProofPdfGateway } from '../../src/trips/infrastructure/trip-proof-pdf.gateway.js'
import { createTripDocumentReportRoutes } from '../../src/trips/presentation/trip-document-report.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { createInMemoryObjectStorageProvider } from '../fixtures/in-memory-object-storage.fixture.js'
import { buildSolidPngBytes } from '../fixtures/proof-image.fixture.js'
import {
  seedCompany,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import { decorateTripDocument } from '../fixtures/trip-report-database.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const ORIGIN = 'http://127.0.0.1:53000'
const PROOFS_PATH = '/trip-document-report/proofs-pdf'
const BUCKET = 'integration-proofs'
const MAX_OBJECT_BYTES = 5 * 1024 * 1024

function buildHandler(input: {
  readonly company: Company
  readonly database: TestDatabase
  readonly role: keyof typeof COMPANY_ROLE_PERMISSIONS
  readonly storage: NfeStorageGateway
}) {
  const context = {
    identity: {
      companyIdClaim: input.company.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-proof-pdf-end-to-end',
      userId: input.company.userId,
    },
    scope: {
      companyId: input.company.companyId,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set(COMPANY_ROLE_PERMISSIONS[input.role]),
      roles: [input.role],
      userId: input.company.userId,
    },
  } as AuthenticatedContext<CompanyContext>
  const router = createRouter({
    authentication: { authenticate: async () => context.identity },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    routes: createTripDocumentReportRoutes({
      exportTripProofPdf: createExportTripProofPdfUseCase({
        clock: () => new Date('2026-10-07T15:00:00.000Z'),
        proofRepository: new DrizzleTripProofReportRepository(input.database.db),
        renderer: createTripProofPdfGateway(),
        reportRepository: new DrizzleTripReportRepository(input.database.db),
        storage: input.storage,
      }),
      listTripReport: createListTripReportUseCase({
        repository: new DrizzleTripReportRepository(input.database.db),
      }),
    }),
    tenantContext: { resolveCompany: async () => context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handle = createRequestHandler({
    createCorrelationId: () => crypto.randomUUID(),
    frontendOrigins: [ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router,
  })
  return (query = '') =>
    handle(
      new Request(`${ORIGIN}${PROOFS_PATH}${query}`, { headers: { authorization: 'Bearer x' } }),
      { timeout() {} },
    )
}

type SeededProof = { readonly objectKey: string }

async function seedPhotoProof(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly storage: NfeStorageGateway
    readonly stopId: string
    readonly tripDocumentId: string
  },
): Promise<SeededProof> {
  const bytes = buildSolidPngBytes({ heightPx: 40, widthPx: 60 })
  const objectId = crypto.randomUUID()
  const objectKey = `proof/${objectId}.png`
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await input.storage.storeObject({
    body: bytes,
    bucket: BUCKET,
    contentLength: bytes.byteLength,
    contentType: 'image/png',
    key: objectKey,
    sha256,
  })
  await database.db.insert(storedObjects).values({
    bucket: BUCKET,
    companyId: input.company.companyId,
    id: objectId,
    mimeType: 'image/png',
    objectKey,
    provider: 's3',
    purpose: 'delivery_proof',
    sha256,
    sizeBytes: BigInt(bytes.byteLength),
    status: 'final',
  })
  const eventId = crypto.randomUUID()
  await database.db.insert(tripStopEvents).values({
    actorUserId: input.company.userId,
    channel: 'driver_app',
    companyId: input.company.companyId,
    id: eventId,
    kind: 'delivered',
    stopId: input.stopId,
    tripDocumentId: input.tripDocumentId,
  })
  await database.db.insert(tripDeliveryProofs).values({
    actorUserId: input.company.userId,
    companyId: input.company.companyId,
    kind: 'photo',
    objectId,
    stopEventId: eventId,
  })
  return { objectKey }
}

async function seedWorld(database: TestDatabase, storage: NfeStorageGateway) {
  const company = await seedCompany(database)
  const otherCompany = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await decorateTripDocument(database, {
    companyId: company.companyId,
    seed: { number: '12345', totalValue: '500.0000' },
    tripDocumentId: trip.documentId,
  })
  const secondDocumentId = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
  })
  await decorateTripDocument(database, {
    companyId: company.companyId,
    seed: { number: '777', totalValue: '50.0000' },
    tripDocumentId: secondDocumentId,
  })
  await seedPhotoProof(database, {
    company,
    stopId: trip.stopId,
    storage,
    tripDocumentId: trip.documentId,
  })
  await seedPhotoProof(database, {
    company,
    stopId: trip.stopId,
    storage,
    tripDocumentId: trip.documentId,
  })
  const otherTrip = await seedTrip(database, otherCompany, 'in_transit')
  await decorateTripDocument(database, {
    companyId: otherCompany.companyId,
    seed: { number: '999' },
    tripDocumentId: otherTrip.documentId,
  })
  await seedPhotoProof(database, {
    company: otherCompany,
    stopId: otherTrip.stopId,
    storage,
    tripDocumentId: otherTrip.documentId,
  })
  return { company }
}

function buildStorage(): NfeStorageGateway {
  return createNfeStorageGateway({
    finalBucket: BUCKET,
    provider: createInMemoryObjectStorageProvider({ maxObjectSizeBytes: MAX_OBJECT_BYTES }),
    stagingBucket: BUCKET,
  })
}

async function readPdfText(response: Response): Promise<{ pages: number; text: string }> {
  const document = await getDocumentProxy(new Uint8Array(await response.arrayBuffer()))
  let text = ''
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    text += content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  }
  return { pages: document.numPages, text }
}

describe('o PDF de canhotos pelo caminho HTTP inteiro (spec 253 T2.4)', () => {
  testWithPostgres(
    'um bloco por canhoto, a nota sem foto ganha o seu, e a outra empresa nao aparece',
    async () => {
      await withDisposableDatabase(async (database) => {
        const storage = buildStorage()
        const world = await seedWorld(database, storage)

        const response = await buildHandler({
          company: world.company,
          database,
          role: 'operator',
          storage,
        })()
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/pdf')
        expect(response.headers.get('content-disposition')).toContain('canhotos-20261007.pdf')

        const { text } = await readPdfText(response)
        expect(text).toContain('12345')
        expect(text).toContain('777')
        expect(text).not.toContain('999')
        expect(text).toContain('Canhoto 1 de 2')
        expect(text).toContain('Canhoto 2 de 2')
      })
    },
    120_000,
  )

  testWithPostgres(
    'separador nao ve o valor no PDF e o motorista recebe 403',
    async () => {
      await withDisposableDatabase(async (database) => {
        const storage = buildStorage()
        const world = await seedWorld(database, storage)

        const asSeparator = await buildHandler({
          company: world.company,
          database,
          role: 'separator',
          storage,
        })()
        expect(asSeparator.status).toBe(200)
        const { text } = await readPdfText(asSeparator)
        expect(text).not.toContain('R$')

        const forbidden = await buildHandler({
          company: world.company,
          database,
          role: 'driver',
          storage,
        })()
        expect(forbidden.status).toBe(403)
      })
    },
    120_000,
  )
})
