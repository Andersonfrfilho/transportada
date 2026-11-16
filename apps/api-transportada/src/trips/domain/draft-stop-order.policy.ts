/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: a ordem das paradas do rascunho pela estrada.
 *
 * Função pura sobre a matriz de custo do OSRM (barracão na linha e na coluna 0). Caminho aberto, sem volta ao barracão
 * (a política de fim da empresa fica para a 058). Dois modos, escolhidos pela origem da ordem gravada na viagem (D2):
 *
 * - `reorder_all` (origem `unordered` ou `suggested`): vizinho mais próximo a partir do barracão, refinado por 2-opt e
 *   realocação de uma parada, e o resultado só substitui a ordem de entrada se for **mais barato** que ela.
 * - `insert_new` (origem `manual`): as paradas antigas ficam exatamente onde o despachante as pôs; cada parada nova
 *   entra, uma a uma pela `sequence`, na posição de menor custo de inserção.
 *
 * A parada sem coordenada (geocodificação pendente ou imprecisa) não entra na conta (RF3, o `excludedFromOptimization`
 * da ADR-0044 §5): no `reorder_all` vai para o fim, na ordem atual; no `insert_new` a antiga fica onde estava e a nova
 * vai para o fim. A célula sem estrada (`null` do OSRM) custa {@link UNREACHABLE_ROAD_COST}: é a pior escolha, nunca
 * uma distância estimada.
 *
 * Determinismo: as paradas são ordenadas por (`sequence`, `id`) antes de tudo e todo desempate fica com a primeira
 * nessa ordem, então o mesmo conjunto dá sempre a mesma ordem, qualquer que seja a ordem do array de entrada.
 */
import type { StopOrderSource } from './draft-stop-order.constant.js'
import { DRAFT_STOP_ORDER_DEPOT_INDEX } from './draft-stop-order.constant.js'
import { DraftStopOrderMatrixMismatchError } from './draft-stop-order.error.js'

/** Custo de uma célula sem estrada. Grande o bastante para nunca vencer uma perna real (100 paradas × 1 dia < 1e9). */
export const UNREACHABLE_ROAD_COST = 1_000_000_000

/** Diferença abaixo disto é empate: as somas de durações do OSRM têm casas decimais. */
const COST_EPSILON = 0.001

/** Teto de rodadas do refinamento; cada rodada só aceita melhora estrita, então ele termina antes disto na prática. */
const MAX_IMPROVEMENT_ROUNDS = 1_000

/** Matriz quadrada de custo (segundos ou metros, tanto faz para a ordem). Linha = origem, coluna = destino. */
export type RoadCostMatrix = readonly (readonly (number | null)[])[]

export type DraftStopForOrdering = Readonly<{
  id: string
  /** A posição da parada na matriz (≥ 1), ou `null` quando ela não tem coordenada confiável. */
  matrixIndex: number | null
  /** A posição atual da parada na viagem. Desempata e define a ordem de entrada. */
  sequence: number
  /** Só no `insert_new`: a parada que acabou de nascer neste vínculo. */
  isNew?: boolean
}>

export type DraftStopOrderMode = 'insert_new' | 'reorder_all'

export type DraftStopOrder = Readonly<{
  /** Custo do caminho das paradas com coordenada, do barracão até a última, na ordem devolvida. */
  cost: number
  /** As paradas sem coordenada, na ordem em que ficaram (RF3: a resposta diz quantas ficaram de fora). */
  excludedStopIds: readonly string[]
  /** Todas as paradas, na ordem nova. Sempre uma permutação das recebidas. */
  orderedStopIds: readonly string[]
}>

/** D2: a ordem do despachante não é desfeita; a sugerida (ou nunca ordenada) é refeita inteira. */
export function resolveDraftStopOrderMode(source: StopOrderSource): DraftStopOrderMode {
  return source === 'manual' ? 'insert_new' : 'reorder_all'
}

export function orderStopsByRoad(input: {
  readonly costs: RoadCostMatrix
  readonly mode: DraftStopOrderMode
  readonly stops: readonly DraftStopForOrdering[]
}): DraftStopOrder {
  assertMatrixCoversStops(input.costs, input.stops)
  const sorted = [...input.stops].sort(compareStops)
  const cost = createCostReader(input.costs)

  const ordered =
    input.mode === 'insert_new' ? insertNewStops(sorted, cost) : reorderAllStops(sorted, cost)

  return {
    cost: measurePath(cost, locatedIndices(ordered)),
    excludedStopIds: ordered.filter((stop) => stop.matrixIndex === null).map((stop) => stop.id),
    orderedStopIds: ordered.map((stop) => stop.id),
  }
}

/** O custo do caminho aberto barracão → paradas na ordem dada (índices da matriz). */
export function measureOpenPathCost(
  costs: RoadCostMatrix,
  matrixIndices: readonly number[],
): number {
  return measurePath(createCostReader(costs), matrixIndices)
}

type CostReader = (from: number, to: number) => number
type LocatedStop = DraftStopForOrdering & { readonly matrixIndex: number }

function compareStops(left: DraftStopForOrdering, right: DraftStopForOrdering): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence
  if (left.id < right.id) return -1
  return left.id > right.id ? 1 : 0
}

function isLocated(stop: DraftStopForOrdering): stop is LocatedStop {
  return stop.matrixIndex !== null
}

function locatedIndices(stops: readonly DraftStopForOrdering[]): number[] {
  return stops.filter(isLocated).map((stop) => stop.matrixIndex)
}

function assertMatrixCoversStops(
  costs: RoadCostMatrix,
  stops: readonly DraftStopForOrdering[],
): void {
  const size = costs.length
  if (size === 0) throw new DraftStopOrderMatrixMismatchError('empty matrix')
  if (costs.some((row) => row.length !== size)) {
    throw new DraftStopOrderMatrixMismatchError('matrix is not square')
  }
  for (const stop of stops) {
    if (stop.matrixIndex === null) continue
    const valid =
      Number.isInteger(stop.matrixIndex) &&
      stop.matrixIndex !== DRAFT_STOP_ORDER_DEPOT_INDEX &&
      stop.matrixIndex > 0 &&
      stop.matrixIndex < size
    if (!valid) throw new DraftStopOrderMatrixMismatchError('stop index out of range')
  }
}

function createCostReader(costs: RoadCostMatrix): CostReader {
  return (from, to) => {
    if (from === to) return 0
    const cell = costs[from]?.[to]
    if (cell === null || cell === undefined || !Number.isFinite(cell) || cell < 0) {
      return UNREACHABLE_ROAD_COST
    }
    return cell
  }
}

function measurePath(cost: CostReader, matrixIndices: readonly number[]): number {
  let total = 0
  let previous = DRAFT_STOP_ORDER_DEPOT_INDEX
  for (const index of matrixIndices) {
    total += cost(previous, index)
    previous = index
  }
  return total
}

function reorderAllStops(
  sorted: readonly DraftStopForOrdering[],
  cost: CostReader,
): DraftStopForOrdering[] {
  const located = sorted.filter(isLocated)
  const unlocated = sorted.filter((stop) => !isLocated(stop))
  if (located.length <= 1) return [...located, ...unlocated]

  const fromNearest = improve(nearestNeighbour(located, cost), cost)
  const fromInput = improve(located, cost)
  const fromNearestCost = measurePath(
    cost,
    fromNearest.map((stop) => stop.matrixIndex),
  )
  const fromInputCost = measurePath(
    cost,
    fromInput.map((stop) => stop.matrixIndex),
  )
  const candidate = fromInputCost < fromNearestCost - COST_EPSILON ? fromInput : fromNearest
  const candidateCost = Math.min(fromNearestCost, fromInputCost)

  // Nunca pior que a ordem de entrada (RF1): empate fica com a ordem que já estava.
  const inputCost = measurePath(
    cost,
    located.map((stop) => stop.matrixIndex),
  )
  const chosen = candidateCost < inputCost - COST_EPSILON ? candidate : located

  return [...chosen, ...unlocated]
}

function nearestNeighbour(located: readonly LocatedStop[], cost: CostReader): LocatedStop[] {
  const remaining = [...located]
  const path: LocatedStop[] = []
  let current = DRAFT_STOP_ORDER_DEPOT_INDEX
  while (remaining.length > 0) {
    let bestPosition = 0
    let bestCost = Number.POSITIVE_INFINITY
    remaining.forEach((stop, position) => {
      const candidate = cost(current, stop.matrixIndex)
      if (candidate < bestCost - COST_EPSILON) {
        bestCost = candidate
        bestPosition = position
      }
    })
    const [next] = remaining.splice(bestPosition, 1) as [LocatedStop]
    path.push(next)
    current = next.matrixIndex
  }
  return path
}

/**
 * Busca local de melhor melhora: 2-opt (inverte um trecho) e realocação (tira uma parada e põe noutro lugar). A matriz
 * do OSRM é assimétrica, então o custo do trecho invertido vem das somas de prefixo no sentido contrário.
 */
function improve(start: readonly LocatedStop[], cost: CostReader): LocatedStop[] {
  let path = [...start]
  for (let round = 0; round < MAX_IMPROVEMENT_ROUNDS; round += 1) {
    const move = findBestMove(path, cost)
    if (move === null) break
    path = move
  }
  return path
}

function findBestMove(path: readonly LocatedStop[], cost: CostReader): LocatedStop[] | null {
  const nodes = [DRAFT_STOP_ORDER_DEPOT_INDEX, ...path.map((stop) => stop.matrixIndex)]
  const last = nodes.length - 1
  const forward = [0]
  const backward = [0]
  for (let position = 0; position < last; position += 1) {
    const from = nodes[position] as number
    const to = nodes[position + 1] as number
    forward.push((forward[position] as number) + cost(from, to))
    backward.push((backward[position] as number) + cost(to, from))
  }
  const node = (position: number) => nodes[position] as number

  let bestDelta = -COST_EPSILON
  let bestPath: LocatedStop[] | null = null

  // 2-opt: inverte nodes[i..j] (posições 1..last; a 0 é o barracão, fixo).
  for (let i = 1; i < last; i += 1) {
    for (let j = i + 1; j <= last; j += 1) {
      const inner = (forward[j] as number) - (forward[i] as number)
      const innerReversed = (backward[j] as number) - (backward[i] as number)
      const tailBefore = j < last ? cost(node(j), node(j + 1)) : 0
      const tailAfter = j < last ? cost(node(i), node(j + 1)) : 0
      const delta =
        cost(node(i - 1), node(j)) +
        innerReversed +
        tailAfter -
        (cost(node(i - 1), node(i)) + inner + tailBefore)
      if (delta < bestDelta) {
        bestDelta = delta
        bestPath = [...path.slice(0, i - 1), ...path.slice(i - 1, j).reverse(), ...path.slice(j)]
      }
    }
  }

  // Realocação: tira a parada da posição i e a põe logo depois da posição k do caminho sem ela.
  for (let i = 1; i <= last; i += 1) {
    const moved = node(i)
    const hasNext = i < last
    const removal =
      (hasNext ? cost(node(i - 1), node(i + 1)) : 0) -
      cost(node(i - 1), moved) -
      (hasNext ? cost(moved, node(i + 1)) : 0)
    const without = [...nodes.slice(0, i), ...nodes.slice(i + 1)]
    for (let k = 0; k < without.length; k += 1) {
      if (k === i - 1) continue
      const before = without[k] as number
      const after = without[k + 1]
      const insertion =
        after === undefined
          ? cost(before, moved)
          : cost(before, moved) + cost(moved, after) - cost(before, after)
      const delta = removal + insertion
      if (delta < bestDelta) {
        bestDelta = delta
        const remaining = [...path.slice(0, i - 1), ...path.slice(i)]
        bestPath = [...remaining.slice(0, k), path[i - 1] as LocatedStop, ...remaining.slice(k)]
      }
    }
  }

  return bestPath
}

function insertNewStops(
  sorted: readonly DraftStopForOrdering[],
  cost: CostReader,
): DraftStopForOrdering[] {
  const list = sorted.filter((stop) => stop.isNew !== true)
  const newStops = sorted.filter((stop) => stop.isNew === true)

  for (const stop of newStops.filter(isLocated)) {
    // Candidatos: logo no começo (depois do barracão) ou logo depois de cada parada antiga com coordenada.
    let bestPosition = 0
    let bestCost = insertionCost(cost, DRAFT_STOP_ORDER_DEPOT_INDEX, stop, nextLocated(list, 0))
    list.forEach((current, position) => {
      if (!isLocated(current)) return
      const candidate = insertionCost(
        cost,
        current.matrixIndex,
        stop,
        nextLocated(list, position + 1),
      )
      if (candidate < bestCost - COST_EPSILON) {
        bestCost = candidate
        bestPosition = position + 1
      }
    })
    list.splice(bestPosition, 0, stop)
  }

  return [...list, ...newStops.filter((stop) => !isLocated(stop))]
}

function nextLocated(list: readonly DraftStopForOrdering[], from: number): LocatedStop | null {
  for (let position = from; position < list.length; position += 1) {
    const candidate = list[position] as DraftStopForOrdering
    if (isLocated(candidate)) return candidate
  }
  return null
}

function insertionCost(
  cost: CostReader,
  before: number,
  stop: LocatedStop,
  after: LocatedStop | null,
): number {
  if (after === null) return cost(before, stop.matrixIndex)
  return (
    cost(before, stop.matrixIndex) +
    cost(stop.matrixIndex, after.matrixIndex) -
    cost(before, after.matrixIndex)
  )
}
