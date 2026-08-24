/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import type { AuthenticationPort } from '../../src/identity/application/identity.port'
import { TenantContextService } from '../../src/identity/application/tenant-context.service'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from '../fixtures/health.fixture'
import { startApiServer } from '../../src/server/server.service'
import type { ApiLogger } from '../../src/shared/api.types'
import { CRYPTOGRAPHIC_CONFIGURATION } from '../fixtures/cryptographic-environment.fixture'
import { DrizzleCompanyFiscalEnvironmentRepository } from '../../src/companies/infrastructure/drizzle-company-fiscal-environment.repository'
import { createHttpRouterFixture } from '../fixtures/http-router.fixture'

const databaseUrl = process.env.API_TEST_DATABASE_URL ?? process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('GET /auth/me PostgreSQL isolation', () => {
  testWithPostgres(
    'derives each response exclusively from the authenticated company membership',
    async () => {
      if (databaseUrl === undefined) {
        throw new Error('API_TEST_DATABASE_URL or DATABASE_URL is required')
      }

      const admin = new SQL(databaseUrl, { max: 1 })
      const databaseName = `transportada_t013_${crypto.randomUUID().replaceAll('-', '')}`
      const disposableUrl = new URL(databaseUrl)
      disposableUrl.pathname = `/${databaseName}`
      disposableUrl.search = ''
      let database: ReturnType<typeof createDrizzleProvider> | undefined
      let server: Bun.Server<undefined> | undefined

      try {
        await admin.unsafe(`create database "${databaseName}"`)
        await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
        database = createDrizzleProvider({ connection: disposableUrl.toString() })

        const userA = crypto.randomUUID()
        const userB = crypto.randomUUID()
        const companyA = crypto.randomUUID()
        const companyB = crypto.randomUUID()
        const membershipA = crypto.randomUUID()
        const membershipB = crypto.randomUUID()
        await database.db.insert(identityUsers).values([{ id: userA }, { id: userB }])
        await database.db.insert(companies).values([{ id: companyA }, { id: companyB }])
        await database.db.insert(userCompanyMemberships).values([
          { companyId: companyA, id: membershipA, userId: userA },
          { companyId: companyB, id: membershipB, userId: userB },
        ])
        await database.db.insert(membershipRoles).values([
          { membershipId: membershipA, role: 'viewer' },
          { membershipId: membershipB, role: 'fiscal' },
        ])

        const authentication = createAuthentication({ companyA, companyB, userA, userB })
        const logger: ApiLogger = { error() {}, info() {}, warn() {} }
        const healthService = new HealthService({
          database,
          identityReadiness: {
            async checkReadiness() {
              return true
            },
          },
          migrationStatus: appliedMigrations(),
        })
        const tenantContext = new TenantContextService({
          repository: new DrizzleMembershipRepository(database.db),
        })
        server = startApiServer({
          config: {
            appEnv: 'test',
            bootstrapToken: undefined,
            companyId: undefined,
            cryptography: CRYPTOGRAPHIC_CONFIGURATION,
            databaseUrl: disposableUrl.toString(),
            emailDelivery: undefined,
            frontendOrigin: 'http://localhost:53000',
            keycloak: {
              admin: {
                clientId: 'transportada-admin-cli',
                clientSecret: 'test-keycloak-admin-client-secret',
              },
              audience: 'transportada-api',
              issuer: 'https://identity.example.test/realms/transportada',
              jwksUri: 'https://identity.example.test/realms/transportada/certs',
            },
            logLevel: 'error',
            messaging: undefined,
            nfseCallbackBaseUrl: undefined,
            notificationWebhookSecret: undefined,
            port: 0,
            postalCodeProviders: { brasilApiUrl: undefined, viaCepUrl: undefined },
            logSinkUrl: undefined,
            sentryDsn: undefined,
            sentryEnvironment: 'test',
            vehicleCatalog: null,
          },
          logger,
          router: createHttpRouterFixture({
            authentication,
            companyFiscalEnvironment: new DrizzleCompanyFiscalEnvironmentRepository(database.db),
            healthService,
            tenantContext,
          }),
        })
        const baseUrl = `http://127.0.0.1:${server.port}`

        const companyAResponse = await fetch(`${baseUrl}/auth/me`, {
          headers: { authorization: 'Bearer user-a' },
        })
        const companyBResponse = await fetch(`${baseUrl}/auth/me`, {
          headers: {
            authorization: 'Bearer user-b',
            'x-company-id': companyA,
          },
        })
        const crossCompanyResponse = await fetch(`${baseUrl}/auth/me`, {
          headers: { authorization: 'Bearer user-a-company-b' },
        })

        expect(companyAResponse.status).toBe(200)
        expect(await companyAResponse.json()).toEqual({
          data: {
            company: { fiscalEnvironment: null, id: companyA },
            identity: { userId: userA },
            permissions: [
              'invoices.read',
              'cte.read',
              'operations.read',
              'view-preferences.manage',
              'fleet.read',
              'mdfe.read',
              'nfse.read',
            ],
            roles: ['viewer'],
          },
        })
        expect(companyBResponse.status).toBe(200)
        expect(await companyBResponse.json()).toEqual({
          data: {
            company: { fiscalEnvironment: null, id: companyB },
            identity: { userId: userB },
            permissions: [
              'invoices.import',
              'invoices.read',
              'batches.create',
              'batches.approve',
              'freight.simulate',
              'cte.manage',
              'cte.submit',
              'cte.issue',
              'cte.cancel',
              'cte.read',
              'operations.read',
              'view-preferences.manage',
              'addresses.read',
              'fleet.read',
              'mdfe.read',
              'mdfe.manage',
              'mdfe.issue',
              'mdfe.close',
              'mdfe.cancel',
              'nfse.manage',
              'nfse.issue',
              'nfse.cancel',
              'nfse.read',
            ],
            roles: ['fiscal'],
          },
        })
        expect(crossCompanyResponse.status).toBe(403)
      } finally {
        try {
          await server?.stop()
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
    },
    30_000,
  )
})

type CreateAuthenticationParams = {
  readonly companyA: string
  readonly companyB: string
  readonly userA: string
  readonly userB: string
}

function createAuthentication({
  companyA,
  companyB,
  userA,
  userB,
}: CreateAuthenticationParams): AuthenticationPort {
  const identities = new Map<string, { readonly companyIdClaim: string; readonly userId: string }>([
    ['Bearer user-a', { companyIdClaim: companyA, userId: userA }],
    ['Bearer user-a-company-b', { companyIdClaim: companyB, userId: userA }],
    ['Bearer user-b', { companyIdClaim: companyB, userId: userB }],
  ])

  return {
    async authenticate(authorizationHeader) {
      const identity =
        authorizationHeader === null ? undefined : identities.get(authorizationHeader)
      if (identity === undefined) {
        throw new Error('Unexpected test authorization header')
      }

      return Object.freeze({
        ...identity,
        externalIdentityId: crypto.randomUUID(),
        issuer: 'https://identity.example.test/realms/transportada',
        platformAdmin: false,
        subject: `subject-${identity.userId}`,
      })
    },
  }
}
