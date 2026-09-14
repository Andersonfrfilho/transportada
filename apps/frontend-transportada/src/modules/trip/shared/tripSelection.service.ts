/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 102: quais viagens da tabela estão marcadas, e quais delas podem ser canceladas.
 *
 * Serviço puro porque o teste desta app não tem DOM: o comportamento se prova aqui, e o componente
 * só o consome.
 */
import type { Trip, TripStatus } from './trip.types'

/**
 * ⚠️ `completed` **não** é oferecida: `checkTripTransition` a recusa, e oferecer o que vai dar `409`
 * é atrito puro. `cancelled` fica de fora porque cancelar de novo é no-op — o use case devolve
 * `unchanged` e não escreve.
 */
const NOT_CANCELLABLE: readonly TripStatus[] = ['cancelled', 'completed']

export function isCancellable(trip: Trip): boolean {
  return !NOT_CANCELLABLE.includes(trip.status)
}

/** Só o que está marcado **e** ainda pode ser cancelado — a interseção, nunca a marcação crua. */
export function cancellableSelection(input: {
  readonly selectedIds: readonly string[]
  readonly trips: readonly Trip[]
}): readonly Trip[] {
  const selected = new Set(input.selectedIds)

  return input.trips.filter((trip) => selected.has(trip.id) && isCancellable(trip))
}

export function toggleSelection(input: {
  readonly selectedIds: readonly string[]
  readonly tripId: string
}): readonly string[] {
  return input.selectedIds.includes(input.tripId)
    ? input.selectedIds.filter((id) => id !== input.tripId)
    : [...input.selectedIds, input.tripId]
}

/**
 * "Selecionar todos" marca **o que a página mostra e é cancelável** — nunca o que está fora da
 * página, que o operador não viu, e nunca a concluída, que ele não pode cancelar.
 */
export function selectAllOnPage(trips: readonly Trip[]): readonly string[] {
  return trips.filter(isCancellable).map((trip) => trip.id)
}

export type SelectAllState = 'all' | 'none' | 'some'

export function selectAllState(input: {
  readonly selectedIds: readonly string[]
  readonly trips: readonly Trip[]
}): SelectAllState {
  const selectable = selectAllOnPage(input.trips)
  if (selectable.length === 0) return 'none'

  const selected = new Set(input.selectedIds)
  const marked = selectable.filter((id) => selected.has(id)).length
  if (marked === 0) return 'none'

  return marked === selectable.length ? 'all' : 'some'
}

/**
 * ⚠️ Marcação de viagem que saiu da página é **descartada**: paginação por cursor troca o conjunto
 * inteiro, e manter ids invisíveis faria o operador cancelar o que ele não está vendo.
 */
export function pruneSelection(input: {
  readonly selectedIds: readonly string[]
  readonly trips: readonly Trip[]
}): readonly string[] {
  const onPage = new Set(input.trips.map((trip) => trip.id))

  return input.selectedIds.filter((id) => onPage.has(id))
}
