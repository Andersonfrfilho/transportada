/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Serializador único do status: a rota de configurações e a de importações
 * devolvem o mesmo bloco. Duas cópias divergiriam no primeiro campo novo.
 */
import type { ScheduledDistributionStatus } from '../application/get-scheduled-distribution-status.use-case.js'

export type SerializedScheduledDistributionStatus = {
  readonly certificateExpiresAt: string | null
  readonly eligible: boolean
  readonly enabled: boolean
  readonly ineligibilityReason: string | null
  readonly lastAutomationImport: {
    readonly finishedAt: string | null
    readonly receivedCount: number
    readonly startedAt: string
    readonly status: string
  } | null
  readonly nextAllowedAt: string | null
  readonly nextScheduledRunAt: string
}

export function serializeScheduledDistributionStatus(
  status: ScheduledDistributionStatus,
): SerializedScheduledDistributionStatus {
  return {
    certificateExpiresAt: status.certificateExpiresAt ?? null,
    eligible: status.eligible,
    enabled: status.enabled,
    ineligibilityReason: status.ineligibilityReason ?? null,
    lastAutomationImport:
      status.lastAutomationImport === undefined
        ? null
        : {
            finishedAt: status.lastAutomationImport.finishedAt ?? null,
            receivedCount: status.lastAutomationImport.receivedCount,
            startedAt: status.lastAutomationImport.startedAt,
            status: status.lastAutomationImport.status,
          },
    nextAllowedAt: status.nextAllowedAt ?? null,
    nextScheduledRunAt: status.nextScheduledRunAt,
  }
}
