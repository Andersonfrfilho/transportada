/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'

import { parseEnvironment } from './config/environment.schema'
import { createGetCompanySettingsUseCase } from './companies/application/get-company-settings.use-case'
import { createIdempotencyFingerprintService } from './companies/application/idempotency-fingerprint.service'
import { createUpdateCompanySettingsUseCase } from './companies/application/update-company-settings.use-case'
import { DrizzleCompanySettingsRepository } from './companies/infrastructure/drizzle-company-settings.repository'
import type { CompanySettingsDatabase } from './companies/infrastructure/drizzle-company-settings.types'
import { createCompanySettingsRoutes } from './companies/presentation/company-settings.routes'
import { HealthService } from './health/health.service'
import { AuthenticationService } from './identity/application/authentication.service'
import { TenantContextService } from './identity/application/tenant-context.service'
import { AuthorizationService } from './identity/application/authorization.service'
import { DrizzleExternalIdentityRepository } from './identity/infrastructure/drizzle-external-identity.repository'
import { DrizzleMembershipRepository } from './identity/infrastructure/drizzle-membership.repository'
import { createKeycloakAccessTokenVerifier } from './identity/infrastructure/keycloak-jwt.gateway'
import { createRouter } from './http/router.service'
import type { ApiEnvironment } from './shared/api.types'
import {
  createShutdownHandler,
  registerShutdownSignals,
  startApiServer,
} from './server/server.service'

export function bootstrap(): Bun.Server<undefined> {
  const config = parseEnvironment(process.env)
  const logger = createApiLogger(config)
  const identityGateway = createKeycloakAccessTokenVerifier(config.keycloak)
  const database = createDrizzleProvider({ connection: config.databaseUrl })
  const authentication = new AuthenticationService({
    repository: new DrizzleExternalIdentityRepository(database.db),
    verifier: identityGateway,
  })
  const healthService = new HealthService({ database, identityReadiness: identityGateway })
  const tenantContext = new TenantContextService({
    repository: new DrizzleMembershipRepository(database.db),
  })
  const router = createRouter({
    authentication,
    authorization: new AuthorizationService(),
    healthService,
    routes: createCompanySettingsApplicationRoutes({
      database: database.db,
      idempotencyHmacKey: config.cryptography.idempotencyHmacKey,
    }),
    tenantContext,
  })
  const server = startApiServer({
    config,
    logger,
    router,
  })
  const shutdown = createShutdownHandler({ database, logger, server })

  registerShutdownSignals({ logger, shutdown })
  logger.info('api_started', {
    environment: config.appEnv,
    hostname: server.hostname,
    port: server.port,
  })

  return server
}

function createApiLogger(
  config: Pick<ApiEnvironment, 'appEnv' | 'logLevel'>,
): ReturnType<typeof createLogger> {
  return createLogger({
    logLevel: config.logLevel,
    pretty: config.appEnv !== 'production',
    projectName: 'transportada-api',
    version: '0.1.0',
  })
}

type CreateCompanySettingsApplicationRoutesParams = {
  readonly database: CompanySettingsDatabase
  readonly idempotencyHmacKey: Uint8Array
}

function createCompanySettingsApplicationRoutes({
  database,
  idempotencyHmacKey,
}: CreateCompanySettingsApplicationRoutesParams): ReturnType<typeof createCompanySettingsRoutes> {
  const repository = new DrizzleCompanySettingsRepository(database)
  return createCompanySettingsRoutes({
    getSettings: createGetCompanySettingsUseCase({ repository }),
    updateSettings: createUpdateCompanySettingsUseCase({
      fingerprintService: createIdempotencyFingerprintService({ key: idempotencyHmacKey }),
      unitOfWork: repository,
    }),
  })
}

if (import.meta.main) {
  bootstrap()
}
