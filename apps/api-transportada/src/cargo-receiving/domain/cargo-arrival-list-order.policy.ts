/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M3): a ordem da lista de chegadas e o cursor que anda nela. O
 * cursor carrega a coluna e a direção, e só vale na ordem em que nasceu. A ordem padrão (chegada mais
 * recente primeiro) mantém o cursor `<iso>::<uuid>` de antes: o painel que já paginava continua igual.
 */
import { z } from 'zod'

import { CARGO_ARRIVAL_STATUSES } from '../../shared/cargo-arrival.constant.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.js'

export const CARGO_ARRIVAL_SORT = {
  arrivedAt: 'arrivedAt',
  contractorName: 'contractorName',
  separationDueAt: 'separationDueAt',
  status: 'status',
} as const
export type CargoArrivalSort = (typeof CARGO_ARRIVAL_SORT)[keyof typeof CARGO_ARRIVAL_SORT]
export const CARGO_ARRIVAL_SORTS = Object.values(CARGO_ARRIVAL_SORT)

export const SORT_DIRECTION = { asc: 'asc', desc: 'desc' } as const
export type SortDirection = (typeof SORT_DIRECTION)[keyof typeof SORT_DIRECTION]
export const SORT_DIRECTIONS = Object.values(SORT_DIRECTION)

export type CargoArrivalListOrder = {
  readonly direction: SortDirection
  readonly sort: CargoArrivalSort
}

export const DEFAULT_CARGO_ARRIVAL_LIST_ORDER: CargoArrivalListOrder = {
  direction: SORT_DIRECTION.desc,
  sort: CARGO_ARRIVAL_SORT.arrivedAt,
}

/** `value` nulo só existe na cauda dos sem prazo, que vão por último nos dois sentidos. */
export type CargoArrivalListCursor = {
  readonly id: string
  readonly value: string | null
}

export type DecodedCargoArrivalListCursor =
  | { readonly kind: 'invalid' | 'mismatch' }
  | { readonly cursor: CargoArrivalListCursor; readonly kind: 'valid' }

const CONTRACTOR_NAME_MAX_LENGTH = 500
const isoDate = z.iso.datetime({ offset: false })
const VALUE_SCHEMAS: Readonly<Record<CargoArrivalSort, z.ZodType<string | null>>> = {
  arrivedAt: isoDate,
  contractorName: z.string().max(CONTRACTOR_NAME_MAX_LENGTH),
  separationDueAt: isoDate.nullable(),
  status: z.enum(CARGO_ARRIVAL_STATUSES),
}
const orderedCursorSchema = z.tuple([
  z.enum(CARGO_ARRIVAL_SORTS),
  z.enum(SORT_DIRECTIONS),
  z.string().nullable(),
  z.uuid(),
])

export function isDefaultCargoArrivalListOrder(order: CargoArrivalListOrder): boolean {
  return (
    order.sort === DEFAULT_CARGO_ARRIVAL_LIST_ORDER.sort &&
    order.direction === DEFAULT_CARGO_ARRIVAL_LIST_ORDER.direction
  )
}

export function encodeCargoArrivalListCursor(params: {
  readonly cursor: CargoArrivalListCursor
  readonly order: CargoArrivalListOrder
}): string {
  const { cursor, order } = params
  if (isDefaultCargoArrivalListOrder(order) && cursor.value !== null) {
    return encodeKeysetCursor({ createdAt: new Date(cursor.value), id: cursor.id })
  }
  const payload = JSON.stringify([order.sort, order.direction, cursor.value, cursor.id])
  return Buffer.from(payload, 'utf8').toString('base64url')
}

/** Cursor de outra ordem é `mismatch`: tratá-lo como primeira página esconderia o erro do cliente. */
export function decodeCargoArrivalListCursor(params: {
  readonly order: CargoArrivalListOrder
  readonly value: string
}): DecodedCargoArrivalListCursor {
  const legacy = decodeLegacyCursor(params.value)
  if (legacy !== null) {
    return isDefaultCargoArrivalListOrder(params.order)
      ? { cursor: legacy, kind: 'valid' }
      : { kind: 'mismatch' }
  }
  const parsed = orderedCursorSchema.safeParse(readJson(params.value))
  if (!parsed.success) return { kind: 'invalid' }
  const [sort, direction, value, id] = parsed.data
  if (!VALUE_SCHEMAS[sort].safeParse(value).success) return { kind: 'invalid' }
  const isSameOrder = sort === params.order.sort && direction === params.order.direction
  if (!isSameOrder || isDefaultCargoArrivalListOrder(params.order)) return { kind: 'mismatch' }
  return { cursor: { id, value }, kind: 'valid' }
}

function decodeLegacyCursor(value: string): CargoArrivalListCursor | null {
  const decoded = decodeKeysetCursor(value)
  if (decoded === null || !z.uuid().safeParse(decoded.id).success) return null
  const iso = decoded.createdAt.toISOString()
  return value === `${iso}::${decoded.id}` ? { id: decoded.id, value: iso } : null
}

function readJson(value: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
}
