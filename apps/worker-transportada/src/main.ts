/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'
import { createRabbitMqProvider, type RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { parseWorkerEnvironment } from './config/environment.schema.js'
import { WorkerHealthService } from './health/health.service.js'
import { safeLogInfo } from './logging/safe-logger.service.js'
import { buildRabbitMqTopology } from './messaging/rabbitmq-topology.js'
import { startFoundationSyntheticConsumer } from './runtime/foundation-synthetic-consumer.service.js'
import { registerWorkerShutdownSignals } from './runtime/shutdown-signals.service.js'
import { WorkerShutdown } from './runtime/worker-shutdown.service.js'
import { startHealthServer } from './server/health-server.service.js'

export async function bootstrap(
  params: {
    readonly environment?: Record<string, string | undefined>
  } = {},
): Promise<Bun.Server<undefined>> {
  const config = parseWorkerEnvironment(params.environment ?? process.env)
  const logger = createLogger({
    logLevel: config.logLevel,
    pretty: config.appEnv !== 'production',
    projectName: 'transportada-worker',
    version: '0.1.0',
  })
  const database = createDrizzleProvider({ connection: config.databaseUrl })
  let provider: RabbitMqProvider | undefined
  let healthServer: Bun.Server<undefined> | undefined

  try {
    provider = await createRabbitMqProvider({
      connection: config.rabbitMqUrl,
      topology: buildRabbitMqTopology(`${config.queuePrefix}.synthetic.v1`),
    })
    const healthService = new WorkerHealthService({
      database,
      rabbitMq: provider,
    })
    healthServer = startHealthServer({
      config,
      healthService,
      logger,
    })
    const consumer = await startFoundationSyntheticConsumer({
      config,
      logger,
      provider,
    })
    const shutdown = new WorkerShutdown({
      ...(consumer ? { consumer } : {}),
      database,
      healthServer,
      provider,
    })
    registerWorkerShutdownSignals({ logger, shutdown })
    safeLogInfo({
      logger,
      message: 'worker_started',
      metadata: {
        environment: config.appEnv,
        foundationSyntheticConsumerEnabled: config.foundationSyntheticConsumerEnabled,
        port: healthServer.port,
      },
    })

    return healthServer
  } catch (error: unknown) {
    await healthServer?.stop().catch(() => undefined)
    await provider?.close().catch(() => undefined)
    await database.close().catch(() => undefined)
    throw error
  }
}

if (import.meta.main) {
  void bootstrap().catch(() => {
    process.stderr.write('worker_startup_failed\n')
    process.exitCode = 1
  })
}
