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
