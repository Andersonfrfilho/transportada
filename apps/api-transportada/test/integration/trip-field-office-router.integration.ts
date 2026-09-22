/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15, contra o Postgres e pelo caminho HTTP inteiro (`createRequestHandler` →
 * `createRouter` → `AuthorizationService.authorize` → rota → caso de uso): o separador leva 403 numa
 * escrita do escritório (aceite 1), a entrega em massa baixa só as notas enviadas (aceite 5), e
 * nenhum log da requisição leva a imagem, o documento ou o nome de quem recebeu (aceite 11).
 */
import { describe, expect } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { tripDeliveryProofs, tripDocuments } from '../../src/database/trip.schema.js'
import { DrizzleRateLimiterRepository } from '../../src/http/drizzle-rate-limiter.repository.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { COMPANY_ROLE_PERMISSIONS } from '../../src/identity/domain/authorization.policy.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import {
  JPEG_BYTES,
  seedCompany,
  seedDeliveryOccurrenceType,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  wireOccurrenceRoute,
  wireRoutes,
  withDisposableDatabase,
  type Company,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
const RECEIVER_NAME = 'Marisa Sigilosa Recebedora'
const RECEIVER_DOCUMENT = '11144477735'
/** Uma marca dentro dos bytes da foto: se ela aparecer no log, a imagem vazou. */
const IMAGE_MARKER = 'CANHOTO-BYTES-MARCADOR'

type LoggedLine = { readonly level: string; readonly message: string; readonly metadata: unknown }

function companyContext(input: {
  readonly company: Company
  readonly role: keyof typeof COMPANY_ROLE_PERMISSIONS
}): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: input.company.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-field-office-router',
      userId: input.company.userId,
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: input.company.companyId,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: new Set(COMPANY_ROLE_PERMISSIONS[input.role]),
      roles: [input.role],
      userId: input.company.userId,
    },
  } as AuthenticatedContext<CompanyContext>
}

function buildHandler(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly database: TestDatabase
  readonly logged: LoggedLine[]
}) {
  const logger = {
    error: (message: string, metadata?: unknown) =>
      void input.logged.push({ level: 'error', message, metadata }),
    info: (message: string, metadata?: unknown) =>
      void input.logged.push({ level: 'info', message, metadata }),
    warn: (message: string, metadata?: unknown) =>
      void input.logged.push({ level: 'warn', message, metadata }),
  }
  const router = createRouter({
    authentication: { authenticate: async () => input.context.identity },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    rateLimitWindows: new DrizzleRateLimiterRepository(input.database.db),
    routes: [...wireRoutes(input.database), wireOccurrenceRoute(input.database, { logger }).route],
    tenantContext: { resolveCompany: async () => input.context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handle = createRequestHandler({
    createCorrelationId: () => crypto.randomUUID(),
    frontendOrigins: [FRONTEND_ORIGIN],
    logger,
    requestTimeoutSeconds: 30,
    router,
  })

  return (request: Request) => handle(request, { timeout() {} })
}

function deliveryRequest(input: {
  readonly documentId: string
  readonly fields: Record<string, string>
  readonly idempotencyKey: string
  readonly tripId: string
  readonly withFile: boolean
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields)) form.set(key, value)
  if (input.withFile) {
    const bytes = new Uint8Array([...JPEG_BYTES, ...new TextEncoder().encode(IMAGE_MARKER)])
    form.set('file', new File([bytes], 'canhoto.jpg', { type: 'image/jpeg' }))
  }
  return new Request(
    `${FRONTEND_ORIGIN}/trips/${input.tripId}/documents/${input.documentId}/field-delivery`,
    {
      body: form,
      headers: { authorization: 'Bearer x', 'idempotency-key': input.idempotencyKey },
      method: 'POST',
    },
  )
}

describe('as rotas do escritório pelo caminho HTTP inteiro (spec 156 T15)', () => {
  testWithPostgres(
    'aceite 1: o separador recebe 403 em field-delivery pelo roteador, e nada é baixado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const handle = buildHandler({
          context: companyContext({ company, role: 'separator' }),
          database,
          logged: [],
        })

        const response = await handle(
          deliveryRequest({
            documentId: trip.documentId,
            fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
            idempotencyKey: 'separador-tenta-baixar',
            tripId: trip.tripId,
            withFile: false,
          }),
        )

        expect(response.status).toBe(403)
        const [document] = await database.db
          .select({ status: tripDocuments.separationStatus })
          .from(tripDocuments)
          .where(eq(tripDocuments.id, trip.documentId))
        expect(document?.status).toBe('loaded')
      })
    },
  )

  testWithPostgres(
    'aceite 5: cinco notas, quatro entregues com canhoto e uma pulada — a pulada fica como estava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const extra = await Promise.all(
          [0, 1, 2, 3].map(() =>
            seedExtraDocument(database, company, trip, {
              separationStatus: 'loaded',
              stopId: trip.stopId,
            }),
          ),
        )
        const documentIds = [trip.documentId, ...extra]
        const [skipped, ...delivered] = documentIds
        const handle = buildHandler({
          context: companyContext({ company, role: 'operator' }),
          database,
          logged: [],
        })

        for (const [index, documentId] of delivered.entries()) {
          const response = await handle(
            deliveryRequest({
              documentId,
              fields: { deliveredAt: `2026-09-18T0${String(index + 5)}:00:00.000Z` },
              idempotencyKey: `em-massa-${String(index)}`,
              tripId: trip.tripId,
              withFile: true,
            }),
          )
          expect(response.status).toBe(201)
        }

        const rows = await database.db
          .select({
            deliveredAt: tripDocuments.deliveredAt,
            id: tripDocuments.id,
            status: tripDocuments.separationStatus,
          })
          .from(tripDocuments)
          .where(inArray(tripDocuments.id, documentIds))
        const byId = new Map(rows.map((row) => [row.id, row]))
        expect(byId.get(skipped ?? '')?.status).toBe('loaded')
        expect(byId.get(skipped ?? '')?.deliveredAt).toBeNull()
        for (const [index, documentId] of delivered.entries()) {
          expect(byId.get(documentId)?.status).toBe('delivered')
          expect(byId.get(documentId)?.deliveredAt?.toISOString()).toBe(
            `2026-09-18T0${String(index + 5)}:00:00.000Z`,
          )
        }
        expect(await database.db.select().from(tripDeliveryProofs)).toHaveLength(4)
      })
    },
  )

  testWithPostgres(
    'aceite 11: nenhum log das rotas do escritório leva imagem, documento ou nome de quem recebeu',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const secondDocumentId = await seedExtraDocument(database, company, trip, {
          separationStatus: 'loaded',
          stopId: trip.stopId,
        })
        const typeId = await seedDeliveryOccurrenceType(database, company)
        await database.db
          .insert(companyDeliveryProofSettings)
          .values({ companyId: company.companyId, receiverDocument: 'optional' })
        const logged: LoggedLine[] = []
        const handle = buildHandler({
          context: companyContext({ company, role: 'operator' }),
          database,
          logged,
        })
        const receiverFields = {
          deliveredAt: '2026-09-18T09:00:00.000Z',
          receiverDocument: RECEIVER_DOCUMENT,
          receiverName: RECEIVER_NAME,
        }

        const accepted = await handle(
          deliveryRequest({
            documentId: trip.documentId,
            fields: receiverFields,
            idempotencyKey: 'aceite-11-ok',
            tripId: trip.tripId,
            withFile: true,
          }),
        )
        const refused = await handle(
          deliveryRequest({
            documentId: secondDocumentId,
            fields: { ...receiverFields, deliveredAt: '2026-09-30T09:00:00.000Z' },
            idempotencyKey: 'aceite-11-recusada',
            tripId: trip.tripId,
            withFile: true,
          }),
        )
        const occurrenceForm = new FormData()
        occurrenceForm.append('documentIds', secondDocumentId)
        occurrenceForm.set('occurrenceTypeId', typeId)
        occurrenceForm.set('note', 'Portão fechado')
        occurrenceForm.set(
          'file',
          new File(
            [new Uint8Array([...JPEG_BYTES, ...new TextEncoder().encode(IMAGE_MARKER)])],
            'foto.jpg',
            { type: 'image/jpeg' },
          ),
        )
        const occurrences = await handle(
          new Request(`${FRONTEND_ORIGIN}/trips/${trip.tripId}/documents/field-occurrences`, {
            body: occurrenceForm,
            headers: { authorization: 'Bearer x', 'idempotency-key': 'aceite-11-lote' },
            method: 'POST',
          }),
        )

        expect(accepted.status).toBe(201)
        expect(refused.status).toBe(400)
        expect(occurrences.status).toBe(201)
        expect(logged.length).toBeGreaterThan(0)
        const everything = JSON.stringify(logged)
        expect(everything).not.toContain(RECEIVER_NAME)
        expect(everything).not.toContain(RECEIVER_DOCUMENT)
        expect(everything).not.toContain('444.777')
        expect(everything).not.toContain(IMAGE_MARKER)
        expect(everything).not.toContain('Portão fechado')
      })
    },
  )
})
