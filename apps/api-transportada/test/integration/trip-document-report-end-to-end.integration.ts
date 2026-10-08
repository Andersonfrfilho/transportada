/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 T2.3, contra o Postgres e pelo caminho HTTP inteiro (`createRequestHandler` →
 * `createRouter` → `AuthorizationService` → rota → caso de uso → consulta): o valor só sai com
 * `trip.financials`, a empresa vê só as próprias notas, o cursor percorre as páginas pelo HTTP e a
 * nota sem viagem é contada.
 */
import { describe, expect } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { COMPANY_ROLE_PERMISSIONS } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createListTripReportUseCase } from '../../src/trips/application/list-trip-report.use-case.js'
import { DrizzleTripReportRepository } from '../../src/trips/infrastructure/drizzle-trip-report.repository.js'
import { createTripDocumentReportRoutes } from '../../src/trips/presentation/trip-document-report.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import {
  seedCompany,
  seedExtraDocument,
  seedNfeDocument,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import { decorateTripDocument } from '../fixtures/trip-report-database.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const ORIGIN = 'http://127.0.0.1:53000'
const REPORT_PATH = '/trip-document-report'

type ReportBody = {
  readonly data: readonly { readonly amount?: string; readonly documentNumber: string }[]
  readonly excludedWithoutTrip?: number
  readonly page: { readonly nextCursor: string | null; readonly total?: number }
}

function buildHandler(input: {
  readonly company: Company
  readonly database: TestDatabase
  readonly role: keyof typeof COMPANY_ROLE_PERMISSIONS
}) {
  const context = {
    identity: {
      companyIdClaim: input.company.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-document-report-end-to-end',
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
      exportTripProofPdf: async () => {
        throw new Error('unexpected proofs-pdf call')
      },
      listTripReport: createListTripReportUseCase({
        repository: new DrizzleTripReportRepository(input.database.db),
      }),
      listTripReportFacets: async () => {
        throw new Error('unexpected facets call')
      },
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
      new Request(`${ORIGIN}${REPORT_PATH}${query}`, { headers: { authorization: 'Bearer x' } }),
      { timeout() {} },
    )
}

async function seedWorld(database: TestDatabase) {
  const company = await seedCompany(database)
  const otherCompany = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const firstNfeId = await decorateTripDocument(database, {
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
  const otherTrip = await seedTrip(database, otherCompany, 'in_transit')
  await decorateTripDocument(database, {
    companyId: otherCompany.companyId,
    seed: { number: '999' },
    tripDocumentId: otherTrip.documentId,
  })
  const strayNfeId = await seedNfeDocument(database, company)
  return { company, firstNfeId, otherCompany, strayNfeId }
}

describe('o relatorio de viagens pelo caminho HTTP inteiro (spec 253 T2.3)', () => {
  testWithPostgres(
    'operador recebe o valor, separador nao, e nenhum dos dois ve a outra empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const asOperator = await buildHandler({
          company: world.company,
          database,
          role: 'operator',
        })()
        const operatorBody = (await asOperator.json()) as ReportBody
        expect(asOperator.status).toBe(200)
        expect(operatorBody.data.map((row) => row.documentNumber).sort()).toEqual(['12345', '777'])
        expect(operatorBody.page.total).toBe(2)
        expect(operatorBody.data.find((row) => row.documentNumber === '12345')?.amount).toBe(
          '500.0000',
        )

        const asSeparator = await buildHandler({
          company: world.company,
          database,
          role: 'separator',
        })()
        const separatorBody = (await asSeparator.json()) as ReportBody
        expect(asSeparator.status).toBe(200)
        expect(separatorBody.data).toHaveLength(2)
        expect(JSON.stringify(separatorBody)).not.toContain('amount')
        expect(JSON.stringify(separatorBody)).not.toContain('500.0000')
      })
    },
    120_000,
  )

  testWithPostgres(
    'o cursor percorre as paginas pelo HTTP e documentIdIn conta a nota sem viagem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const handle = buildHandler({ company: world.company, database, role: 'operator' })

        const first = (await (await handle('?limit=1')).json()) as ReportBody
        expect(first.data).toHaveLength(1)
        expect(first.page.nextCursor).not.toBeNull()
        const second = (await (
          await handle(`?limit=1&cursor=${encodeURIComponent(first.page.nextCursor ?? '')}`)
        ).json()) as ReportBody
        expect(second.data).toHaveLength(1)
        expect(second.page.nextCursor).toBeNull()
        expect(second.page.total).toBeUndefined()
        expect([first.data[0]?.documentNumber, second.data[0]?.documentNumber].sort()).toEqual([
          '12345',
          '777',
        ])

        const narrowed = (await (
          await handle(`?documentIdIn=${world.firstNfeId},${world.strayNfeId}`)
        ).json()) as ReportBody
        expect(narrowed.data.map((row) => row.documentNumber)).toEqual(['12345'])
        expect(narrowed.excludedWithoutTrip).toBe(1)
      })
    },
    120_000,
  )

  testWithPostgres(
    '400 com todos os erros e 403 para o motorista, que nao le a empresa',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const invalid = await buildHandler({
          company: world.company,
          database,
          role: 'operator',
        })('?limit=0&statusIn=nope')
        expect(invalid.status).toBe(400)
        const invalidBody = (await invalid.json()) as { error: { details: unknown[] } }
        expect(invalidBody.error.details).toHaveLength(2)

        const forbidden = await buildHandler({
          company: world.company,
          database,
          role: 'driver',
        })()
        expect(forbidden.status).toBe(403)
      })
    },
    120_000,
  )
})
