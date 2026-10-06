/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a nível 1: roteiro (`RouteName`) ↔ carga (`NroCarga`), 1:1 e só nesta prévia. Primeiro
 * os pares já firmados; depois o melhor encaixe — totais de valor (ao centavo) e de peso, votos das
 * linhas que já fecham sozinhas numa nota da carga, e a diferença de contagem como desempate. Empate
 * de verdade não pareia: as linhas caem no vínculo por linha.
 */
import { compareText, indexByValue } from './cargo-preview-match-input.policy.js'
import type {
  CargoPreviewRoutePairing,
  MatchDocument,
  MatchLine,
  RouteLoadPair,
  WeightCloses,
} from './cargo-preview-matching.types.js'

type Scored = {
  readonly loadReference: string
  readonly routeName: string
  readonly score: readonly [number, number, number]
}

type PairRoutesParams = {
  readonly documents: readonly MatchDocument[]
  readonly knownRoutePairs: readonly RouteLoadPair[]
  readonly lines: readonly MatchLine[]
  readonly weightCloses: WeightCloses
}

function groupBy<TItem>(
  items: readonly TItem[],
  keyOf: (item: TItem) => string | undefined,
): Map<string, TItem[]> {
  const groups = new Map<string, TItem[]>()
  for (const item of items) {
    const key = keyOf(item)
    if (key === undefined) continue
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [item])
    else group.push(item)
  }
  return groups
}

function sumOf<TItem>(
  items: readonly TItem[],
  valueOf: (item: TItem) => bigint | undefined,
): bigint | undefined {
  let total = 0n
  for (const item of items) {
    const value = valueOf(item)
    if (value === undefined) return undefined
    total += value
  }
  return total
}

function scorePair(input: {
  readonly documents: readonly MatchDocument[]
  readonly lines: readonly MatchLine[]
  readonly weightCloses: WeightCloses
}): readonly [number, number, number] {
  const { documents, lines, weightCloses } = input
  const index = indexByValue(documents)
  const votes = lines.filter((line) =>
    (index.get(line.valueCents) ?? []).some((document) =>
      weightCloses(line.weightGrams, document.weightGrams),
    ),
  ).length
  const valueCloses =
    sumOf(lines, (line) => line.valueCents) === sumOf(documents, (document) => document.valueCents)
  const weightTotal = sumOf(documents, (document) => document.weightGrams)
  const totals =
    valueCloses && weightCloses(sumOf(lines, (line) => line.weightGrams) ?? 0n, weightTotal)
  return [totals ? 1 : 0, votes, -Math.abs(lines.length - documents.length)]
}

function compareScored(left: Scored, right: Scored): number {
  for (let position = 0; position < left.score.length; position += 1) {
    const difference = (right.score[position] ?? 0) - (left.score[position] ?? 0)
    if (difference !== 0) return difference
  }
  return (
    compareText(left.routeName, right.routeName) ||
    compareText(left.loadReference, right.loadReference)
  )
}

function sameScore(left: Scored, right: Scored): boolean {
  return left.score.every((value, position) => value === right.score[position])
}

function scoreAll(
  input: PairRoutesParams & {
    routes: Map<string, MatchLine[]>
    loads: Map<string, MatchDocument[]>
  },
): Scored[] {
  const scored: Scored[] = []
  for (const [routeName, lines] of input.routes) {
    for (const [loadReference, documents] of input.loads) {
      const score = scorePair({ documents, lines, weightCloses: input.weightCloses })
      if (score[0] === 1 || score[1] > 0) scored.push({ loadReference, routeName, score })
    }
  }
  return scored.sort(compareScored)
}

type PairingState = {
  readonly pairs: CargoPreviewRoutePairing[]
  readonly usedLoads: Set<string>
  readonly usedRoutes: Set<string>
}

function block(state: PairingState, pair: RouteLoadPair): void {
  state.usedRoutes.add(pair.routeName)
  state.usedLoads.add(pair.loadReference)
}

function isFree(state: PairingState, pair: RouteLoadPair): boolean {
  return !state.usedRoutes.has(pair.routeName) && !state.usedLoads.has(pair.loadReference)
}

function applyKnownPairs(
  state: PairingState,
  input: {
    known: readonly RouteLoadPair[]
    loads: ReadonlyMap<string, unknown>
    routes: ReadonlyMap<string, unknown>
  },
): void {
  const known = [...input.known].sort(
    (left, right) =>
      compareText(left.routeName, right.routeName) ||
      compareText(left.loadReference, right.loadReference),
  )
  for (const pair of known) {
    if (!input.routes.has(pair.routeName) || !input.loads.has(pair.loadReference)) continue
    if (!isFree(state, pair)) continue
    state.pairs.push({
      loadReference: pair.loadReference,
      routeName: pair.routeName,
      source: 'known',
    })
    block(state, pair)
  }
}

/** Guloso pelo melhor escore; um rival livre com o mesmo escore no mesmo roteiro ou carga é empate. */
function applyScoredPairs(state: PairingState, scored: readonly Scored[]): void {
  for (const candidate of scored) {
    if (!isFree(state, candidate)) continue
    const rivals = scored.filter(
      (other) =>
        other !== candidate &&
        isFree(state, other) &&
        sameScore(other, candidate) &&
        (other.routeName === candidate.routeName ||
          other.loadReference === candidate.loadReference),
    )
    block(state, candidate)
    for (const rival of rivals) block(state, rival)
    if (rivals.length > 0) continue
    const source = candidate.score[0] === 1 ? 'totals' : 'votes'
    state.pairs.push({
      loadReference: candidate.loadReference,
      routeName: candidate.routeName,
      source,
    })
  }
}

export function pairRoutesWithLoads(params: PairRoutesParams): readonly CargoPreviewRoutePairing[] {
  const routes = groupBy(params.lines, (line) => line.routeName)
  const loads = groupBy(params.documents, (document) => document.loadReference)
  const state: PairingState = { pairs: [], usedLoads: new Set(), usedRoutes: new Set() }
  applyKnownPairs(state, { known: params.knownRoutePairs, loads, routes })
  applyScoredPairs(state, scoreAll({ ...params, loads, routes }))
  return state.pairs.sort((left, right) => compareText(left.routeName, right.routeName))
}
