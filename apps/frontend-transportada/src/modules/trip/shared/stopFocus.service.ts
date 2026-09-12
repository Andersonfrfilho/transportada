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
 *
 * `hiddenBoxes` apaga caixa a caixa dentro de uma nota ou parada acesa (spec 131 do clique no mapa):
 * é um recorte por cima do foco, e nunca sobrevive ao foco voltar a "tudo aceso" — do contrário uma
 * caixa apagada continuaria apagada numa carga que nem foi escolhida.
 */
export type CargoFocus = Readonly<{
  hiddenBoxes: ReadonlySet<string>
  notes: ReadonlySet<string>
  stops: StopFocus
}>

export const EMPTY_CARGO_FOCUS: CargoFocus = {
  hiddenBoxes: new Set<string>(),
  notes: new Set<string>(),
  stops: EMPTY_STOP_FOCUS,
}

/** Sem nota nem parada em foco o recorte por caixa perde o sentido — some junto. */
function resetHiddenBoxesWhenAllLit(focus: CargoFocus): CargoFocus {
  if (focus.notes.size > 0 || focus.stops.size > 0 || focus.hiddenBoxes.size === 0) return focus

  return { ...focus, hiddenBoxes: new Set<string>() }
}

export function toggleCargoStopFocus(focus: CargoFocus, stopSequence: number): CargoFocus {
  return resetHiddenBoxesWhenAllLit({ ...focus, stops: toggleStopFocus(focus.stops, stopSequence) })
}

export function toggleNoteFocus(focus: CargoFocus, documentId: string): CargoFocus {
  const notes = new Set(focus.notes)
  if (notes.has(documentId)) notes.delete(documentId)
  else notes.add(documentId)

  return resetHiddenBoxesWhenAllLit({ ...focus, notes })
}

export function isBoxLit(
  focus: CargoFocus,
  box: Readonly<{
    documentId?: string | null | undefined
    id?: string | undefined
    stopSequence: number
  }>,
): boolean {
  if (box.id !== undefined && focus.hiddenBoxes.has(box.id)) return false
  if (focus.notes.size === 0 && focus.stops.size === 0) return true
  if (focus.stops.has(box.stopSequence)) return true

  return box.documentId !== null && box.documentId !== undefined && focus.notes.has(box.documentId)
}

/**
 * Clicar numa caixa acende a nota (ou a parada, sem nota) inteira dela. Clicar de novo numa caixa já
 * acesa apaga só ela — a nota continua acesa, é a caixa que sai. Clicar na que estava apagada devolve
 * só ela ao desenho.
 */
export function toggleBoxFocus(
  focus: CargoFocus,
  box: Readonly<{ documentId?: string | null | undefined; id: string; stopSequence: number }>,
): CargoFocus {
  if (focus.hiddenBoxes.has(box.id)) {
    const hiddenBoxes = new Set(focus.hiddenBoxes)
    hiddenBoxes.delete(box.id)
    return resetHiddenBoxesWhenAllLit({ ...focus, hiddenBoxes })
  }

  const allLit = focus.notes.size === 0 && focus.stops.size === 0
  if (!allLit && isBoxLit(focus, box)) {
    const hiddenBoxes = new Set(focus.hiddenBoxes)
    hiddenBoxes.add(box.id)
    return { ...focus, hiddenBoxes }
  }

  if (box.documentId !== null && box.documentId !== undefined)
    return toggleNoteFocus(focus, box.documentId)

  return toggleCargoStopFocus(focus, box.stopSequence)
}
