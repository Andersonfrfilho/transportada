/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WorkerHealthService } from '../health/health.service.js'
import { createHealthRequestHandler } from '../http/health-request-handler.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

export function startHealthServer(params: {
  readonly config: WorkerEnvironment
  readonly healthService: WorkerHealthService
  readonly logger: WorkerLogger
}): Bun.Server<undefined> {
  return Bun.serve({
    fetch: createHealthRequestHandler({
      healthService: params.healthService,
      logger: params.logger,
    }),
    hostname: '0.0.0.0',
    idleTimeout: 10,
    maxRequestBodySize: 64 * 1024,
    port: params.config.port,
  })
}
