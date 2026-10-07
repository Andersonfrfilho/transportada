/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
  rescaleHalfUp,
} from '../../shared/decimal.service.js'
import { DAILY_ALLOWANCE_DAYS_ORIGIN, suggestAllowanceDays } from './daily-allowance.policy.js'
import {
  buildTripDriverCost,
  type TripCrewMember,
  type TripDriverCostDays,
} from './trip-driver-cost.policy.js'
import { buildTripHelperCost, type TripHelperCostMember } from './trip-helper-cost.policy.js'
import { isAdvisoryGap, type TripCostParcel } from './trip-valuation.policy.js'

/**
 * Spec 249 T1.1: o que o custo de tripulação lê da viagem. Os nomes são os de `TripValuationContext`
 * de propósito — a avaliação passa o próprio contexto, e a transferência monta isto em memória, sob
 * o lock, a partir das fichas e das diárias que acabou de ler.
 */
export type CrewCostInputs = {
  readonly companyDailyAllowanceAmount?: null | string
  readonly crew?: readonly TripCrewMember[]
  readonly dailyAllowanceDays?: null | number
  readonly estimatedDurationSeconds?: null | number
  readonly helperCompanyDailyRate?: null | string
  readonly helperCrew?: readonly TripHelperCostMember[]
  readonly journeyIncludesReturn?: null | boolean
  readonly journeySeconds?: null | number
}

export type CrewCostSummary = {
  readonly amount: string
  readonly hasGaps: boolean
}

export type BuildCrewCostDifferenceParams = {
  readonly after: CrewCostSummary
  readonly before: CrewCostSummary
}

export type CrewCostDifference = {
  readonly costAfter: string
  readonly costBefore: string
  readonly costDifference: string
  readonly costHasGaps: boolean
}

const CENTS_SCALE = 2n
const ERROR_CODE_PREFIX = 'TRIP_CREW_COST'

/**
 * ⚠️ Roteiro sem duração **não é viagem de um dia**: é viagem de duração desconhecida, e a política
 * responde por ela com lacuna. Tratar a ausência como zero segundo sugeria um dia calado, e a
 * viagem de três dias saía por um terço do custo do motorista numa margem de aparência fechada.
 */
export function resolveAllowanceDays(inputs: CrewCostInputs): TripDriverCostDays {
  const informedDays = inputs.dailyAllowanceDays ?? null
  if (informedDays !== null) {
    return { of: DAILY_ALLOWANCE_DAYS_ORIGIN.informed, value: informedDays }
  }

  const durationSeconds = inputs.estimatedDurationSeconds ?? null
  if (durationSeconds === null) return { of: 'unknown' }

  return { of: DAILY_ALLOWANCE_DAYS_ORIGIN.estimated, value: suggestAllowanceDays(durationSeconds) }
}

/**
 * As duas parcelas de tripulação, motorista e depois ajudante. É a única conta: `buildCostParcels`
 * (a avaliação da viagem) e a transferência de tripulação chamam esta função.
 *
 * Spec 143 D4: dias informados vencem a sugestão — quem lançou a viagem sabe o que ela vai durar
 * melhor do que a duração estimada do roteiro.
 */
export function buildCrewCostParcels(inputs: CrewCostInputs): readonly TripCostParcel[] {
  return [
    buildTripDriverCost({
      companyDailyAmount: inputs.companyDailyAllowanceAmount ?? null,
      crew: inputs.crew ?? [],
      days: resolveAllowanceDays(inputs),
    }),
    buildTripHelperCost({
      companyDailyRate: inputs.helperCompanyDailyRate ?? null,
      helpers: inputs.helperCrew ?? [],
      journeyIncludesReturn: inputs.journeyIncludesReturn ?? null,
      journeySeconds: inputs.journeySeconds ?? null,
    }),
  ]
}

/**
 * O total em centavos (`numeric(14,2)` do evento) e se alguma parcela tem lacuna. Aviso
 * (`HELPER_JOURNEY_WITHOUT_RETURN`) não é lacuna: o número já está completo.
 */
export function summarizeCrewCost(parcels: readonly TripCostParcel[]): CrewCostSummary {
  const total = parcels.reduce((accumulated, parcel) => accumulated + toMoneyUnits(parcel), 0n)
  const cents = rescaleHalfUp({ fromScale: MONEY_SCALE, toScale: CENTS_SCALE, value: total })

  return {
    amount: formatScaledDecimal(cents, CENTS_SCALE),
    hasGaps: parcels.some((parcel) => parcel.gap !== null && !isAdvisoryGap(parcel.gap)),
  }
}

/**
 * Spec 249 D7: a diferença é `depois − antes` **sobre os valores já arredondados**, então
 * `antes + diferença === depois` em centavos sempre fecha. Lacuna em qualquer dos dois lados marca
 * o evento: a diferença de uma conta incompleta não é a diferença real.
 */
export function buildCrewCostDifference({
  after,
  before,
}: BuildCrewCostDifferenceParams): CrewCostDifference {
  const difference = toCents(after.amount) - toCents(before.amount)

  return {
    costAfter: after.amount,
    costBefore: before.amount,
    costDifference: formatScaledDecimal(difference, CENTS_SCALE),
    costHasGaps: after.hasGaps || before.hasGaps,
  }
}

function toMoneyUnits(parcel: TripCostParcel): bigint {
  return parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: MONEY_SCALE,
    value: parcel.amount,
  })
}

function toCents(amount: string): bigint {
  return BigInt(amount.replace('.', ''))
}
