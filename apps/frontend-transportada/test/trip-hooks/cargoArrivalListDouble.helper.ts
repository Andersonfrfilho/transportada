/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M3): o servidor dublado de `GET /cargo-arrivals`. Filtra por vários
 * contratantes e situações, ordena nas quatro colunas e pagina por cursor que carrega a ordem — a mesma
 * regra de `cargo-arrival-list.query.ts` (prazo nulo por último nos dois sentidos, desempate por id,
 * `open` antes de `closed`). Sem isso o painel "passaria" no teste filtrando sozinho.
 */
import type {
  CargoArrivalFilters,
  CargoArrivalOrder,
  CargoArrivalSummary,
  CargoPage,
} from '@/modules/cargo-receiving/shared/cargoArrival.types'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

export const ORDER_MISMATCH_CODE = 'CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH'

const DEFAULT_ORDER: CargoArrivalOrder = { direction: 'desc', sort: 'arrivedAt' }
const STATUS_RANK: Readonly<Record<CargoArrivalSummary['status'], number>> = { closed: 1, open: 0 }

function readSortValue(arrival: CargoArrivalSummary, sort: CargoArrivalOrder['sort']) {
  if (sort === 'arrivedAt') return arrival.arrivedAt
  if (sort === 'contractorName') return arrival.contractorName
  if (sort === 'separationDueAt') return arrival.separationDueAt
  return STATUS_RANK[arrival.status]
}

function compareValues(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right))
}

function compareArrivals(
  input: Readonly<{
    left: CargoArrivalSummary
    order: CargoArrivalOrder
    right: CargoArrivalSummary
  }>,
): number {
  const sign = input.order.direction === 'asc' ? 1 : -1
  const left = readSortValue(input.left, input.order.sort)
  const right = readSortValue(input.right, input.order.sort)
  if (left === null || right === null) {
    if (left !== right) return left === null ? 1 : -1
  } else {
    const byValue = compareValues(left, right)
    if (byValue !== 0) return sign * byValue
  }
  return sign * input.left.id.localeCompare(input.right.id)
}

const encodeCursor = (input: Readonly<{ offset: number; order: CargoArrivalOrder }>): string =>
  JSON.stringify([input.order.sort, input.order.direction, input.offset])

function decodeCursor(input: Readonly<{ cursor: string; order: CargoArrivalOrder }>): number {
  const [sort, direction, offset] = JSON.parse(input.cursor) as [string, string, number]
  if (sort !== input.order.sort || direction !== input.order.direction) {
    throw new CargoReceivingRequestError(ORDER_MISMATCH_CODE)
  }
  return offset
}

type PageInput = Readonly<{
  arrivals: readonly CargoArrivalSummary[]
  cursor: string | null
  filters: CargoArrivalFilters
  pageSize: number
}>

export function pageArrivals(input: PageInput): CargoPage<CargoArrivalSummary> {
  const { contractorIds, statuses } = input.filters
  const order = input.filters.order ?? DEFAULT_ORDER
  const sorted = input.arrivals
    .filter((arrival) => contractorIds.length === 0 || contractorIds.includes(arrival.contractorId))
    .filter((arrival) => statuses.length === 0 || statuses.includes(arrival.status))
    .sort((left, right) => compareArrivals({ left, order, right }))
  const start = input.cursor === null ? 0 : decodeCursor({ cursor: input.cursor, order })
  const items = sorted.slice(start, start + input.pageSize)
  const end = start + items.length
  return { items, nextCursor: end < sorted.length ? encodeCursor({ offset: end, order }) : null }
}
