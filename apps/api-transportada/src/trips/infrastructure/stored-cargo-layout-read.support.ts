/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D10 (T10): o detalhe da viagem lê a planta que o worker guardou, pelo hash da entrada que
 * ele mesmo montou — nunca empacota. No máximo duas consultas fixas (G011): a do hash atual e, se ela
 * não está pronta, a última planta pronta da viagem.
 */
import { and, eq, sql } from 'drizzle-orm'

import { resolveCargoLayout, type ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import { tripCargoLayouts } from '../../database/trip-cargo-layout.schema.js'
import { canRequestCargoLayout } from '../domain/cargo-layout-availability.policy.js'
import { buildCargoLayoutInput, hashCargoLayoutInput } from '../domain/cargo-layout-hash.policy.js'
import type {
  BuildCargoLayoutInputParams,
  StoredCargoLayoutInput,
} from '../domain/cargo-layout-hash.types.js'
import { relabelCargoLayout } from '../domain/cargo-layout-label.policy.js'
import {
  UNAVAILABLE_CARGO_LAYOUT_STATE,
  resolveCargoLayoutReading,
} from '../domain/cargo-layout-state.policy.js'
import type {
  ReadyCargoLayoutRow,
  StoredCargoLayoutRecord,
  StoredCargoLayoutRecordWithInput,
  TripCargoLayoutState,
} from '../domain/cargo-layout-state.types.js'
import { buildCargoLayoutLeaseExpiredCondition } from './cargo-layout-request.support.js'
import { CARGO_LAYOUT_STATUS } from './cargo-layout-status.constant.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type TripCargoLayoutReading = {
  readonly cargoLayout: ResolvedCargoLayout | null
  readonly cargoLayoutState: TripCargoLayoutState
  /** A entrada que a rota pede para calcular depois da leitura (D7 lazy); `null` quando não precisa. */
  readonly pendingCargoLayoutInput: BuildCargoLayoutInputParams | null
}

type ReadTripCargoLayoutParams = {
  readonly companyId: string
  readonly input: BuildCargoLayoutInputParams
  readonly leaseMs: number
  readonly tripId: string
}

// `layout` só é escrito pelo worker, com o `ResolvedCargoLayout` que o pacote devolveu (T9)
function toStoredLayout(layout: unknown): ResolvedCargoLayout | null {
  return layout === null ? null : (layout as ResolvedCargoLayout)
}

function storedRowFields(leaseMs: number) {
  return {
    computedAt: tripCargoLayouts.computedAt,
    errorCode: tripCargoLayouts.errorCode,
    id: tripCargoLayouts.id,
    layout: tripCargoLayouts.layout,
    leaseExpired: sql<boolean>`${buildCargoLayoutLeaseExpiredCondition(leaseMs)}`,
    status: tripCargoLayouts.status,
  }
}

function toStoredRecord(row: {
  readonly computedAt: Date | null
  readonly errorCode: string
  readonly id: string
  readonly layout: unknown
  readonly leaseExpired: boolean
  readonly status: StoredCargoLayoutRecord['status']
}): StoredCargoLayoutRecord {
  return {
    computedAt: row.computedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    id: row.id,
    layout: toStoredLayout(row.layout),
    leaseExpired: row.leaseExpired,
    status: row.status,
  }
}

/** A chave da fila (D3): a mesma entrada, da prévia ou da viagem, cai na mesma linha. */
export async function readCargoLayoutByInputHash(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly inputHash: string; readonly leaseMs: number },
): Promise<StoredCargoLayoutRecord | undefined> {
  const [row] = await queryable
    .select(storedRowFields(params.leaseMs))
    .from(tripCargoLayouts)
    .where(
      and(
        eq(tripCargoLayouts.companyId, params.companyId),
        eq(tripCargoLayouts.inputHash, params.inputHash),
      ),
    )
    .limit(1)
  return row === undefined ? undefined : toStoredRecord(row)
}

/**
 * T11: o id vem da URL — sem a empresa do contexto no filtro, ele abriria planta alheia (BOLA).
 * D20 (T16): o `input` vem no mesmo select, para o polling reetiquetar sem consulta nova.
 */
export async function readCargoLayoutById(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly layoutId: string; readonly leaseMs: number },
): Promise<StoredCargoLayoutRecordWithInput | undefined> {
  const [row] = await queryable
    .select({ ...storedRowFields(params.leaseMs), input: tripCargoLayouts.input })
    .from(tripCargoLayouts)
    .where(
      and(
        eq(tripCargoLayouts.companyId, params.companyId),
        eq(tripCargoLayouts.id, params.layoutId),
      ),
    )
    .limit(1)
  if (row === undefined) return undefined
  // `input` só é escrito pelo upsert, com `buildStoredCargoLayoutInput` (D5/M3)
  return { ...toStoredRecord(row), input: row.input as StoredCargoLayoutInput }
}

async function readPreviousReady(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly tripId: string },
): Promise<ReadyCargoLayoutRow | undefined> {
  const [row] = await queryable
    .select({ computedAt: tripCargoLayouts.computedAt, layout: tripCargoLayouts.layout })
    .from(tripCargoLayouts)
    .where(
      and(
        eq(tripCargoLayouts.companyId, params.companyId),
        eq(tripCargoLayouts.tripId, params.tripId),
        eq(tripCargoLayouts.status, CARGO_LAYOUT_STATUS.ready),
      ),
    )
    .orderBy(sql`${tripCargoLayouts.computedAt} desc nulls last`)
    .limit(1)
  const layout = toStoredLayout(row?.layout ?? null)
  if (row === undefined || layout === null) return undefined
  return { computedAt: row.computedAt?.toISOString() ?? null, layout }
}

/**
 * D15 + D10: sem capacidade ou sem baú não há planta a pedir — nem tabela, nem fila. A planta leve
 * (fileiras, a lista do que falta medir) sai na hora, como antes: sem baú o pacote não empacota
 * (`placeCargo` devolve `null` na primeira linha). Capacidade nula já implica baú nulo
 * (`trip-occupancy.support.ts`); o `null` forçado garante que o empacotador nunca rode na requisição.
 */
export async function readTripCargoLayout(
  queryable: TripQueryable,
  params: ReadTripCargoLayoutParams,
): Promise<TripCargoLayoutReading> {
  if (!canRequestCargoLayout(params.input)) {
    return {
      cargoLayout: resolveCargoLayout({ ...params.input, bedDimensions: null }),
      cargoLayoutState: UNAVAILABLE_CARGO_LAYOUT_STATE,
      pendingCargoLayoutInput: null,
    }
  }

  const inputHash = hashCargoLayoutInput(buildCargoLayoutInput(params.input))
  const current = await readCargoLayoutByInputHash(queryable, { ...params, inputHash })
  const previousReady =
    current?.status === CARGO_LAYOUT_STATUS.ready
      ? undefined
      : await readPreviousReady(queryable, params)
  const reading = resolveCargoLayoutReading({ current, previousReady })

  return {
    /** D20: a etiqueta é a da entrada que o detalhe acabou de montar — inclusive na planta `stale`. */
    cargoLayout:
      reading.cargoLayout === null ? null : relabelCargoLayout(reading.cargoLayout, params.input),
    cargoLayoutState: reading.cargoLayoutState,
    pendingCargoLayoutInput: reading.shouldRequest ? params.input : null,
  }
}
