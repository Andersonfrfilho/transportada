/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import type { BuildCargoLayoutInputParams } from '../domain/cargo-layout-hash.types.js'
import type { TripCargoLayoutState } from '../domain/cargo-layout-state.types.js'
import type { CargoLayoutLookupPort } from './cargo-layout-lookup.port.js'
import type { RequestCargoLayoutUseCase } from './request-cargo-layout.types.js'

export type ResolvePreviewCargoLayoutParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly layoutInput: BuildCargoLayoutInputParams
  readonly layouts: CargoLayoutLookupPort
  readonly requestCargoLayout: RequestCargoLayoutUseCase
}

export type ResolvePreviewCargoLayoutResult = {
  readonly cargoLayout: ResolvedCargoLayout | null
  /** Ausente em `unavailable`: não há linha, e o frontend aceita a chave ausente (D17). */
  readonly layoutId?: string
  readonly state: TripCargoLayoutState
}
