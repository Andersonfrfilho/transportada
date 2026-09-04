/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/** A espécie vazia é a linha padrão — e hoje é a única que existe (spec 075 D1). */
export const DEFAULT_CARGO_VOLUME_SPECIES = ''

export type CargoVolumeFactor = {
  readonly species: string
  readonly volumePerUnitM3: string
}

export type CargoVolumeFactorPort = {
  list(input: { readonly companyId: string }): Promise<readonly CargoVolumeFactor[]>
  remove(input: { readonly companyId: string; readonly species: string }): Promise<void>
  save(input: {
    readonly companyId: string
    readonly species: string
    readonly volumePerUnitM3: string
  }): Promise<void>
}
