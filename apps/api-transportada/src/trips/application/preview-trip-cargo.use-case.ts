/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { formatScaledDecimal, parseScaledDecimal } from '../../shared/decimal.service.js'
import type { CargoBedDimensions } from '../domain/cargo-layout.policy.js'
import type { CargoPlanBox } from '../domain/cargo-plan.policy.js'
import { resolveCargoLayout, type ResolvedCargoLayout } from '../domain/cargo-layout.policy.js'
import {
  buildCargoPreviewStops,
  type CargoPreviewDocument,
} from '../domain/cargo-preview.policy.js'
import {
  detectWeightConcentration,
  type WeightConcentration,
} from '../domain/weight-concentration.policy.js'
import type { LoadingAccess } from '../../shared/loading-access.constant.js'
import type { TripCargoWeightView, TripOccupancyView } from './trip.port.js'

/** A escala de `nfe_volumes.gross_weight`. */
const WEIGHT_SCALE = 4n

export type TripCargoPreview = {
  readonly cargoLayout: ResolvedCargoLayout | null
  readonly cargoWeight: TripCargoWeightView | null
  readonly occupancy: TripOccupancyView | null
  /**
   * Spec 085 G006: a parada que domina o peso, quando alguma domina. O desenho do baú é de volume,
   * e volume não conta esta história — quem carrega precisa das duas.
   */
  readonly weightConcentration: WeightConcentration | null
}

export type TripCargoPreviewContext = {
  /** Spec 088 D2: a medida do baú, da ficha do veículo — independente de haver cubagem. */
  readonly bedDimensions: CargoBedDimensions | null
  /** Spec 088 G003: as caixas medidas por nota — a parada as reúne no mesmo agrupamento. */
  readonly boxesByDocument: ReadonlyMap<string, readonly CargoPlanBox[]>
  readonly capacityM3: string | null
  readonly loadingAccess: LoadingAccess
  readonly cargoWeight: TripCargoWeightView | null
  readonly documents: readonly CargoPreviewDocument[]
  readonly occupancy: TripOccupancyView | null
}

export type TripCargoPreviewPort = {
  readCargoPreviewContext(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  }): Promise<TripCargoPreviewContext>
}

export type PreviewTripCargoInput = {
  readonly companyId: string
  readonly nfeDocumentIds: readonly string[]
  readonly repository: TripCargoPreviewPort
  /** A ordem que o operador montou no mapa, por chave de parada. Vazia é ordem de chegada. */
  readonly stopOrder: readonly string[]
  readonly vehicleId: string
}

/**
 * A carga desenhada **antes de a viagem existir** — é onde a pergunta "cabe?" é feita, e depois de
 * criada a decisão já foi tomada.
 *
 * ⚠️ Ela não repete nenhuma conta: ocupação, peso e cubagem por nota saem dos mesmos suportes que o
 * detalhe usa, e as paradas do mesmo `buildStopAddressKey` que o vínculo cria. Recalcular qualquer
 * um deles aqui produziria um segundo número que discordaria da viagem no primeiro caso de borda.
 *
 * Veículo desconhecido não é erro: sem capacidade a divisão entre paradas continua valendo, e é o
 * `occupancyKnown` do layout que diz que o espaço livre não é afirmado.
 */
export async function previewTripCargo(input: PreviewTripCargoInput): Promise<TripCargoPreview> {
  const context = await input.repository.readCargoPreviewContext({
    companyId: input.companyId,
    nfeDocumentIds: input.nfeDocumentIds,
    vehicleId: input.vehicleId,
  })

  return {
    cargoLayout: resolveCargoLayout({
      /** Spec 088 D2: só a ficha desenha planta — a referência de mercado erra por 2× no tipo. */
      bedDimensions: context.bedDimensions,
      capacityM3: context.capacityM3,
      loadingAccess: context.loadingAccess,
      stops: buildCargoPreviewStops({
        boxesByDocument: context.boxesByDocument,
        documents: context.documents,
        order: input.stopOrder,
      }),
    }),
    cargoWeight: context.cargoWeight,
    occupancy: context.occupancy,
    weightConcentration: detectWeightConcentration({ stops: sumWeightByStop(context.documents) }),
  }
}

/**
 * O peso somado por **parada**, com a mesma chave que agrupa o desenho. Nota cujo endereço não
 * normaliza vira parada própria, como em `buildCargoPreviewStops` — dois critérios de agrupamento
 * fariam o alerta apontar para uma parada que o desenho não mostra.
 */
function sumWeightByStop(
  documents: readonly CargoPreviewDocument[],
): readonly { readonly stopId: string; readonly weightKilograms: string | null }[] {
  /**
   * ⚠️ Soma em `bigint` escalado, não em `number`: `nfe_volumes.gross_weight` é `numeric(_,4)`, e
   * somar em float e voltar por `String()` produz `"0.30000000000000004"` — e notação exponencial
   * em totais grandes, que o próximo leitor da string não reabre.
   */
  const byStop = new Map<string, bigint>()
  for (const document of documents) {
    const stopId = document.addressKey ?? `documento:${document.nfeDocumentId}`
    const weight =
      document.weightKilograms === null
        ? 0n
        : parseScaledDecimal({
            errorCodePrefix: 'TRIP_CARGO_PREVIEW',
            scale: WEIGHT_SCALE,
            value: document.weightKilograms,
          })
    byStop.set(stopId, (byStop.get(stopId) ?? 0n) + weight)
  }
  return [...byStop].map(([stopId, weight]) => ({
    stopId,
    weightKilograms: formatScaledDecimal(weight, WEIGHT_SCALE),
  }))
}
