/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BuildCargoLayoutInputParams } from './cargo-layout-hash.types.js'

/**
 * Spec 145 D15 + D10: sem capacidade ou sem baú medido não há planta possível, e a API não pede
 * cálculo. ⚠️ O pacote nunca devolve `null` sem baú — devolve `placement: null`, que o worker
 * gravaria `ready`; por isso o filtro é daqui, antes de enfileirar.
 */
export function canRequestCargoLayout(params: BuildCargoLayoutInputParams): boolean {
  if (params.capacityM3 === null) return false
  return params.bedDimensions !== null && params.bedDimensions !== undefined
}
