/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildCrewCostParcels, summarizeCrewCost } from './trip-crew-cost.policy.js'
import type { CrewCostInputs } from './trip-crew-cost.policy.js'

/**
 * Spec 327: o que se combinou pagar à tripulação de uma viagem **contra** o que a conta calcula
 * sozinha (diária do motorista e do ajudante). As duas contas usam a MESMA política
 * (`buildCrewCostParcels`); a única diferença é o valor informado: a segunda o ignora.
 */
export type CrewCostComparison = {
  /** Custo de tripulação sem nenhum valor informado: a diária estimada de sempre. */
  readonly calculatedAmount: string
  /** A conta calculada tem lacuna (ex.: duração desconhecida) — o número está incompleto. */
  readonly calculatedHasGaps: boolean
  /** Informado menos calculado, em centavos com sinal: positivo é pagar mais do que a conta previa. */
  readonly differenceAmount: string
  /** Custo de tripulação com o valor informado onde houver, e a diária calculada no resto. */
  readonly informedAmount: string
  /** O informado também tem lacuna (pessoa sem valor e sem duração): a diferença não é a real. */
  readonly informedHasGaps: boolean
  /** Quantas pessoas da viagem têm valor informado (zero é valor, não ausência). */
  readonly informedPeople: number
}

function hasPaid(member: { readonly paidAmount?: null | string }): boolean {
  return member.paidAmount !== null && member.paidAmount !== undefined
}

function toCents(amount: string): bigint {
  const negative = amount.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? amount.slice(1) : amount).split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2))

  return negative ? -cents : cents
}

function formatCents(cents: bigint): string {
  const negative = cents < 0n
  const absolute = negative ? -cents : cents
  const text = `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`

  return negative ? `-${text}` : text
}

export function buildCrewCostComparison(inputs: CrewCostInputs): CrewCostComparison {
  const informed = summarizeCrewCost(buildCrewCostParcels(inputs))
  const calculated = summarizeCrewCost(
    buildCrewCostParcels({
      ...inputs,
      crew: (inputs.crew ?? []).map((member) => ({ ...member, paidAmount: null })),
      helperCrew: (inputs.helperCrew ?? []).map((member) => ({ ...member, paidAmount: null })),
    }),
  )

  return {
    calculatedAmount: calculated.amount,
    calculatedHasGaps: calculated.hasGaps,
    differenceAmount: formatCents(toCents(informed.amount) - toCents(calculated.amount)),
    informedAmount: informed.amount,
    informedHasGaps: informed.hasGaps,
    informedPeople:
      (inputs.crew ?? []).filter(hasPaid).length + (inputs.helperCrew ?? []).filter(hasPaid).length,
  }
}
