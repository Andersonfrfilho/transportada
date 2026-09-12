/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CargoBedDimensions,
  CargoLayoutStop,
  LoadingAccess,
  MeasuredBoxShape,
} from '@adatechnology/cargo-placement'

/**
 * Spec 145 D6: o mesmo objeto que `resolveCargoLayout` já recebe hoje
 * (`drizzle-trip.repository.ts` e `preview-trip-cargo.use-case.ts`), mais `policyVersion` — ausente
 * assume a constante do pacote (`CARGO_LAYOUT_POLICY_VERSION`).
 */
export type BuildCargoLayoutInputParams = {
  readonly bedDimensions?: CargoBedDimensions | null
  readonly capacityM3: string | null
  readonly fallbackBoxVolumeM3?: number | null
  readonly loadingAccess?: LoadingAccess
  readonly measuredShapes?: readonly MeasuredBoxShape[]
  readonly payloadRatio?: string | null
  readonly policyVersion?: string
  readonly securesCargo?: boolean
  readonly stops: readonly CargoLayoutStop[]
}

/** As três dimensões que decidem como a caixa se arruma — `null` é dimensão que ninguém mediu. */
export type CargoLayoutBoxDimensionsInput = {
  readonly heightMm: number | null
  readonly lengthMm: number | null
  readonly widthMm: number | null
}

/**
 * Spec 145 D6: `label`/`documentNumber`/`productCode` ficam de fora — identificam a caixa para
 * quem lê, nunca mudam onde ela é desenhada.
 */
export type CargoLayoutBoxInput = {
  readonly dims: CargoLayoutBoxDimensionsInput
  readonly documentId: string | null
  /** `true` quando as três dimensões vieram da ficha — a mesma distinção de `PlacementBox.source`. */
  readonly measured: boolean
  readonly quantity: number
}

export type CargoLayoutStopInput = {
  readonly boxes: readonly CargoLayoutBoxInput[]
  readonly sequence: number
}

export type CargoLayoutBedInput = {
  readonly heightM: string
  readonly lengthM: string
  readonly source: 'measured' | 'reference'
  readonly widthM: string
}

/**
 * Spec 145 D5: o que a coluna `input` guarda — a entrada inteira de `resolveCargoLayout`, com rótulo,
 * cliente e número de nota. O hash (D6) descarta a etiqueta; o worker não pode, porque a planta que ele
 * grava é a mesma que a tela lê, e ele não relê a viagem.
 */
export type StoredCargoLayoutInput = {
  readonly bedDimensions: CargoBedDimensions | null
  readonly capacityM3: string | null
  readonly fallbackBoxVolumeM3: number | null
  readonly loadingAccess: LoadingAccess
  readonly measuredShapes: readonly MeasuredBoxShape[]
  readonly payloadRatio: string | null
  readonly policyVersion: string
  readonly securesCargo: boolean
  readonly stops: readonly CargoLayoutStop[]
}

/** O retrato canônico da D6 — o que entra no hash, e nada que só mude o rótulo. */
export type CargoLayoutInput = {
  readonly bed: CargoLayoutBedInput | null
  readonly capacityM3: string | null
  readonly fallbackBoxVolumeM3: number | null
  readonly loadingAccess: LoadingAccess
  readonly measuredShapes: readonly MeasuredBoxShape[]
  readonly payloadRatio: string | null
  readonly policyVersion: string
  readonly securesCargo: boolean
  readonly stops: readonly CargoLayoutStopInput[]
}
