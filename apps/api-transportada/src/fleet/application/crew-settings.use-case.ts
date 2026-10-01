/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A diária padrão do ajudante (spec 149 D2). A diária própria da ficha do motorista vence esta
 * quando existe — este parâmetro só entra na conta de quem não tem valor próprio.
 */
import type { CrewSettings, CrewSettingsPort } from './crew-settings.port.js'

type Dependencies = { readonly crewSettings: CrewSettingsPort }

export function createGetCrewSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (input: { readonly companyId: string }) => Promise<CrewSettings>
} {
  return { execute: (input) => dependencies.crewSettings.load(input) }
}

export function createSetCrewSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (input: {
    readonly companyId: string
    readonly helperDailyRate: string | null
  }) => Promise<CrewSettings>
} {
  return {
    execute: async (input) => {
      await dependencies.crewSettings.save(input)
      return dependencies.crewSettings.load({ companyId: input.companyId })
    },
  }
}
