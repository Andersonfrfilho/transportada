/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O botão de ocorrência de separação vale para **toda nota da viagem**, em qualquer status de
 * separação (pendente, separada, carregada) — não é uma capacidade por nota como `fieldOccurrence`
 * (`tripFieldActions.service.ts`), porque `canManage`, `isEditable` e o catálogo de tipos não
 * variam nota a nota dentro da mesma viagem.
 */
import { TRIP_OCCURRENCE_STAGE } from './occurrence.constant'
import type { OccurrenceType } from './occurrence.constant'

export type ResolveSeparationOccurrenceButtonVisibilityInput = Readonly<{
  canManage: boolean
  isEditable: boolean
  types: readonly OccurrenceType[]
}>

/**
 * Mesma regra de `TripOccurrences` (só tipos ativos de `separation`) — sem isso o botão apareceria
 * oferecendo um formulário sem opção nenhuma para escolher.
 */
export function resolveSeparationOccurrenceButtonVisibility({
  canManage,
  isEditable,
  types,
}: ResolveSeparationOccurrenceButtonVisibilityInput): boolean {
  if (!canManage || !isEditable) return false
  return types.some((type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.separation)
}
