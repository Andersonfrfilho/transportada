/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O fator de cubagem por espécie (spec 075). Ele é o que estima o espaço que a carga ocupa, porque
 * a NF-e não traz medida nenhuma — e por isso muda a ocupação exibida nas viagens seguintes.
 *
 * ⚠️ Ao contrário do peso da spec 067, ele **não** alimenta documento fiscal: nem CT-e, nem MDF-e.
 * Ele existe para a tela de quem carrega o caminhão.
 */
import {
  DEFAULT_CARGO_VOLUME_SPECIES,
  type CargoVolumeFactor,
  type CargoVolumeFactorPort,
} from './cargo-volume-factor.port.js'

type Dependencies = { readonly factors: CargoVolumeFactorPort }

export function createListCargoVolumeFactorsUseCase(dependencies: Dependencies): {
  readonly execute: (input: { readonly companyId: string }) => Promise<readonly CargoVolumeFactor[]>
} {
  return { execute: (input) => dependencies.factors.list(input) }
}

export function createSaveCargoVolumeFactorUseCase(dependencies: Dependencies): {
  readonly execute: (input: {
    readonly companyId: string
    readonly species: string
    readonly volumePerUnitM3: string
  }) => Promise<readonly CargoVolumeFactor[]>
} {
  return {
    execute: async (input) => {
      await dependencies.factors.save(input)
      return dependencies.factors.list({ companyId: input.companyId })
    },
  }
}

/** Desligar a estimativa é **apagar a linha**, nunca gravar zero — o CHECK do banco recusa zero. */
export function createRemoveCargoVolumeFactorUseCase(dependencies: Dependencies): {
  readonly execute: (input: {
    readonly companyId: string
    readonly species?: string
  }) => Promise<void>
} {
  return {
    execute: (input) =>
      dependencies.factors.remove({
        companyId: input.companyId,
        species: input.species ?? DEFAULT_CARGO_VOLUME_SPECIES,
      }),
  }
}
