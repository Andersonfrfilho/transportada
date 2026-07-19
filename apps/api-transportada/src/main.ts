/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'

import { parseEnvironment } from './config/environment.schema'
import { HealthService } from './health/health.service'
import { AuthenticationService } from './identity/application/authentication.service'
import { DrizzleExternalIdentityRepository } from './identity/infrastructure/drizzle-external-identity.repository'
import { createKeycloakAccessTokenVerifier } from './identity/infrastructure/keycloak-jwt.gateway'
import {
  createShutdownHandler,
  registerShutdownSignals,
  startApiServer,
} from './server/server.service'

export function bootstrap(): Bun.Server<undefined> {
  const config = parseEnvironment(process.env)
  const logger = createLogger({
    logLevel: config.logLevel,
    pretty: config.appEnv !== 'production',
    projectName: 'transportada-api',
    version: '0.1.0',
  })
  const verifier = createKeycloakAccessTokenVerifier(config.keycloak)
  const database = createDrizzleProvider({ connection: config.databaseUrl })
  const authentication = new AuthenticationService({
    repository: new DrizzleExternalIdentityRepository(database.db),
    verifier,
  })
  const healthService = new HealthService({ database })
  const server = startApiServer({ authentication, config, healthService, logger })
  const shutdown = createShutdownHandler({ database, logger, server })

  registerShutdownSignals({ logger, shutdown })
  logger.info('api_started', {
    environment: config.appEnv,
    hostname: server.hostname,
    port: server.port,
  })

  return server
}

if (import.meta.main) {
  bootstrap()
}
