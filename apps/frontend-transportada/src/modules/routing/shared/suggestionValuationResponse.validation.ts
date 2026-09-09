/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 101: a guarda do corpo de `GET /route-suggestions/:id/valuation`.
 *
 * ⚠️ A conta de cada veículo passa pelo **mesmo** `toTripValuation` do painel da viagem: é a mesma
 * forma, servida pela mesma função da API (`buildValuationFromContext`), e uma segunda validação
 * divergiria calada no dia em que a conta ganhasse um campo.
 */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'
import { toTripValuation } from '@/modules/trip-financials/shared/tripValuationResponse.validation'

import {
  SUGGESTION_VALUATION_REPORT_KEYS,
  SUGGESTION_VEHICLE_VALUATION_KEYS,
  type SuggestionValuation,
  type SuggestionVehicleValuation,
} from './suggestionValuation.service'

/**
 * Corpo malformado vira **ausência**, não exceção — mesma regra do painel da viagem: a conta é
 * informação de apoio, e derrubar o diálogo da distribuição por causa dela trocaria o problema de
 * lugar.
 */
export function toSuggestionValuation(envelope: unknown): SuggestionValuation | null {
  if (!isRecord(envelope)) return null
  const payload = isRecord(envelope.data) ? envelope.data : envelope

  const report = payload.report
  if (!hasExactKeys(report, [...SUGGESTION_VALUATION_REPORT_KEYS])) return null
  if (typeof report.hasGaps !== 'boolean') return null

  const rawVehicles = Array.isArray(payload.vehicles) ? payload.vehicles : null
  if (rawVehicles === null) return null

  const vehicles: SuggestionVehicleValuation[] = []
  for (const raw of rawVehicles) {
    const vehicle = toVehicle(raw)
    /** Um veículo malformado invalida o corpo inteiro: meia distribuição não é distribuição. */
    if (vehicle === null) return null
    vehicles.push(vehicle)
  }

  return {
    report: {
      gaps: Array.isArray(report.gaps) ? report.gaps.filter(isText) : [],
      hasGaps: report.hasGaps,
      totalCost: readText(report.totalCost),
      totalDistanceMeters: readNumber(report.totalDistanceMeters),
      totalDurationSeconds: readNumber(report.totalDurationSeconds),
      totalMargin: readText(report.totalMargin),
      totalRevenue: readText(report.totalRevenue),
    },
    vehicles,
  }
}

function toVehicle(raw: unknown): SuggestionVehicleValuation | null {
  if (!hasExactKeys(raw, [...SUGGESTION_VEHICLE_VALUATION_KEYS])) return null
  if (typeof raw.vehicleId !== 'string' || raw.vehicleId === '') return null

  /** A conta vem **crua**, sem envelope: `toTripValuation` aceita as duas formas. */
  const valuation = toTripValuation(raw.valuation)
  if (valuation === null) return null

  return {
    distanceMeters: readNumber(raw.distanceMeters),
    documentCount: readCount(raw.documentCount),
    driverId: typeof raw.driverId === 'string' && raw.driverId !== '' ? raw.driverId : null,
    durationSeconds: readNumber(raw.durationSeconds),
    stopCount: readCount(raw.stopCount),
    valuation,
    vehicleId: raw.vehicleId,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : '0.0000'
}

/** ⚠️ `null` é ausência de medida e sobrevive: virar zero faria a margem parecer melhor do que é. */
function readNumber(value: unknown): null | number {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
