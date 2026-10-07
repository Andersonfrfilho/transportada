/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Diária geral do ajudante: `null` é "sem valor padrão", e a conta da viagem aponta a lacuna. */
export type CrewSettings = Readonly<{ helperDailyRate: null | string }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCrewSettings(value: unknown): value is CrewSettings {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)

  return (
    keys.length === 1 &&
    keys[0] === 'helperDailyRate' &&
    (value.helperDailyRate === null || typeof value.helperDailyRate === 'string')
  )
}

export function isCrewSettingsResponse(value: unknown): value is Readonly<{ data: CrewSettings }> {
  return isRecord(value) && Object.keys(value).length === 1 && isCrewSettings(value.data)
}
