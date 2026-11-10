/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Cópia por valor das faixas da API (`DRIVER_STOP_REMINDER_SETTINGS_RANGE`, spec 299 RF19): o contrato
 * `driver-stop-reminder-panel.contract.ts` lê o arquivo da API e reprova se um número divergir.
 */
export const DRIVER_STOP_REMINDER_RANGE = {
  dwellMinutes: { max: 240, min: 5 },
  graceMinMinutes: { max: 240, min: 5 },
  gracePercent: { max: 100, min: 0 },
  idleMinutes: { max: 240, min: 10 },
  intervalMinutes: { max: 120, min: 10 },
  maxAttempts: { max: 5, min: 1 },
} as const

export const DRIVER_STOP_REMINDER_MAX_RANGES_PER_WEEKDAY = 3

export const DRIVER_STOP_REMINDER_NUMBER_FIELDS = [
  'maxAttempts',
  'intervalMinutes',
  'graceMinMinutes',
  'gracePercent',
  'dwellMinutes',
  'idleMinutes',
] as const

export type DriverStopReminderNumberField = (typeof DRIVER_STOP_REMINDER_NUMBER_FIELDS)[number]

export const DRIVER_STOP_REMINDER_ORIGINS = ['company', 'default'] as const

export type DriverStopReminderOrigin = (typeof DRIVER_STOP_REMINDER_ORIGINS)[number]

/** Dia da semana como a API grava: 0 = domingo … 6 = sábado. */
export type DriverStopReminderOperatingRange = Readonly<{
  end: string
  start: string
  weekday: number
}>

export type DriverStopReminderBody = Readonly<
  Record<DriverStopReminderNumberField, number> & {
    enabled: boolean
    operatingHours: readonly DriverStopReminderOperatingRange[]
  }
>

export type DriverStopReminderSettings = DriverStopReminderBody &
  Readonly<{ origin: DriverStopReminderOrigin; updatedAt: string | null }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOperatingRange(value: unknown): value is DriverStopReminderOperatingRange {
  return (
    isRecord(value) &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    Number.isInteger(value.weekday)
  )
}

export function isDriverStopReminderSettings(value: unknown): value is DriverStopReminderSettings {
  return (
    isRecord(value) &&
    typeof value.enabled === 'boolean' &&
    DRIVER_STOP_REMINDER_NUMBER_FIELDS.every((field) => typeof value[field] === 'number') &&
    Array.isArray(value.operatingHours) &&
    value.operatingHours.every(isOperatingRange) &&
    DRIVER_STOP_REMINDER_ORIGINS.some((origin) => origin === value.origin) &&
    (value.updatedAt === null || typeof value.updatedAt === 'string')
  )
}

export function isDriverStopReminderResponse(
  value: unknown,
): value is Readonly<{ data: DriverStopReminderSettings }> {
  return isRecord(value) && 'data' in value && isDriverStopReminderSettings(value.data)
}
