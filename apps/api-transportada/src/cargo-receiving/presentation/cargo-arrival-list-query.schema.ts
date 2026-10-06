/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M3): a query da lista de chegadas. `contractorId` e `status`
 * repetem (`?status=open&status=closed`); os demais aparecem no máximo uma vez. Chave desconhecida,
 * valor repetido e lista longa demais são 400 — todos os erros de uma vez.
 */
import { z } from 'zod'

import { invalidRequest, parseLimit } from '../../http/request-parsing.service.js'
import { CARGO_ARRIVAL_STATUSES } from '../../shared/cargo-arrival.constant.js'
import type {
  CargoArrivalListPaging,
  ListCargoArrivalsFilters,
} from '../application/cargo-arrival-request.types.js'
import {
  CARGO_ARRIVAL_SORTS,
  DEFAULT_CARGO_ARRIVAL_LIST_ORDER,
  decodeCargoArrivalListCursor,
  SORT_DIRECTIONS,
  type CargoArrivalListOrder,
} from '../domain/cargo-arrival-list-order.policy.js'
import { CargoArrivalCursorOrderMismatchError } from '../domain/cargo-arrival.error.js'

const CONTRACTOR_FILTER_MAX = 50
const STATUS_FILTER_MAX = 4
const CURSOR_MAX_LENGTH = 1_024
const REPEATABLE_KEYS = new Set(['contractorId', 'status'])

const isUnique = (values: readonly string[]): boolean => new Set(values).size === values.length

const listQuerySchema = z
  .object({
    contractorId: z
      .array(z.uuid())
      .max(CONTRACTOR_FILTER_MAX)
      .refine(isUnique, { message: 'A contractor is repeated' })
      .default([]),
    cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
    direction: z.enum(SORT_DIRECTIONS).optional(),
    limit: z.string().optional(),
    sort: z.enum(CARGO_ARRIVAL_SORTS).optional(),
    status: z
      .array(z.enum(CARGO_ARRIVAL_STATUSES))
      .max(STATUS_FILTER_MAX)
      .refine(isUnique, { message: 'A status is repeated' })
      .default([]),
  })
  .strict()

export type CargoArrivalListQuery = {
  readonly filters: ListCargoArrivalsFilters
  readonly order: CargoArrivalListOrder
  readonly paging: CargoArrivalListPaging
}

export function parseCargoArrivalListQuery(url: URL): CargoArrivalListQuery {
  const result = listQuerySchema.safeParse(readQuery(url.searchParams))
  if (!result.success) {
    throw invalidRequest(
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    )
  }
  const query = result.data
  const order: CargoArrivalListOrder = {
    direction: query.direction ?? DEFAULT_CARGO_ARRIVAL_LIST_ORDER.direction,
    sort: query.sort ?? DEFAULT_CARGO_ARRIVAL_LIST_ORDER.sort,
  }
  return {
    filters: { contractorIds: query.contractorId, statuses: query.status },
    order,
    paging: {
      cursor: readCursor({ order, value: query.cursor }),
      limit: parseLimit(query.limit ?? null),
    },
  }
}

/** A chave que não repete e veio duas vezes vira lista, e o esquema a recusa no tipo. */
function readQuery(parameters: URLSearchParams): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  for (const key of new Set(parameters.keys())) {
    const values = parameters.getAll(key)
    query[key] = REPEATABLE_KEYS.has(key) || values.length > 1 ? values : values[0]
  }
  return query
}

function readCursor(params: {
  readonly order: CargoArrivalListOrder
  readonly value: string | undefined
}): CargoArrivalListPaging['cursor'] {
  if (params.value === undefined) return null
  const decoded = decodeCargoArrivalListCursor({ order: params.order, value: params.value })
  if (decoded.kind === 'valid') return decoded.cursor
  if (decoded.kind === 'mismatch') throw new CargoArrivalCursorOrderMismatchError()
  throw invalidRequest([{ field: 'cursor', message: 'The cursor is not valid' }])
}
