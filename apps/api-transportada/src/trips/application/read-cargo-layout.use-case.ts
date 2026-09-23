/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildPendingMeasurementBoxKey } from '../../nfe-documents/domain/pending-measurement-box.policy.js'
import { relabelCargoLayout } from '../domain/cargo-layout-label.policy.js'
import { resolveCargoLayoutReading } from '../domain/cargo-layout-state.policy.js'
import { TripCargoLayoutNotFoundError } from '../domain/trip.error.js'
import type { CargoLayoutLookupPort } from './cargo-layout-lookup.port.js'
import type { PendingMeasurementBoxLookupPort } from './pending-measurement-box-lookup.port.js'
import type {
  ReadCargoLayoutParams,
  ReadCargoLayoutResult,
  ReadCargoLayoutUseCase,
} from './read-cargo-layout.types.js'

const noPendingMeasurementBoxLookup: PendingMeasurementBoxLookupPort = {
  async findBoxIdsForPendingMeasurements() {
    return new Map()
  },
}

/**
 * Spec 145 D10 (T11): a tela pergunta de novo enquanto a planta está pendente. Aqui só se lê; a rota
 * reabre depois, quando `shouldRequest` (D16/D18). A prévia não tem viagem, então não há planta
 * anterior a servir `stale` (D3).
 *
 * Spec 168: cada pendência de medição ganha `packageBoxId` — a linha da fila diz QUAL caixa medir,
 * sem o pacote de empacotamento precisar conhecer o id. `packageBoxLookup` é opcional (default sem
 * caixa nenhuma) para não obrigar todo chamador antigo (prévia sem viagem, por exemplo) a fornecê-lo.
 */
export function createReadCargoLayoutUseCase(dependencies: {
  readonly packageBoxLookup?: PendingMeasurementBoxLookupPort
  readonly repository: CargoLayoutLookupPort
}): ReadCargoLayoutUseCase {
  const packageBoxLookup = dependencies.packageBoxLookup ?? noPendingMeasurementBoxLookup
  return {
    async execute(params: ReadCargoLayoutParams): Promise<ReadCargoLayoutResult> {
      const stored = await dependencies.repository.findById(params)
      if (stored === undefined) throw new TripCargoLayoutNotFoundError()

      const reading = resolveCargoLayoutReading({ current: stored, previousReady: undefined })
      if (reading.cargoLayout === null) {
        return {
          cargoLayout: null,
          layoutId: stored.id,
          shouldRequest: reading.shouldRequest,
          state: reading.cargoLayoutState,
        }
      }

      /** D20: sem a viagem em memória, a etiqueta de agora é a do `input` da própria linha (M3). */
      const relabeled = relabelCargoLayout(reading.cargoLayout, stored.input)
      const boxMatchesByKey = await packageBoxLookup.findBoxIdsForPendingMeasurements({
        companyId: params.companyId,
        items: relabeled.pendingMeasurements,
      })
      return {
        cargoLayout: {
          ...relabeled,
          pendingMeasurements: relabeled.pendingMeasurements.map((item) => {
            const key = buildPendingMeasurementBoxKey(item)
            const match = key === null ? undefined : boxMatchesByKey.get(key)
            return {
              ...item,
              grossWeightGrams: match?.grossWeightGrams ?? null,
              packageBoxId: match?.boxId ?? null,
              unitsPerBox: match?.unitsPerBox ?? null,
            }
          }),
        },
        layoutId: stored.id,
        shouldRequest: reading.shouldRequest,
        state: reading.cargoLayoutState,
      }
    },
  }
}
