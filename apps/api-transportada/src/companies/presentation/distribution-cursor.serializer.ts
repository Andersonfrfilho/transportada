/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DistributionCursorStatus } from '../application/get-distribution-cursor.use-case.js'

export type SerializedDistributionCursor = {
  readonly consecutiveRateLimits: number
  readonly environment: string
  readonly lastSkipped: {
    readonly at: string
    readonly fromNsu: string
    readonly toNsu: string
  } | null
  readonly maxNsu: string
  readonly nextAllowedAt: string | null
  readonly ultNsu: string
  readonly updatedAt: string
}

export function serializeDistributionCursor(
  status: DistributionCursorStatus,
): SerializedDistributionCursor {
  return {
    consecutiveRateLimits: status.consecutiveRateLimits,
    environment: status.environment,
    lastSkipped: status.lastSkipped ?? null,
    maxNsu: status.maxNsu,
    nextAllowedAt: status.nextAllowedAt ?? null,
    ultNsu: status.ultNsu,
    updatedAt: status.updatedAt,
  }
}
