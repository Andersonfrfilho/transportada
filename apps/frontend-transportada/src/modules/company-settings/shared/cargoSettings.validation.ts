/* Copyright (c) 2026 Ada Technology. MIT License. */

export type CargoSettings = Readonly<{
  /** Spec 152 D14: ausência de linha na API é `false` — desligada em toda instalação nova. */
  cameraMeasurementEnabled: boolean
  /** Nulo é estimativa desligada: a nota sem peso segue bloqueada para CT-e. */
  defaultVolumeWeight: string | null
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isCargoSettings(value: unknown): value is CargoSettings {
  if (!isRecord(value)) return false
  const weight = value.defaultVolumeWeight
  return (
    typeof value.cameraMeasurementEnabled === 'boolean' &&
    (weight === null || typeof weight === 'string')
  )
}

export function isCargoSettingsResponse(
  value: unknown,
): value is Readonly<{ data: CargoSettings }> {
  return isRecord(value) && isCargoSettings(value.data)
}
