/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildValuationFromContext } from './read-trip-valuation.use-case.js'
import type { ApplicableFreightRule, TripValuationContext } from './read-trip-valuation.use-case.js'
import { memoizeRule } from './read-trip-revenue-totals.use-case.js'
import type { TripAmounts } from './read-trip-revenue-totals.use-case.js'
import type { TripRouteFreezeLogger } from './freeze-trip-route-gracefully.js'
import { TRIP_LIST_ENRICHMENT_LOG } from './trip-list-enrichment.constant.js'

/** O que a linha da lista ganha de custo e margem — os quatro campos novos de `TripAmounts`. */
export type TripListFinancials = Required<
  Pick<TripAmounts, 'costTotal' | 'hasGaps' | 'marginPercentage' | 'marginTotal'>
>

export type TripListFinancialsPort = Readonly<{
  findApplicableRule: (input: {
    readonly companyId: string
    readonly destinationCityCode?: null | string
    readonly destinationState?: null | string
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: null | string
  }) => Promise<ApplicableFreightRule | null>
  /** Os contextos da página inteira, numa leitura em lote — a lista nunca chama `readContext` por linha. */
  readValuationContexts: (input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }) => Promise<ReadonlyMap<string, TripValuationContext>>
}>

export type ReadTripListFinancialsInput = Readonly<{
  companyId: string
  logger?: TripRouteFreezeLogger | undefined
  repository: TripListFinancialsPort
  tripIds: readonly string[]
}>

/**
 * Custo e margem de cada viagem da página, pela **única** conta de margem do produto
 * (`buildValuationFromContext`, spec 259 RF3) — somar custo à mão aqui produziria dois números para a
 * mesma viagem. A busca de regra é memoizada por chave, como na receita da lista.
 *
 * ⚠️ A lista não faz o que o detalhe faz com rascunho sem rota congelada (a rota ao vivo pelo OSRM):
 * sem rota, combustível e pedágio saem como lacuna (`hasGaps`), e a paridade vale para rota congelada.
 *
 * Falha numa viagem a omite do mapa, com aviso só de ids; as demais seguem. Falha da leitura em lote
 * propaga: quem decide o que fazer com a página é o chamador.
 */
export async function readTripListFinancials(
  input: ReadTripListFinancialsInput,
): Promise<ReadonlyMap<string, TripListFinancials>> {
  const financials = new Map<string, TripListFinancials>()
  if (input.tripIds.length === 0) return financials

  const contexts = await input.repository.readValuationContexts({
    companyId: input.companyId,
    tripIds: input.tripIds,
  })
  const repository = { findApplicableRule: memoizeRule(input.repository) }

  await Promise.all(
    input.tripIds.map(async (tripId) => {
      const context = contexts.get(tripId)
      if (context === undefined) return

      try {
        const valuation = await buildValuationFromContext({
          companyId: input.companyId,
          context,
          repository,
        })
        financials.set(tripId, {
          costTotal: valuation.totalCost,
          hasGaps: valuation.hasGaps,
          marginPercentage: valuation.marginPercentage,
          marginTotal: valuation.totalMargin,
        })
      } catch (error) {
        input.logger?.warn(TRIP_LIST_ENRICHMENT_LOG.financialsTripFailed, {
          companyId: input.companyId,
          errorName: error instanceof Error ? error.name : 'unknown',
          tripId,
        })
      }
    }),
  )

  return financials
}
