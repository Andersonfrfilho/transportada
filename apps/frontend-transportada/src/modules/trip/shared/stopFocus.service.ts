/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * As paradas acesas no desenho da carga.
 *
 * ⚠️ **Conjunto vazio significa todas acesas.** Guardar "todas" como uma lista de paradas seria um
 * segundo jeito de dizer a mesma coisa, e os dois divergiriam na primeira parada que entrasse ou
 * saísse da viagem.
 */
export type StopFocus = ReadonlySet<number>

export const EMPTY_STOP_FOCUS: StopFocus = new Set<number>()

/** Clicar acende; clicar de novo apaga. Apagar a última devolve o desenho inteiro. */
export function toggleStopFocus(focus: StopFocus, stopSequence: number): StopFocus {
  const next = new Set(focus)
  if (next.has(stopSequence)) next.delete(stopSequence)
  else next.add(stopSequence)

  return next
}

export function isStopLit(focus: StopFocus, stopSequence: number): boolean {
  return focus.size === 0 || focus.has(stopSequence)
}

/**
 * Spec 119: as paradas **e as notas** acesas. Uma nota acesa acende só as caixas dela, e soma com as
 * paradas acesas. Os dois conjuntos vazios são o baú inteiro aceso, como sempre.
 */
export type CargoFocus = Readonly<{ notes: ReadonlySet<string>; stops: StopFocus }>

export const EMPTY_CARGO_FOCUS: CargoFocus = { notes: new Set<string>(), stops: EMPTY_STOP_FOCUS }

export function toggleCargoStopFocus(focus: CargoFocus, stopSequence: number): CargoFocus {
  return { ...focus, stops: toggleStopFocus(focus.stops, stopSequence) }
}

export function toggleNoteFocus(focus: CargoFocus, documentId: string): CargoFocus {
  const notes = new Set(focus.notes)
  if (notes.has(documentId)) notes.delete(documentId)
  else notes.add(documentId)

  return { ...focus, notes }
}

export function isBoxLit(
  focus: CargoFocus,
  box: Readonly<{ documentId?: string | null | undefined; stopSequence: number }>,
): boolean {
  if (focus.notes.size === 0 && focus.stops.size === 0) return true
  if (focus.stops.has(box.stopSequence)) return true

  return box.documentId !== null && box.documentId !== undefined && focus.notes.has(box.documentId)
}
