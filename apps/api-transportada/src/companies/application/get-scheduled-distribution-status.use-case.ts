/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Diagnóstico da distribuição agendada para a tela: se está ligada, se o cron
 * conseguiria puxar, o que falta quando não conseguiria, e o que o último ciclo
 * automático trouxe.
 */
import {
  evaluateDistributionEligibility,
  type DistributionIneligibilityReason,
} from '../domain/distribution-eligibility.policy.js'
import { resolveNextScheduledRunAt } from '../domain/scheduled-distribution-window.policy.js'
import type {
  ScheduledDistributionImportFacts,
  ScheduledDistributionStatusPort,
} from './scheduled-distribution-status.port.js'

export type ScheduledDistributionImportStatus = {
  readonly finishedAt: string | undefined
  readonly receivedCount: number
  readonly startedAt: string
  readonly status: string
}

export type ScheduledDistributionStatus = {
  readonly certificateExpiresAt: string | undefined
  readonly companyId: string
  readonly eligible: boolean
  readonly enabled: boolean
  readonly ineligibilityReason: DistributionIneligibilityReason | undefined
  readonly lastAutomationImport: ScheduledDistributionImportStatus | undefined
  readonly nextAllowedAt: string | undefined
  /** Quando o cron roda de novo — independente do cooldown da SEFAZ e do opt-in da empresa. */
  readonly nextScheduledRunAt: string
}

type Clock = { readonly now: () => Date }

export function createGetScheduledDistributionStatusUseCase(dependencies: {
  readonly clock: Clock
  readonly port: ScheduledDistributionStatusPort
  readonly scheduledDistributionCron: string
}): {
  readonly execute: (input: { readonly companyId: string }) => Promise<ScheduledDistributionStatus>
} {
  return {
    execute: async ({ companyId }) => {
      const now = dependencies.clock.now()
      const facts = await dependencies.port.loadStatusFacts({ companyId })
      const eligibility = evaluateDistributionEligibility({
        facts: {
          certificate: facts.certificate,
          companyStatus: facts.companyStatus,
          hasSyntheticMembership: facts.hasSyntheticMembership,
          nextAllowedAt: facts.nextAllowedAt,
          scheduledDistributionEnabled: facts.scheduledDistributionEnabled,
        },
        now,
      })

      return {
        certificateExpiresAt: facts.certificate?.expiresAt.toISOString(),
        companyId,
        eligible: eligibility.eligible,
        enabled: facts.scheduledDistributionEnabled,
        ineligibilityReason: eligibility.eligible ? undefined : eligibility.reason,
        lastAutomationImport: toImportStatus(facts.lastAutomationImport),
        nextAllowedAt: facts.nextAllowedAt?.toISOString(),
        nextScheduledRunAt: resolveNextScheduledRunAt({
          cronExpression: dependencies.scheduledDistributionCron,
          from: now,
        }).toISOString(),
      }
    },
  }
}

function toImportStatus(
  lastImport: ScheduledDistributionImportFacts | undefined,
): ScheduledDistributionImportStatus | undefined {
  if (lastImport === undefined) return undefined
  return {
    finishedAt: lastImport.finishedAt?.toISOString(),
    receivedCount: lastImport.receivedCount,
    startedAt: lastImport.startedAt.toISOString(),
    status: lastImport.status,
  }
}
