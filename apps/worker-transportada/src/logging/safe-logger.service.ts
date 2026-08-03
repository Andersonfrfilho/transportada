/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { WorkerLogger } from '../shared/worker.types.js'

type SafeLogParams = {
  readonly logger: WorkerLogger
  readonly message: string
  readonly metadata?: Record<string, unknown>
}

export function safeLogInfo({ logger, message, metadata }: SafeLogParams): void {
  try {
    logger.info(message, metadata)
  } catch {
    // Observability must not break message handling or graceful shutdown.
  }
}

export function safeLogWarn({ logger, message, metadata }: SafeLogParams): void {
  try {
    logger.warn(message, metadata)
  } catch {
    // Observability must not break message handling or graceful shutdown.
  }
}

export function safeLogError({ logger, message, metadata }: SafeLogParams): void {
  try {
    logger.error(message, metadata)
  } catch {
    // Observability must not break message handling or graceful shutdown.
  }
}
