/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O peso padrão por volume da empresa (spec 067). Ele é o que estima a carga de uma nota cujo
 * emitente não declarou massa, e por isso muda o que vai para a SEFAZ nas emissões seguintes —
 * nunca no que já congelou em payload.
 */
import type { CargoSettings, CargoSettingsPort } from './cargo-settings.port.js'

type Dependencies = { readonly cargoSettings: CargoSettingsPort }

export function createGetCargoSettingsUseCase(dependencies: Dependencies): {
  readonly execute: (input: { readonly companyId: string }) => Promise<CargoSettings>
} {
  return { execute: (input) => dependencies.cargoSettings.load(input) }
}

export function createSetDefaultVolumeWeightUseCase(dependencies: Dependencies): {
  readonly execute: (input: {
    readonly companyId: string
    readonly defaultVolumeWeight: string
  }) => Promise<CargoSettings>
} {
  return {
    execute: async (input) => {
      await dependencies.cargoSettings.saveDefaultVolumeWeight(input)
      return dependencies.cargoSettings.load({ companyId: input.companyId })
    },
  }
}

export function createClearDefaultVolumeWeightUseCase(dependencies: Dependencies): {
  readonly execute: (input: { readonly companyId: string }) => Promise<void>
} {
  return { execute: (input) => dependencies.cargoSettings.clearDefaultVolumeWeight(input) }
}
