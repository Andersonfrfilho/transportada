/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { VALUATION_GAPS, type TripCostParcel, type ValuationGap } from './trip-valuation.policy.js'

const ERROR_CODE_PREFIX = 'TRIP_HELPER_COST'
const ZERO = '0.0000'
const SECONDS_PER_DAY = 86_400

/** Um ajudante da tripulação (`role = 'helper'`), com a diária própria — a ficha, não a empresa. */
export type TripHelperCostMember = {
  readonly driverId: string
  /** `fleet_drivers.helper_daily_rate`. `null` é "sem valor próprio", nunca zero (D2). */
  readonly ownDailyRate: null | string
}

export type BuildTripHelperCostParams = {
  /** `company_crew_settings.helper_daily_rate`. Vence quando o ajudante não tem valor próprio (D2). */
  readonly companyDailyRate: null | string
  readonly helpers: readonly TripHelperCostMember[]
  /** `trips.planned_journey_includes_return`. `null` acompanha `journeySeconds` nulo. */
  readonly journeyIncludesReturn: null | boolean
  /** `trips.planned_journey_seconds`, congelado junto do ETA (T6). `null` é "nunca planejado". */
  readonly journeySeconds: null | number
}

/**
 * D7: `Σ(diária própria do ajudante ?? diária geral da empresa) × dias`, com
 * `dias = max(1, ceil(jornada congelada / 24 h))`.
 *
 * As respostas possíveis, e por que:
 *
 * - **0 ajudantes** — parcela zero, sem lacuna: não há o que cobrar.
 * - **jornada nunca congelada** (`journeySeconds === null`) com ajudante na tripulação —
 *   `missing`: sem dias não há o que multiplicar, e o total silenciosamente zerado subestimaria a
 *   viagem (D7).
 * - **todo ajudante sem diária** (nem própria, nem geral) — `missing`, `HELPER_DAILY_RATE_MISSING`.
 * - **parte com diária, parte sem** — soma só quem tem valor e `detail` nomeia quantos faltam
 *   (`ausentes/total`, no molde de `buildIcmsParcel`); a lacuna continua a de diária, porque ela é
 *   quem o operador pode consertar.
 * - **jornada congelada só de ida** (`journeyIncludesReturn === false`) — a parcela tem valor
 *   (dias pela ida) e sai `estimated`, com o aviso `HELPER_JOURNEY_WITHOUT_RETURN` (não é lacuna:
 *   `ADVISORY_GAPS` a mantém fora de `hasGaps`) — nunca inventa a volta.
 */
export function buildTripHelperCost(input: BuildTripHelperCostParams): TripCostParcel {
  const { helpers } = input

  if (helpers.length === 0) {
    return { amount: ZERO, detail: null, gap: null, kind: 'helper', source: 'measured' }
  }

  if (input.journeySeconds === null) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.helperJourneyUnknown,
      kind: 'helper',
      source: 'missing',
    }
  }

  const dayCount = resolveHelperDayCount(input.journeySeconds)
  const resolved = helpers.map((helper) => ({
    helper,
    rate: helper.ownDailyRate ?? input.companyDailyRate,
  }))
  const known = resolved.filter((entry) => entry.rate !== null)
  const missingCount = resolved.length - known.length

  if (known.length === 0) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.helperDailyRateMissing,
      kind: 'helper',
      source: 'missing',
    }
  }

  const perDay = known.reduce(
    (accumulated, entry) =>
      accumulated +
      parseScaledDecimal({
        errorCodePrefix: ERROR_CODE_PREFIX,
        scale: MONEY_SCALE,
        value: entry.rate ?? ZERO,
      }),
    0n,
  )
  const total = perDay * BigInt(dayCount)

  return {
    amount: formatScaledDecimal(total, MONEY_SCALE),
    detail: missingCount === 0 ? null : `${missingCount}/${resolved.length}`,
    gap: resolveGap({ includesReturn: input.journeyIncludesReturn, missingCount }),
    kind: 'helper',
    source:
      missingCount > 0
        ? 'measured'
        : input.journeyIncludesReturn === false
          ? 'estimated'
          : 'measured',
  }
}

/** `max(1, ceil(jornada / 24h))` — D7. Exportada para a mesma conta na sugestão (T7). */
export function resolveHelperDayCount(journeySeconds: number): number {
  return Math.max(1, Math.ceil(journeySeconds / SECONDS_PER_DAY))
}

/**
 * Diária ausente é quem o operador resolve primeiro — a ficha ou o painel da frota. Sem a volta é
 * aviso: a conta já tem número, só falta uma perna do congelamento.
 */
function resolveGap(input: {
  readonly includesReturn: null | boolean
  readonly missingCount: number
}): null | ValuationGap {
  if (input.missingCount > 0) return VALUATION_GAPS.helperDailyRateMissing
  if (input.includesReturn === false) return VALUATION_GAPS.helperJourneyWithoutReturn

  return null
}
