/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D10/D13/D16: de duas linhas de `trip_cargo_layouts` (a do hash atual e a última pronta da
 * viagem) sai o que o detalhe serve e se a rota pede o cálculo. Nenhum empacotamento aqui.
 */
import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import type {
  CargoLayoutReadStatus,
  ReadyCargoLayoutRow,
  ResolveCargoLayoutReadingParams,
  ResolveCargoLayoutReadingResult,
  StoredCargoLayoutRow,
  TripCargoLayoutState,
} from './cargo-layout-state.types.js'

export { CARGO_LAYOUT_READ_STATUSES } from './cargo-layout-state.types.js'

const TIME_BUDGET_REASON = 'time_budget'

export const UNAVAILABLE_CARGO_LAYOUT_STATE: TripCargoLayoutState = {
  computedAt: null,
  errorCode: null,
  stale: false,
  status: 'unavailable',
  truncated: false,
}

/** D13: "incompleta" não é gravada — é a caixa que o orçamento de tempo deixou de fora. */
export function isCargoLayoutTruncated(layout: ResolvedCargoLayout): boolean {
  return layout.placement?.unplaced.some((box) => box.reason === TIME_BUDGET_REASON) ?? false
}

function resolveReadStatus(current: StoredCargoLayoutRow | undefined): CargoLayoutReadStatus {
  if (current?.status === 'ready') return 'ready'
  if (current?.status === 'failed') return 'failed'
  return 'pending'
}

/**
 * D7/D16/D18: sem linha, ou `failed`/`queued`/`running` além do lease — os mesmos casos que o upsert
 * reabre. `failed` recente é a resposta: pedir de novo repetiria a mesma falha, sem teto.
 */
function shouldRequestCargoLayout(current: StoredCargoLayoutRow | undefined): boolean {
  if (current === undefined) return true
  if (current.status === 'ready') return false
  return current.leaseExpired
}

/** O pedido que enfileirou manda no que se serve: pendente, sem o código da falha antiga. */
export function markCargoLayoutRequested(state: TripCargoLayoutState): TripCargoLayoutState {
  return { ...state, errorCode: null, status: 'pending' }
}

function freshLayoutOf(current: StoredCargoLayoutRow | undefined): ReadyCargoLayoutRow | undefined {
  if (current?.status !== 'ready' || current.layout === null) return undefined
  return { computedAt: current.computedAt, layout: current.layout }
}

export function resolveCargoLayoutReading(
  params: ResolveCargoLayoutReadingParams,
): ResolveCargoLayoutReadingResult {
  const fresh = freshLayoutOf(params.current)
  const served = fresh ?? params.previousReady
  const errorCode = params.current?.errorCode ?? ''

  return {
    cargoLayout: served?.layout ?? null,
    cargoLayoutState: {
      computedAt: served?.computedAt ?? null,
      errorCode: errorCode === '' ? null : errorCode,
      stale: fresh === undefined && served !== undefined,
      status: resolveReadStatus(params.current),
      truncated: served === undefined ? false : isCargoLayoutTruncated(served.layout),
    },
    shouldRequest: shouldRequestCargoLayout(params.current),
  }
}
