/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { parseEnvironment } from './config/environment.schema'
import { createGetCompanySettingsUseCase } from './companies/application/get-company-settings.use-case'
import { createIdempotencyFingerprintService } from './companies/application/idempotency-fingerprint.service'
import { createUpdateCompanySettingsUseCase } from './companies/application/update-company-settings.use-case'
import { createListDigitalCertificatesUseCase } from './companies/application/list-digital-certificates.use-case'
import { createReplaceDigitalCertificateUseCase } from './companies/application/replace-digital-certificate.use-case'
import { createDigitalCertificateSecretService } from './companies/application/digital-certificate-secret.service'
import { DrizzleCompanySettingsRepository } from './companies/infrastructure/drizzle-company-settings.repository'
import { DrizzleDigitalCertificateRepository } from './companies/infrastructure/drizzle-digital-certificate.repository'
import { createFiscalCertificateValidationGateway } from './companies/infrastructure/fiscal-certificate-validation.gateway'
import type { CompanySettingsDatabase } from './companies/infrastructure/drizzle-company-settings.types'
import { createCompanySettingsRoutes } from './companies/presentation/company-settings.routes'
import { createDigitalCertificateRoutes } from './companies/presentation/digital-certificates.routes'
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
    routes: createApplicationRoutes({
      database: database.db,
      envelopeKeyRing: config.cryptography.envelopeKeyRing,
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

type CreateApplicationRoutesParams = {
  readonly database: CompanySettingsDatabase
  readonly envelopeKeyRing: import('@adatechnology/secret-envelope').SecretKeyRing
  readonly idempotencyHmacKey: Uint8Array
}

function createApplicationRoutes({
  database,
  envelopeKeyRing,
  idempotencyHmacKey,
}: CreateApplicationRoutesParams): readonly ReturnType<
  typeof createCompanySettingsRoutes
>[number][] {
  const settingsRepository = new DrizzleCompanySettingsRepository(database)
  const certificateRepository = new DrizzleDigitalCertificateRepository(database)
  const fingerprintService = createIdempotencyFingerprintService({ key: idempotencyHmacKey })
  const replace = createReplaceDigitalCertificateUseCase({
    certificateValidationGateway: createFiscalCertificateValidationGateway(),
    createCertificateId: () => crypto.randomUUID(),
    fingerprintService,
    repository: certificateRepository,
    secretService: createDigitalCertificateSecretService({
      envelopeProvider: createSecretEnvelopeProvider(envelopeKeyRing),
    }),
  })
  return [
    ...createCompanySettingsRoutes({
      getSettings: createGetCompanySettingsUseCase({ repository: settingsRepository }),
      updateSettings: createUpdateCompanySettingsUseCase({
        fingerprintService,
        unitOfWork: settingsRepository,
      }),
    }),
    ...createDigitalCertificateRoutes({
      listCertificates: createListDigitalCertificatesUseCase({ repository: certificateRepository }),
      replaceCertificate: { execute: (input) => replace.executeWithOutcome(input) },
    }),
  ]
}

if (import.meta.main) {
  bootstrap()
}
