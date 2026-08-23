/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './companySettingsResponse.validation'

const SETTINGS_KEYS = ['adjustmentFactor', 'distributorCode', 'distributors']
const DISTRIBUTOR_KEYS = ['code', 'taxId']
const ADJUSTMENT_FACTOR = /^[0-9]\.[0-9]{4}$/u
const TAX_ID = /^[A-Z0-9]{12}[0-9]{2}$/u

/**
 * A distribuidora que a coleta publicou. `taxId` nulo é a escolha órfã — a empresa configurou uma
 * distribuidora que a publicação seguinte não trouxe, e ela continua na lista para ser vista antes
 * de ser trocada.
 */
export type EnergyDistributor = Readonly<{
  code: string
  taxId: string | null
}>

export type EnergySettings = Readonly<{
  adjustmentFactor: string
  distributorCode: string | null
  distributors: readonly EnergyDistributor[]
}>

export type EnergySettingsResponse = Readonly<{ data: EnergySettings }>

function hasExactKeys(
  input: Readonly<{ keys: readonly string[]; value: Record<string, unknown> }>,
): boolean {
  const currentKeys = Object.keys(input.value).sort()
  const expectedKeys = [...input.keys].sort()
  return (
    currentKeys.length === expectedKeys.length &&
    currentKeys.every((key, index) => key === expectedKeys[index])
  )
}

function isEnergyDistributor(value: unknown): value is EnergyDistributor {
  if (!isRecord(value) || !hasExactKeys({ keys: DISTRIBUTOR_KEYS, value })) return false
  return (
    typeof value.code === 'string' &&
    value.code.length > 0 &&
    (value.taxId === null || (typeof value.taxId === 'string' && TAX_ID.test(value.taxId)))
  )
}

export function isEnergySettings(value: unknown): value is EnergySettings {
  if (!isRecord(value) || !hasExactKeys({ keys: SETTINGS_KEYS, value })) return false
  return (
    typeof value.adjustmentFactor === 'string' &&
    ADJUSTMENT_FACTOR.test(value.adjustmentFactor) &&
    (value.distributorCode === null ||
      (typeof value.distributorCode === 'string' && value.distributorCode.length > 0)) &&
    Array.isArray(value.distributors) &&
    value.distributors.every(isEnergyDistributor)
  )
}

export function isEnergySettingsResponse(value: unknown): value is EnergySettingsResponse {
  return isRecord(value) && hasExactKeys({ keys: ['data'], value }) && isEnergySettings(value.data)
}
