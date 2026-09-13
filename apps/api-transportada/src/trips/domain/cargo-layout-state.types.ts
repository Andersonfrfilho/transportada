/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import type { CargoLayoutStatus } from '../../database/trip-cargo-layout.schema.js'

/**
 * Spec 145 D10: o que a tela lê sobre a planta. `pending` junta `queued`/`running` e a linha que o
 * pedido lazy ainda vai criar; `unavailable` é não haver planta possível (D15) — nem pedida.
 */
export const CARGO_LAYOUT_READ_STATUSES = ['failed', 'pending', 'ready', 'unavailable'] as const
export type CargoLayoutReadStatus = (typeof CARGO_LAYOUT_READ_STATUSES)[number]

/** ⚠️ Chaves exatas: o validador do frontend recusa a resposta inteira com uma a mais (D17). */
export type TripCargoLayoutState = {
  readonly computedAt: string | null
  readonly errorCode: string | null
  readonly stale: boolean
  readonly status: CargoLayoutReadStatus
  readonly truncated: boolean
}

/** A linha de `trip_cargo_layouts` do hash atual, só com o que a leitura decide. */
export type StoredCargoLayoutRow = {
  readonly computedAt: string | null
  /** A coluna é `''` por padrão — só `failed` carrega código. */
  readonly errorCode: string
  readonly layout: ResolvedCargoLayout | null
  /** `updated_at` mais velho que o lease do worker (D14/D16). */
  readonly leaseExpired: boolean
  readonly status: CargoLayoutStatus
}

export type ReadyCargoLayoutRow = {
  readonly computedAt: string | null
  readonly layout: ResolvedCargoLayout
}

export type ResolveCargoLayoutReadingParams = {
  readonly current: StoredCargoLayoutRow | undefined
  /** A última planta pronta da viagem, de uma entrada anterior — servida como `stale`. */
  readonly previousReady: ReadyCargoLayoutRow | undefined
}

export type ResolveCargoLayoutReadingResult = {
  readonly cargoLayout: ResolvedCargoLayout | null
  readonly cargoLayoutState: TripCargoLayoutState
  /** Se a rota deve pedir o cálculo depois da leitura (D7 lazy). */
  readonly shouldRequest: boolean
}
