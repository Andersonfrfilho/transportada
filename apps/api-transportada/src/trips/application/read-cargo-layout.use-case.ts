/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { relabelCargoLayout } from '../domain/cargo-layout-label.policy.js'
import { resolveCargoLayoutReading } from '../domain/cargo-layout-state.policy.js'
import { TripCargoLayoutNotFoundError } from '../domain/trip.error.js'
import type { CargoLayoutLookupPort } from './cargo-layout-lookup.port.js'
import type {
  ReadCargoLayoutParams,
  ReadCargoLayoutResult,
  ReadCargoLayoutUseCase,
} from './read-cargo-layout.types.js'

/**
 * Spec 145 D10 (T11): a tela pergunta de novo enquanto a planta está pendente. Aqui só se lê; a rota
 * reabre depois, quando `shouldRequest` (D16/D18). A prévia não tem viagem, então não há planta
 * anterior a servir `stale` (D3).
 */
export function createReadCargoLayoutUseCase(dependencies: {
  readonly repository: CargoLayoutLookupPort
}): ReadCargoLayoutUseCase {
  return {
    async execute(params: ReadCargoLayoutParams): Promise<ReadCargoLayoutResult> {
      const stored = await dependencies.repository.findById(params)
      if (stored === undefined) throw new TripCargoLayoutNotFoundError()

      const reading = resolveCargoLayoutReading({ current: stored, previousReady: undefined })
      return {
        /** D20: sem a viagem em memória, a etiqueta de agora é a do `input` da própria linha (M3). */
        cargoLayout:
          reading.cargoLayout === null
            ? null
            : relabelCargoLayout(reading.cargoLayout, stored.input),
        layoutId: stored.id,
        shouldRequest: reading.shouldRequest,
        state: reading.cargoLayoutState,
      }
    },
  }
}
