/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MONEY_SCALE,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import { buildTripValuation } from '../domain/trip-valuation.policy.js'
import type { ValuationSource } from '../domain/trip-valuation.policy.js'

import { resolveRevenueLine } from './read-trip-valuation.use-case.js'
import type {
  ApplicableFreightRule,
  TripValuationDocument,
} from './read-trip-valuation.use-case.js'

const ERROR_CODE_PREFIX = 'TRIP_REVENUE_TOTALS'

/** O que a linha da listagem precisa saber sobre dinheiro, e nada além. */
export type TripAmounts = Readonly<{
  /** Soma do valor das notas vinculadas. `null` quando nenhuma nota tem valor conhecido. */
  documentsTotal: null | string
  revenueSource: ValuationSource
  revenueTotal: string
}>

export type TripRevenueTotalsPort = Readonly<{
  findApplicableRule: (input: {
    readonly companyId: string
    readonly destinationCityCode?: null | string
    readonly destinationState?: null | string
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: null | string
  }) => Promise<ApplicableFreightRule | null>
  /**
   * As notas de **todas** as viagens da página, numa consulta só. É a diferença entre a listagem e
   * o painel: lá a viagem é uma, aqui são vinte, e chamar `readContext` por linha seria N+1 com o
   * banco pagando por uma tela que ninguém pediu que fosse cara.
   */
  readDocumentsByTrip: (input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }) => Promise<ReadonlyMap<string, readonly TripValuationDocument[]>>
}>

export type ReadTripRevenueTotalsInput = Readonly<{
  companyId: string
  repository: TripRevenueTotalsPort
  tripIds: readonly string[]
}>

/**
 * Quanto vale a carga de cada viagem da página, e quanto ela rende.
 *
 * A receita sai **da parametrização de frete, sem emitir CT-e nenhum** — a mesma decisão da spec 065
 * D7: o caminhão sai antes de qualquer emissão, então a viagem é avaliada pelos parâmetros que
 * gerariam o documento. Linha que já tem CT-e autorizado sobe como `measured`, e o `revenueSource`
 * de cada viagem é o que impede alguém de somar previsão com realizado sem perceber.
 *
 * ⚠️ **Duas economias, e as duas são o motivo de esta função existir em vez de um laço sobre
 * `readTripValuation`.** As notas de toda a página vêm numa consulta só, e a busca de regra é
 * memoizada por chave: a mesma transportadora manda para a mesma cidade o dia inteiro, então
 * trezentas notas costumam ser meia dúzia de regras. Sem a memoização seria uma consulta por nota.
 */
export async function readTripRevenueTotals(
  input: ReadTripRevenueTotalsInput,
): Promise<ReadonlyMap<string, TripAmounts>> {
  const amounts = new Map<string, TripAmounts>()
  if (input.tripIds.length === 0) return amounts

  const documentsByTrip = await input.repository.readDocumentsByTrip({
    companyId: input.companyId,
    tripIds: input.tripIds,
  })
  const repository = { ...input.repository, findApplicableRule: memoizeRule(input.repository) }

  for (const tripId of input.tripIds) {
    const documents = documentsByTrip.get(tripId) ?? []
    const revenueLines = await Promise.all(
      documents.map((document) =>
        resolveRevenueLine({ companyId: input.companyId, document, repository }),
      ),
    )

    /**
     * A política decide o total e o `source` — inclusive a regra de que **uma linha prevista torna o
     * conjunto previsão**. Somar aqui à mão duplicaria essa decisão fora do lugar onde ela mora.
     */
    const valuation = buildTripValuation({ costParcels: [], revenueLines })

    amounts.set(tripId, {
      documentsTotal: sumDocuments(documents),
      revenueSource: valuation.revenueSource,
      revenueTotal: valuation.totalRevenue,
    })
  }

  return amounts
}

/**
 * A chave é a que a regra realmente discrimina — emitente, destino e a data que decide a vigência.
 * Duas notas da mesma carga para o mesmo cliente no mesmo dia são **uma** consulta.
 */
function memoizeRule(
  repository: TripRevenueTotalsPort,
): TripRevenueTotalsPort['findApplicableRule'] {
  const cache = new Map<string, Promise<ApplicableFreightRule | null>>()

  return (query) => {
    const key = [
      query.senderTaxId ?? '',
      query.destinationCityCode ?? '',
      query.destinationState ?? '',
      query.issuedAt,
    ].join('|')

    const cached = cache.get(key)
    if (cached !== undefined) return cached

    const pending = repository.findApplicableRule(query)
    cache.set(key, pending)

    return pending
  }
}

/**
 * `null` quando nenhuma nota tem valor conhecido, e **nunca zero**: viagem sem nota e viagem com
 * notas de valor desconhecido diriam a mesma coisa, e a segunda é a que precisa de alguém olhando.
 */
function sumDocuments(documents: readonly TripValuationDocument[]): null | string {
  const known = documents
    .map((document) => document.nfeTotalAmount)
    .filter((amount): amount is string => amount !== null)
  if (known.length === 0) return null

  const total = known.reduce(
    (accumulated, amount) =>
      accumulated +
      parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value: amount }),
    0n,
  )

  return formatScaledDecimal(total, MONEY_SCALE)
}
