/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 189 T7.4 (ADR-0075 §8, plan D8), contra o Postgres e pelo caminho HTTP inteiro
 * (`createRequestHandler` → `createRouter` → `AuthorizationService.authorize` → rota → caso de uso →
 * repositório): o `GET /me/location-consent` lê o que o `PUT` gravou — nulo, aceito, retirado —,
 * conta sem cadastro de motorista responde `409`, e o consentimento de outra empresa não aparece.
 * Contrato com dublê passa com `where` errado; é aqui que o filtro de tenant se prova.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { tripLocationPings } from '../../src/database/client-portal.schema.js'
import { fleetDrivers, userCompanyMemberships } from '../../src/database/database.schema.js'
import { DrizzleRateLimiterRepository } from '../../src/http/drizzle-rate-limiter.repository.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createReadLocationConsentUseCase } from '../../src/trips/application/read-location-consent.use-case.js'
import { createRecordTripLocationUseCase } from '../../src/trips/application/record-trip-location.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleTripLocationRepository } from '../../src/trips/infrastructure/drizzle-trip-location.repository.js'
import { createMeLocationRoutes } from '../../src/trips/presentation/me-location.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
const CONSENT_URL = `${FRONTEND_ORIGIN}/me/location-consent`
const DRIVER_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'trip.read',
  'trip.report',
] as const)

function driverContext(input: {
  readonly companyId: string
  readonly membershipId: string
  readonly permissions?: CompanyContext['permissions']
}): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: input.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'me-location-consent',
      userId: crypto.randomUUID(),
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: input.companyId,
      kind: 'company',
      membershipId: input.membershipId,
      permissions: input.permissions ?? DRIVER_PERMISSIONS,
      roles: ['driver'],
      userId: crypto.randomUUID(),
    },
  }
}

function buildHandler(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly database: TestDatabase
}) {
  const locations = new DrizzleTripLocationRepository(input.database.db)
  const drivers = new DrizzleCurrentDriverTripRepository(input.database.db)
  const resolveDriverId = (scope: { readonly companyId: string; readonly membershipId: string }) =>
    drivers.findDriverIdByMembership(scope)
  const router = createRouter({
    authentication: { authenticate: async () => input.context.identity },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    /** Segurança M3 (spec 189 T9.2): balde real, prova que o `store: 'postgres'` das rotas sobe. */
    rateLimitWindows: new DrizzleRateLimiterRepository(input.database.db),
    routes: createMeLocationRoutes({
      readConsent: createReadLocationConsentUseCase({ repository: locations, resolveDriverId }),
      recordLocation: createRecordTripLocationUseCase({ repository: locations }),
      resolveDriverId,
      setConsent: (consent) => locations.setConsent(consent),
    }),
    tenantContext: { resolveCompany: async () => input.context },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handle = createRequestHandler({
    createCorrelationId: () => crypto.randomUUID(),
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router,
  })

  return {
    read: () =>
      handle(new Request(CONSENT_URL, { headers: { authorization: 'Bearer x' } }), {
        timeout() {},
      }),
    write: (accepted: boolean) =>
      handle(
        new Request(CONSENT_URL, {
          body: JSON.stringify({ accepted }),
          headers: { authorization: 'Bearer x', 'content-type': 'application/json' },
          method: 'PUT',
        }),
        { timeout() {} },
      ),
  }
}

/** O vínculo conta→motorista que a rota resolve: o `membershipId` do cadastro. */
async function linkDriver(
  database: TestDatabase,
  company: Company,
  driverId: string,
): Promise<string> {
  await linkDriverMembership(database, company, driverId)
  const [driver] = await database.db
    .select({ membershipId: fleetDrivers.membershipId })
    .from(fleetDrivers)
    .where(eq(fleetDrivers.id, driverId))
  if (driver?.membershipId == null) throw new Error('driver membership was not linked')

  return driver.membershipId
}

async function readAcceptedAt(response: Response): Promise<string | null> {
  const body = (await response.json()) as { readonly data: { readonly acceptedAt: string | null } }
  return body.data.acceptedAt
}

describe('a leitura do consentimento de posição (spec 189 T7.4)', () => {
  testWithPostgres('nulo, aceito e retirado — a leitura acompanha o PUT', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const membershipId = await linkDriver(database, company, company.firstDriverId)
      const api = buildHandler({
        context: driverContext({ companyId: company.companyId, membershipId }),
        database,
      })

      const never = await api.read()
      expect(never.status).toBe(200)
      expect(never.headers.get('cache-control')).toBe('no-store')
      expect(await readAcceptedAt(never)).toBeNull()

      expect((await api.write(true)).status).toBe(200)
      const accepted = await api.read()
      expect(accepted.status).toBe(200)
      const acceptedAt = await readAcceptedAt(accepted)
      expect(acceptedAt).not.toBeNull()
      expect(Number.isNaN(Date.parse(acceptedAt ?? ''))).toBe(false)

      expect((await api.write(false)).status).toBe(200)
      expect(await readAcceptedAt(await api.read())).toBeNull()
    })
  })

  testWithPostgres('conta sem cadastro de motorista: 409 na leitura e no PUT', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const [membership] = await database.db
        .select({ id: userCompanyMemberships.id })
        .from(userCompanyMemberships)
        .where(eq(userCompanyMemberships.companyId, company.companyId))
      const api = buildHandler({
        context: driverContext({
          companyId: company.companyId,
          membershipId: membership?.id ?? '',
        }),
        database,
      })

      const read = await api.read()
      const write = await api.write(true)

      expect(read.status).toBe(409)
      expect(((await read.json()) as { error: { code: string } }).error.code).toBe(
        'DRIVER_NOT_REGISTERED',
      )
      expect(write.status).toBe(409)
      expect(((await write.json()) as { error: { code: string } }).error.code).toBe(
        'DRIVER_NOT_REGISTERED',
      )
    })
  })

  testWithPostgres('sem trip.report, 403 — a política é a mesma do PUT', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const membershipId = await linkDriver(database, company, company.firstDriverId)
      const api = buildHandler({
        context: driverContext({
          companyId: company.companyId,
          membershipId,
          permissions: new Set(['trip.read'] as const),
        }),
        database,
      })

      expect((await api.read()).status).toBe(403)
    })
  })

  testWithPostgres('o consentimento de outra empresa não aparece', async () => {
    await withDisposableDatabase(async (database) => {
      const own = await seedCompany(database)
      const other = await seedCompany(database)
      const ownMembership = await linkDriver(database, own, own.firstDriverId)
      const otherMembership = await linkDriver(database, other, other.firstDriverId)

      const otherApi = buildHandler({
        context: driverContext({ companyId: other.companyId, membershipId: otherMembership }),
        database,
      })
      expect((await otherApi.write(true)).status).toBe(200)

      const ownApi = buildHandler({
        context: driverContext({ companyId: own.companyId, membershipId: ownMembership }),
        database,
      })
      expect(await readAcceptedAt(await ownApi.read())).toBeNull()

      /** O vínculo de outra empresa não resolve motorista nesta: 409, nunca o consentimento dela. */
      const crossApi = buildHandler({
        context: driverContext({ companyId: own.companyId, membershipId: otherMembership }),
        database,
      })
      expect((await crossApi.read()).status).toBe(409)

      /** E o repositório filtra por empresa, mesmo recebendo o id de um motorista alheio. */
      const locations = new DrizzleTripLocationRepository(database.db)
      expect(
        await locations.readConsent({ companyId: own.companyId, driverId: other.firstDriverId }),
      ).toEqual({ acceptedAt: null })
      expect(
        (await locations.readConsent({ companyId: other.companyId, driverId: other.firstDriverId }))
          .acceptedAt,
      ).not.toBeNull()
    })
  })
})

/**
 * Segurança M3 (spec 189 T9.2): o rate limit do Postgres corta abuso, mas não o replay bem
 * comportado — o mesmo celular reenviando o ping do minuto anterior por causa de retry de rede.
 * Prova contra o banco real: o segundo ping dentro da janela não vira linha nova em
 * `trip_location_pings`, e o de depois da janela volta a gravar.
 */
describe('o dedup do ping de posição contra o banco (spec 189 T9.2)', () => {
  testWithPostgres('o ping repetido antes de 45 s não duplica a linha', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'dispatched')
      const locations = new DrizzleTripLocationRepository(database.db)
      await locations.setConsent({
        accepted: true,
        companyId: company.companyId,
        driverId: company.firstDriverId,
      })
      const recordTripLocation = createRecordTripLocationUseCase({ repository: locations })
      const ping = {
        companyId: company.companyId,
        driverId: company.firstDriverId,
        latitude: '-21.1767000',
        longitude: '-47.8208000',
      }

      expect((await recordTripLocation(ping)).outcome).toBe('recorded')
      expect((await recordTripLocation(ping)).outcome).toBe('ignored')

      const rowsWithinWindow = await database.db
        .select()
        .from(tripLocationPings)
        .where(eq(tripLocationPings.tripId, trip.tripId))
      expect(rowsWithinWindow).toHaveLength(1)

      expect(
        (await recordTripLocation({ ...ping, now: new Date(Date.now() + 60_000) })).outcome,
      ).toBe('recorded')

      const rowsAfterWindow = await database.db
        .select()
        .from(tripLocationPings)
        .where(eq(tripLocationPings.tripId, trip.tripId))
      expect(rowsAfterWindow).toHaveLength(2)
    })
  })
})
