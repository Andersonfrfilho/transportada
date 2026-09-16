/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type CargoSettings = {
  /** Spec 152 D14: ausência de linha é `false` — desligada em toda instalação nova. */
  readonly cameraMeasurementEnabled: boolean
  /** Nulo é estimativa desligada — e é o padrão de toda instalação nova. */
  readonly defaultVolumeWeight: string | null
}

export type CargoSettingsPort = {
  clearDefaultVolumeWeight(input: { readonly companyId: string }): Promise<void>
  load(input: { readonly companyId: string }): Promise<CargoSettings>
  saveDefaultVolumeWeight(input: {
    readonly companyId: string
    readonly defaultVolumeWeight: string
  }): Promise<void>
  setCameraMeasurementEnabled(input: {
    readonly companyId: string
    readonly enabled: boolean
  }): Promise<void>
}
