/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  RouteSuggestion,
  RouteSuggestionStop,
  RouteViolationKind,
} from './routeSuggestion.types'

/**
 * O que o conferente **tem de ver antes de apertar aceitar** (spec 058 P1). Cada item aqui é uma
 * coisa que, escondida, vira problema do motorista na rua em vez de decisão de quem confere.
 */
export type RouteSuggestionWarning = Readonly<{
  /** Quantas paradas o aviso cobre — o rótulo pluraliza por ele. */
  count: number
  kind: RouteSuggestionWarningKind
  /** Soma da violação, quando ela é medida (quilos, segundos). `null` quando é só contagem. */
  total: number | null
}>

export const ROUTE_SUGGESTION_WARNING_KIND = [
  'coarseGeocoding',
  'deliveryWindow',
  'dutyTime',
  'estimatedWeight',
  'truncated',
  'unreachable',
  'weight',
] as const
export type RouteSuggestionWarningKind = (typeof ROUTE_SUGGESTION_WARNING_KIND)[number]

const WARNING_KIND_BY_VIOLATION: Readonly<Record<RouteViolationKind, RouteSuggestionWarningKind>> =
  {
    delivery_window: 'deliveryWindow',
    duty_time: 'dutyTime',
    unreachable: 'unreachable',
    weight: 'weight',
  }

/**
 * Ordem de gravidade, e ela é deliberada: o que impede a rota de existir vem antes do que a torna
 * cara. `unreachable` primeiro (a parada não tem estrada), depois peso (não cabe no caminhão), e só
 * então janela e jornada, que são violações de tempo — reais, mas cumpríveis com atraso.
 *
 * `coarseGeocoding` fica no topo do bloco informativo porque é o único aviso sobre uma parada que
 * **não entrou** na otimização: ela está fora da conta que o resto da tela mostra.
 */
const WARNING_ORDER: readonly RouteSuggestionWarningKind[] = [
  'unreachable',
  'weight',
  'deliveryWindow',
  'dutyTime',
  'coarseGeocoding',
  'estimatedWeight',
  'truncated',
]

/**
 * ADR-0044 §5: a violação aparece explícita, nunca escondida escolhendo uma ordem pior. Esta função
 * é o que garante isso na tela — ela deriva os avisos da sugestão inteira, e o painel não tem como
 * renderizar a lista sem passar por aqui.
 */
export function collectRouteSuggestionWarnings(
  suggestion: RouteSuggestion,
): readonly RouteSuggestionWarning[] {
  const byKind = new Map<RouteSuggestionWarningKind, { count: number; total: number }>()

  function add(kind: RouteSuggestionWarningKind, amount: number | null): void {
    const current = byKind.get(kind) ?? { count: 0, total: 0 }
    byKind.set(kind, { count: current.count + 1, total: current.total + (amount ?? 0) })
  }

  for (const stop of suggestion.stops) {
    if (stop.excludedFromOptimization) add('coarseGeocoding', null)
    if (stop.weightEstimated) add('estimatedWeight', null)
    for (const violation of stop.violations) {
      add(WARNING_KIND_BY_VIOLATION[violation.kind], violation.amount)
    }
  }

  /**
   * Truncado é aviso da sugestão inteira, não de parada: o orçamento cortou antes da convergência, e
   * quem aceita precisa saber que existe rota melhor que não foi procurada.
   */
  if (suggestion.truncated) add('truncated', null)

  return WARNING_ORDER.flatMap((kind) => {
    const entry = byKind.get(kind)
    if (entry === undefined) return []

    return [{ count: entry.count, kind, total: MEASURED_KINDS.has(kind) ? entry.total : null }]
  })
}

/** Os avisos que carregam medida; os demais são contagem, e mostrar `total: 0` neles seria ruído. */
const MEASURED_KINDS = new Set<RouteSuggestionWarningKind>(['deliveryWindow', 'dutyTime', 'weight'])

/**
 * A parada de precisão grosseira vai para o **fim** da lista, marcada — ela não entrou na
 * otimização, e intercalá-la entre as otimizadas sugeriria uma ordem que o solver não escolheu.
 */
export function orderStopsForReview(
  stops: readonly RouteSuggestionStop[],
): readonly RouteSuggestionStop[] {
  const optimized = stops.filter((stop) => !stop.excludedFromOptimization)
  const excluded = stops.filter((stop) => stop.excludedFromOptimization)

  return [...bySequence(optimized), ...bySequence(excluded)]
}

function bySequence(stops: readonly RouteSuggestionStop[]): readonly RouteSuggestionStop[] {
  return [...stops].sort((left, right) => left.sequence - right.sequence)
}

/**
 * Só uma sugestão pronta se decide. `queued`/`running` ainda não é proposta, e `accepted`,
 * `rejected` e `stale` já não são — aceitar uma `stale` aplicaria o roteiro de uma viagem que mudou.
 */
export function canDecideSuggestion(suggestion: RouteSuggestion): boolean {
  return suggestion.status === 'ready'
}

/** O mapa confere a sugestão; ele não é a sugestão. Sem coordenada não há o que desenhar. */
export function hasPlottableStops(suggestion: RouteSuggestion): boolean {
  return suggestion.stops.some((stop) => stop.latitude !== null && stop.longitude !== null)
}
