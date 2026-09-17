/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatFuelPricePerUnit } from '@/modules/company-settings/shared/fuelPrice.service'

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function formatChargeOrUnknown(value: string | null, unknownLabel: string): string {
  return value === null ? unknownLabel : formatFuelPricePerUnit(value)
}
