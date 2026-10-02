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
 *
 * Spec 223 (revisão da T5.2): cancelar e encerrar recusam **o mesmo** par de estados, por razões
 * que coincidem — um vocabulário só, declarado uma vez. Se um dia divergirem, quem divergir separa
 * os dois arrays aqui; manter duas cópias byte a byte convidava a divergência silenciosa.
 */
const TERMINAL_STATUSES: readonly TripStatus[] = ['cancelled', 'completed']

export function isCancellable(trip: Trip): boolean {
  return !TERMINAL_STATUSES.includes(trip.status)
}

/** Só o que está marcado **e** ainda pode ser cancelado — a interseção, nunca a marcação crua. */
export function cancellableSelection(input: {
  readonly selectedIds: readonly string[]
  readonly trips: readonly Trip[]
}): readonly Trip[] {
  const selected = new Set(input.selectedIds)

  return input.trips.filter((trip) => selected.has(trip.id) && isCancellable(trip))
}

/**
 * Spec 223 RF8 (ADR-0091): encerrar segue as mesmas duas recusas do detalhe — concluída já está
 * encerrada, e cancelada não encerra (spec 158 T12). Todo o resto do vocabulário encerra.
 */
export function isCloseable(trip: Trip): boolean {
  return !TERMINAL_STATUSES.includes(trip.status)
}

/**
 * Tem caixa de marcação quem pode receber **alguma** das duas ações do lote. Filtrar só por
 * `isCancellable` esconderia a caixa de uma viagem encerrável-e-não-cancelável no dia em que os
 * dois vocabulários divergirem — sem erro visível, com o botão de encerrar inalcançável.
 */
export function isSelectableForBulk(trip: Trip): boolean {
  return isCancellable(trip) || isCloseable(trip)
}

/** As marcadas sobre as quais a permissão de quem olha oferece alguma ação — a conta da barra. */
export function bulkActionableSelection(input: {
  readonly canCancel: boolean
  readonly canClose: boolean
  readonly selectedIds: readonly string[]
  readonly trips: readonly Trip[]
}): readonly Trip[] {
  const selected = new Set(input.selectedIds)

  return input.trips.filter(
    (trip) =>
      selected.has(trip.id) &&
      ((input.canCancel && isCancellable(trip)) || (input.canClose && isCloseable(trip))),
  )
}

/** Só o que está marcado **e** ainda pode encerrar — a interseção, nunca a marcação crua. */
export function closeableSelection(input: {
  readonly selectedIds: readonly string[]
  readonly trips: readonly Trip[]
}): readonly Trip[] {
  const selected = new Set(input.selectedIds)

  return input.trips.filter((trip) => selected.has(trip.id) && isCloseable(trip))
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
 * "Selecionar todos" marca **o que a página mostra e aceita alguma ação de lote** — nunca o que
 * está fora da página, que o operador não viu, e nunca a terminal, que não aceita nenhuma.
 */
export function selectAllOnPage(trips: readonly Trip[]): readonly string[] {
  return trips.filter(isSelectableForBulk).map((trip) => trip.id)
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
