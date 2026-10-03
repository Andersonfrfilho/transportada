/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239: a empresa liga, ajusta e desliga o expurgo da posição dos eventos da viagem. A API grava
 * o que a empresa afirma; a carência de 24 h e a trilha de auditoria nascem na escrita.
 */
import { sumImpactCounts } from '../domain/location-retention-impact.policy.js'
import type {
  LocationRetentionActor,
  LocationRetentionImpactEntry,
  LocationRetentionSettings,
  LocationRetentionSettingsPort,
} from './location-retention-settings.port.js'

type Dependencies = {
  readonly now: () => Date
  readonly settings: LocationRetentionSettingsPort
}

export function createGetLocationRetentionSettingsUseCase(
  dependencies: Pick<Dependencies, 'settings'>,
): {
  readonly execute: (input: {
    readonly companyId: string
  }) => Promise<LocationRetentionSettings | null>
} {
  return { execute: (input) => dependencies.settings.find({ companyId: input.companyId }) }
}

export function createSaveLocationRetentionSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (
    input: LocationRetentionActor & {
      readonly purgeEnabled: boolean
      readonly retentionDays: number
    },
  ) => Promise<LocationRetentionSettings>
} {
  return {
    execute: async (input) => {
      const now = dependencies.now()
      const affectedEstimate = input.purgeEnabled
        ? sumImpactCounts(
            await dependencies.settings.countImpact({
              companyId: input.companyId,
              now,
              retentionDays: input.retentionDays,
            }),
          )
        : null

      return dependencies.settings.save({
        affectedEstimate,
        companyId: input.companyId,
        correlationId: input.correlationId,
        ipAddress: input.ipAddress,
        next: { purgeEnabled: input.purgeEnabled, retentionDays: input.retentionDays },
        now,
        userId: input.userId,
      })
    },
  }
}

/** Voltar ao padrão do sistema. Sem linha o repositório não audita: apagar o nada não é mudança. */
export function createClearLocationRetentionSettingsUseCase(
  dependencies: Pick<Dependencies, 'settings'>,
): { readonly execute: (input: LocationRetentionActor) => Promise<void> } {
  return { execute: (input) => dependencies.settings.clear(input) }
}

export function createReadLocationRetentionImpactUseCase(dependencies: Dependencies): {
  readonly execute: (input: {
    readonly companyId: string
    readonly retentionDays: number
  }) => Promise<readonly LocationRetentionImpactEntry[]>
} {
  return {
    execute: (input) =>
      dependencies.settings.countImpact({
        companyId: input.companyId,
        now: dependencies.now(),
        retentionDays: input.retentionDays,
      }),
  }
}
