/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { HealthService } from '../health/health.service'
import { createRequestHandler, createServerErrorHandler } from '../http/request-handler.service'
import type { AuthenticationPort } from '../identity/application/identity.port'
import type { TenantContextService } from '../identity/application/tenant-context.service'
import { safeLogError, safeLogInfo } from '../logging/safe-logger.service'
import {
  API_HOSTNAME,
  IDLE_TIMEOUT_SECONDS,
  REQUEST_TIMEOUT_SECONDS,
  SERVER_MAX_REQUEST_BODY_SIZE_BYTES,
} from '../shared/api.constant'
import type {
  ApiEnvironment,
  ApiLogger,
  DatabaseHealthPort,
  StoppableServer,
} from '../shared/api.types'

type StartApiServerParams = {
  readonly authentication: AuthenticationPort
  readonly config: ApiEnvironment
  readonly healthService: HealthService
  readonly logger: ApiLogger
  readonly tenantContext: TenantContextService
}

export function startApiServer({
  authentication,
  config,
  healthService,
  logger,
  tenantContext,
}: StartApiServerParams): Bun.Server<undefined> {
  const handle = createRequestHandler({
    authentication,
    healthService,
    logger,
    requestTimeoutSeconds: REQUEST_TIMEOUT_SECONDS,
    tenantContext,
  })

  return Bun.serve({
    error: createServerErrorHandler({ logger }),
    fetch: handle,
    hostname: API_HOSTNAME,
    idleTimeout: IDLE_TIMEOUT_SECONDS,
    maxRequestBodySize: SERVER_MAX_REQUEST_BODY_SIZE_BYTES,
    port: config.port,
  })
}

type CreateShutdownHandlerParams = {
  readonly database: DatabaseHealthPort
  readonly logger: ApiLogger
  readonly server: StoppableServer
}

export function createShutdownHandler({
  database,
  logger,
  server,
}: CreateShutdownHandlerParams): (signal: NodeJS.Signals) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined

  return (signal: NodeJS.Signals): Promise<void> => {
    shutdownPromise ??= shutdown({ database, logger, server, signal })
    return shutdownPromise
  }
}

type ShutdownParams = CreateShutdownHandlerParams & {
  readonly signal: NodeJS.Signals
}

async function shutdown({ database, logger, server, signal }: ShutdownParams): Promise<void> {
  safeLogInfo({
    logger,
    message: 'api_shutdown_started',
    metadata: { signal },
  })
  try {
    await server.stop()
  } finally {
    await database.close()
  }
  safeLogInfo({
    logger,
    message: 'api_shutdown_completed',
    metadata: { signal },
  })
}

type RegisterShutdownSignalsParams = {
  readonly logger: ApiLogger
  readonly shutdown: (signal: NodeJS.Signals) => Promise<void>
}

export function registerShutdownSignals({ logger, shutdown }: RegisterShutdownSignalsParams): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdown(signal).catch(() => {
        process.exitCode = 1
        safeLogError({
          logger,
          message: 'api_shutdown_failed',
          metadata: { signal },
        })
      })
    })
  }
}
