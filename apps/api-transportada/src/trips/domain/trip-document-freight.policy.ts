/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  resolveDocumentFreight,
  type DocumentFreightRule,
} from '../../nfe-documents/domain/document-freight.policy.js'
import type { FreightCalculationStatus } from '../../database/freight.schema.js'

export type { DocumentFreightRule } from '../../nfe-documents/domain/document-freight.policy.js'

/**
 * O mesmo vocabulário de `TripAmounts.revenueSource` (spec 065 D7): `measured` é o cálculo
 * guardado, `estimated` é a previsão pela parametrização vigente, `missing` é "não há como dizer" —
 * nunca zero.
 */
export type TripDocumentFreightSource = 'estimated' | 'measured' | 'missing'

export type ResolvedTripDocumentFreight = {
  readonly amount: null | string
  /**
   * ⚠️ No caminho `measured`, `rule_snapshot` (`freight_calculations`) não carrega o nome da regra
   * — só o percentual e os limites. `null` aqui é lacuna real, não ausência de regra: o valor existe
   * e o nome que o produziu não foi congelado. A tela não inventa rótulo para preencher o buraco.
   */
  readonly ruleName: null | string
  readonly source: TripDocumentFreightSource
}

export type TripDocumentFreightNote = {
  readonly destinationCityCode: null | string
  readonly destinationState: null | string
  readonly issuedAt: Date | null
  readonly senderTaxId: null | string
  readonly totalAmount: null | string
}

export type ResolveTripDocumentFreightInput = {
  /** `null` quando a nota chegou só por cálculo de frete — o caminho `measured`, sem vínculo direto. */
  readonly note: TripDocumentFreightNote | null
  readonly freightCalculationStatus: FreightCalculationStatus | null
  readonly freightCalculationTotalAmount: null | string
  readonly rules: readonly DocumentFreightRule[]
}

/**
 * Quanto a nota da viagem rende de frete, e de onde o número vem — a fonte preferida é o cálculo
 * guardado (`measured`); sem ele, a previsão pela parametrização vigente (`estimated`), a mesma
 * conta que `resolveDocumentFreight` já faz para a listagem de notas (spec 176: reaproveitar, não
 * reimplementar). Sem as duas, `missing` — nunca `R$ 0,00`.
 */
export function resolveTripDocumentFreight(
  input: ResolveTripDocumentFreightInput,
): ResolvedTripDocumentFreight {
  if (input.freightCalculationStatus === 'snapshotted') {
    return { amount: input.freightCalculationTotalAmount, ruleName: null, source: 'measured' }
  }

  const note = input.note
  if (note === null || note.issuedAt === null) {
    return { amount: null, ruleName: null, source: 'missing' }
  }

  const estimate = resolveDocumentFreight({
    destinationCityCode: note.destinationCityCode,
    destinationState: note.destinationState,
    issuedAt: note.issuedAt,
    rules: input.rules,
    senderTaxId: note.senderTaxId,
    totalAmount: note.totalAmount,
  })
  if (estimate === null) return { amount: null, ruleName: null, source: 'missing' }

  return { amount: estimate.amount, ruleName: estimate.freightRuleName, source: 'estimated' }
}
