/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRequestHandler, createServerErrorHandler } from '../http/request-handler.service'
import type { HttpRouter } from '../http/router.service'
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
  readonly captureError?: (error: unknown) => void
  readonly config: ApiEnvironment
  readonly logger: ApiLogger
  readonly router: HttpRouter
}

export function startApiServer({
  captureError,
  config,
  logger,
  router,
}: StartApiServerParams): Bun.Server<undefined> {
  const handle = createRequestHandler({
    ...(captureError === undefined ? {} : { captureError }),
    frontendOrigin: config.frontendOrigin,
    logger,
    requestTimeoutSeconds: REQUEST_TIMEOUT_SECONDS,
    router,
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
  /** Última chance de esvaziar a fila do rastreio antes do processo sumir. */
  readonly drainErrorTracker?: () => Promise<void>
  readonly logger: ApiLogger
  readonly server: StoppableServer
}

export function createShutdownHandler({
  database,
  drainErrorTracker = () => Promise.resolve(),
  logger,
  server,
}: CreateShutdownHandlerParams): (signal: NodeJS.Signals) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined

  return (signal: NodeJS.Signals): Promise<void> => {
    shutdownPromise ??= shutdown({ database, drainErrorTracker, logger, server, signal })
    return shutdownPromise
  }
}

type ShutdownParams = Omit<CreateShutdownHandlerParams, 'drainErrorTracker'> & {
  readonly drainErrorTracker: () => Promise<void>
  readonly signal: NodeJS.Signals
}

async function shutdown({
  database,
  drainErrorTracker,
  logger,
  server,
  signal,
}: ShutdownParams): Promise<void> {
  safeLogInfo({
    logger,
    message: 'api_shutdown_started',
    metadata: { signal },
  })
  try {
    await server.stop()
  } finally {
    await database.close()
    await drainErrorTracker()
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
