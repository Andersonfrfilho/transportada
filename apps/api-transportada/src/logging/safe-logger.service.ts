/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiLogger } from '../shared/api.types'

type SafeLogParams = {
  readonly logger: ApiLogger
  readonly message: string
  readonly metadata?: Record<string, unknown>
}

export function safeLogInfo({ logger, message, metadata }: SafeLogParams): void {
  try {
    logger.info(message, metadata)
  } catch {
    // Logging must never break request handling or graceful shutdown.
  }
}

export function safeLogError({ logger, message, metadata }: SafeLogParams): void {
  try {
    logger.error(message, metadata)
  } catch {
    // Logging must never break request handling or graceful shutdown.
  }
}
