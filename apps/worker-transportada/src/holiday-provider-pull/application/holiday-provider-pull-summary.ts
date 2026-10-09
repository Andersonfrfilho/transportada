/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O resumo de um ciclo de `holiday.provider.pull`: os contadores do cartão do painel e a palavra do
 * catálogo em que a linha fecha. Falha nossa vence a do fornecedor; entre as do fornecedor, a que o
 * usuário resolve vem primeiro. Orçamento do mês e teto do ciclo são contadores, não falha.
 */
import type { JobOutcome } from '../../shared/job-catalog.constant.js'

import type { ApplyTally } from './apply-holiday-provider.use-case.js'
import type { DiscoveryTally } from './discover-holiday-cities.use-case.js'
import type { FetchTally } from './fetch-holiday-provider.use-case.js'

export type CycleState = {
  apply: ApplyTally | undefined
  discovery: DiscoveryTally | undefined
  fetch: FetchTally | undefined
  stageFailures: number
}

const flag = (value: boolean | undefined) => (value === true ? 1 : 0)

/** Zerado fica fora, menos o que o cartão do painel mostra sempre: o cartão conta o que aconteceu. */
export function buildCounters(state: CycleState): Readonly<Record<string, number>> {
  const { apply, discovery, fetch } = state
  const counters: Record<string, number> = {
    discovery_batches: discovery?.batches ?? 0,
    discovery_discarded_city_codes: discovery?.discardedCityCodes ?? 0,
    discovery_documents: discovery?.documentsRead ?? 0,
    discovery_failed_companies: discovery?.failedCompanies ?? 0,
    discovery_without_destination: discovery?.documentsWithoutDestination ?? 0,
    apply_failed_companies: apply?.failedCompanies ?? 0,
    apply_unexpected_failures: apply?.unexpectedFailures ?? 0,
    budget_exhausted: flag(fetch?.budgetExhausted),
    ceiling_reached: flag(fetch?.ceilingReached),
    circuit_opened: flag(fetch?.circuitOpened),
    entries_discarded: fetch?.entriesDiscarded ?? 0,
    fetch_unexpected_failures: fetch?.unexpectedFailures ?? 0,
    malformed_response: fetch?.malformedResponses ?? 0,
    municipal_inserted: apply?.municipalInserted ?? 0,
    national_mismatch: apply?.nationalMismatch ?? 0,
    pairs_fetched: fetch?.pairsFetched ?? 0,
    pairs_not_covered: fetch?.pairsNotCovered ?? 0,
    plan_restricted: fetch?.planRestricted ?? 0,
    provider_unauthorized: flag(fetch?.unauthorized),
    provider_unreachable: fetch?.unreachable ?? 0,
    rate_limited: flag(fetch?.rateLimited),
    requests: fetch?.requests ?? 0,
    stage_failures: state.stageFailures,
    state_inserted: apply?.stateInserted ?? 0,
  }
  const alwaysShown = new Set(['municipal_inserted', 'requests', 'state_inserted'])

  return Object.fromEntries(
    Object.entries(counters).filter(([name, value]) => value > 0 || alwaysShown.has(name)),
  )
}

function countOwnFailures(state: CycleState): number {
  return (
    state.stageFailures +
    (state.discovery?.failedCompanies ?? 0) +
    (state.fetch?.unexpectedFailures ?? 0) +
    (state.apply?.failedCompanies ?? 0) +
    (state.apply?.unexpectedFailures ?? 0)
  )
}

/** Falha nossa vence a do fornecedor; entre as do fornecedor, a que o usuário resolve vem primeiro. */
export function resolveOutcome(state: CycleState): JobOutcome {
  if (countOwnFailures(state) > 0) return 'unexpected_error'

  const { fetch } = state
  if (fetch?.unauthorized === true) return 'provider_unauthorized'
  // Nada funcionou porque o plano restringiu tudo: é o mesmo problema de quem vai ao painel conferir o plano.
  if ((fetch?.planRestricted ?? 0) > 0 && fetch?.pairsFetched === 0) return 'provider_unauthorized'
  // Todo pedido deu 404: o caminho mudou, não são cidades sem cobertura.
  if ((fetch?.malformedResponses ?? 0) > 0 || fetch?.allNotFound === true)
    return 'malformed_response'
  if ((fetch?.unreachable ?? 0) > 0 || fetch?.rateLimited === true) return 'provider_unreachable'

  return 'succeeded'
}
