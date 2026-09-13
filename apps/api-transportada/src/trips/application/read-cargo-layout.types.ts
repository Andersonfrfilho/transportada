/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import type { TripCargoLayoutState } from '../domain/cargo-layout-state.types.js'

export type FindCargoLayoutByInputHashParams = {
  readonly companyId: string
  readonly inputHash: string
}

/** ⚠️ `companyId` é do contexto autenticado: o id sozinho nunca abre a planta de outra empresa. */
export type FindCargoLayoutByIdParams = {
  readonly companyId: string
  readonly layoutId: string
}

export type ReadCargoLayoutParams = FindCargoLayoutByIdParams

/**
 * Spec 145 D10 (T11): a leitura da pergunta de novo. A rota serve só `cargoLayout`, `layoutId` e
 * `state` — `shouldRequest` é a decisão de reabrir (D16/D18) e nunca sai na resposta.
 */
export type ReadCargoLayoutResult = {
  readonly cargoLayout: ResolvedCargoLayout | null
  readonly layoutId: string
  readonly shouldRequest: boolean
  readonly state: TripCargoLayoutState
}

export type ReadCargoLayoutUseCase = {
  execute(params: ReadCargoLayoutParams): Promise<ReadCargoLayoutResult>
}
