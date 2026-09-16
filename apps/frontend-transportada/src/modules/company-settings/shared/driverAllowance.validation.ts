/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Cópia por valor da API (`DAILY_ALLOWANCE_RATE_ORIGIN`): só `company`/`default` chegam aqui — o
 * terceiro valor, `driver`, é do lançamento na viagem, nunca desta tela de empresa.
 */
export const DRIVER_ALLOWANCE_RATE_ORIGINS = ['company', 'default'] as const

export type DriverAllowanceRateOrigin = (typeof DRIVER_ALLOWANCE_RATE_ORIGINS)[number]

/** Sem linha gravada é resposta válida (padrão do sistema), então `amount` sempre chega preenchido. */
export type DriverAllowanceSettings = Readonly<{
  amount: string
  rateOrigin: DriverAllowanceRateOrigin
  updatedAt: string | null
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isDriverAllowanceRateOrigin(value: unknown): value is DriverAllowanceRateOrigin {
  return DRIVER_ALLOWANCE_RATE_ORIGINS.some((origin) => origin === value)
}

export function isDriverAllowanceSettings(value: unknown): value is DriverAllowanceSettings {
  return (
    isRecord(value) &&
    typeof value.amount === 'string' &&
    isDriverAllowanceRateOrigin(value.rateOrigin) &&
    (value.updatedAt === null || typeof value.updatedAt === 'string')
  )
}

export function isDriverAllowanceResponse(
  value: unknown,
): value is Readonly<{ data: DriverAllowanceSettings }> {
  return isRecord(value) && 'data' in value && isDriverAllowanceSettings(value.data)
}
