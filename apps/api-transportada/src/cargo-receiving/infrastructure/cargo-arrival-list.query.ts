/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M3): filtro, ordem e keyset da lista de chegadas, sempre a partir
 * da empresa do contexto. A ordem é `(coluna, id)` no mesmo sentido; "sem prazo" vai por último nos
 * dois sentidos, como no painel, e a situação ordena `open` antes de `closed`.
 */
import { and, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'

import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { CARGO_ARRIVAL_STATUS } from '../../shared/cargo-arrival.constant.js'
import type { ListCargoArrivalsRecordParams } from '../application/cargo-arrival-request.types.js'
import type { CargoArrivalRecord, Page } from '../application/cargo-arrival.types.js'
import {
  CARGO_ARRIVAL_SORT,
  encodeCargoArrivalListCursor,
  SORT_DIRECTION,
  type CargoArrivalListCursor,
  type CargoArrivalListOrder,
  type CargoArrivalSort,
} from '../domain/cargo-arrival-list-order.policy.js'

const STATUS_RANK: Readonly<Record<string, number>> = {
  [CARGO_ARRIVAL_STATUS.open]: 0,
  [CARGO_ARRIVAL_STATUS.closed]: 1,
}
const statusRankSql = sql`(case ${cargoArrivals.status} when ${CARGO_ARRIVAL_STATUS.open} then 0 else 1 end)`

type SortColumn =
  | typeof cargoArrivals.arrivedAt
  | typeof cargoArrivals.separationDueAt
  | typeof contractors.displayName

const SORT_COLUMNS: Readonly<Record<Exclude<CargoArrivalSort, 'status'>, SortColumn>> = {
  arrivedAt: cargoArrivals.arrivedAt,
  contractorName: contractors.displayName,
  separationDueAt: cargoArrivals.separationDueAt,
}

export function buildArrivalListFilters(params: ListCargoArrivalsRecordParams): SQL[] {
  const { contractorIds, statuses } = params.filters
  const filters: (SQL | undefined)[] = [
    eq(cargoArrivals.companyId, params.companyId),
    contractorIds.length === 0
      ? undefined
      : inArray(cargoArrivals.contractorId, [...contractorIds]),
    statuses.length === 0 ? undefined : inArray(cargoArrivals.status, [...statuses]),
    params.paging.cursor === null
      ? undefined
      : buildCursorFilter({ cursor: params.paging.cursor, order: params.order }),
  ]
  return filters.filter((filter): filter is SQL => filter !== undefined)
}

export function buildArrivalListOrderBy(order: CargoArrivalListOrder): SQL[] {
  const direction = sql.raw(order.direction)
  const key = order.sort === CARGO_ARRIVAL_SORT.status ? statusRankSql : SORT_COLUMNS[order.sort]
  return [sql`${key} ${direction} nulls last`, sql`${cargoArrivals.id} ${direction} nulls last`]
}

/** Depois do cursor: coluna além do valor, empate pelo id, e a cauda dos nulos por último. */
function buildCursorFilter(params: {
  readonly cursor: CargoArrivalListCursor
  readonly order: CargoArrivalListOrder
}): SQL | undefined {
  const { cursor, order } = params
  const beyond = order.direction === SORT_DIRECTION.asc ? gt : lt
  const afterId = beyond(cargoArrivals.id, cursor.id)
  if (order.sort === CARGO_ARRIVAL_SORT.status) {
    const rank = STATUS_RANK[cursor.value ?? ''] ?? 0
    const operator = sql.raw(order.direction === SORT_DIRECTION.asc ? '>' : '<')
    return or(
      sql`${statusRankSql} ${operator} ${rank}`,
      and(sql`${statusRankSql} = ${rank}`, afterId),
    )
  }
  const column = SORT_COLUMNS[order.sort]
  if (cursor.value === null) return and(isNull(column), afterId)
  const value =
    order.sort === CARGO_ARRIVAL_SORT.contractorName ? cursor.value : new Date(cursor.value)
  return or(beyond(column, value), and(eq(column, value), afterId), isNull(column))
}

function readSortValue(params: {
  readonly row: CargoArrivalRecord
  readonly sort: CargoArrivalSort
}): string | null {
  const { row } = params
  switch (params.sort) {
    case CARGO_ARRIVAL_SORT.arrivedAt:
      return row.arrivedAt.toISOString()
    case CARGO_ARRIVAL_SORT.contractorName:
      return row.contractorName
    case CARGO_ARRIVAL_SORT.separationDueAt:
      return row.separationDueAt?.toISOString() ?? null
    case CARGO_ARRIVAL_SORT.status:
      return row.status
  }
}

export function toArrivalListPage<TRow extends CargoArrivalRecord, TItem>(params: {
  readonly limit: number
  readonly map: (row: TRow) => TItem
  readonly order: CargoArrivalListOrder
  readonly rows: readonly TRow[]
}): Page<TItem> {
  const visible = params.rows.slice(0, params.limit)
  const last = visible.at(-1)
  const hasMore = params.rows.length > params.limit
  return {
    items: visible.map(params.map),
    nextCursor:
      hasMore && last !== undefined
        ? encodeCargoArrivalListCursor({
            cursor: { id: last.id, value: readSortValue({ row: last, sort: params.order.sort }) },
            order: params.order,
          })
        : null,
  }
}
