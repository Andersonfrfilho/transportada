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

type ToggleCargoStopFocusParams = Readonly<{
  /** Toda nota da parada — dissolvida do foco junto com ela, tanto ao ligar quanto ao desligar. */
  documentIds: readonly string[]
  sequence: number
}>

/**
 * Clicar na parada acende o baú dela inteiro. Se ela já estava acesa **pelas notas** (uma a uma), o
 * clique também a apaga — do contrário a parada pareceria continuar apagada mesmo com toda nota
 * acesa.
 */
export function toggleCargoStopFocus(
  focus: CargoFocus,
  { documentIds, sequence }: ToggleCargoStopFocusParams,
): CargoFocus {
  if (focus.stops.has(sequence)) {
    const stops = new Set(focus.stops)
    stops.delete(sequence)
    const notes = new Set(focus.notes)
    for (const documentId of documentIds) notes.delete(documentId)
    return resetHiddenBoxesWhenAllLit({ ...focus, notes, stops })
  }

  const notes = new Set(focus.notes)
  const isSelectedThroughNotes =
    documentIds.length > 0 && documentIds.every((documentId) => notes.has(documentId))
  if (isSelectedThroughNotes) {
    for (const documentId of documentIds) notes.delete(documentId)
    return resetHiddenBoxesWhenAllLit({ ...focus, notes })
  }

  for (const documentId of documentIds) notes.delete(documentId)
  const stops = new Set(focus.stops)
  stops.add(sequence)
  return resetHiddenBoxesWhenAllLit({ ...focus, notes, stops })
}

type ToggleNoteFocusParams = Readonly<{
  documentId: string
  /** Toda nota da mesma parada, este documentId incluso — só usada quando a parada se dissolve. */
  siblingDocumentIds: readonly string[]
  stopSequence: number
}>

/**
 * Clicar numa nota de uma parada **selecionada pela parada** (não pelas notas) apaga só ela: a
 * parada se dissolve em notas, cada irmã fica acesa e esta única fica apagada. Fora desse caso, o
 * clique liga/desliga a nota como sempre.
 */
export function toggleNoteFocus(
  focus: CargoFocus,
  { documentId, siblingDocumentIds, stopSequence }: ToggleNoteFocusParams,
): CargoFocus {
  if (focus.stops.has(stopSequence)) {
    const stops = new Set(focus.stops)
    stops.delete(stopSequence)
    const notes = new Set(focus.notes)
    for (const siblingId of siblingDocumentIds) {
      if (siblingId !== documentId) notes.add(siblingId)
    }
    notes.delete(documentId)
    return resetHiddenBoxesWhenAllLit({ ...focus, notes, stops })
  }

  const notes = new Set(focus.notes)
  if (notes.has(documentId)) notes.delete(documentId)
  else notes.add(documentId)

  return resetHiddenBoxesWhenAllLit({ ...focus, notes })
}

/** Verdadeiro só quando a nota está selecionada — os dois conjuntos vazios (tudo aceso) não contam. */
export function isNoteLit(
  focus: CargoFocus,
  note: Readonly<{ documentId: string; stopSequence: number }>,
): boolean {
  return focus.notes.has(note.documentId) || focus.stops.has(note.stopSequence)
}

/**
 * A parada está selecionada tanto quando ela mesma está no foco quanto quando toda nota dela está —
 * o segundo caso é o rastro de dissolver a parada nota a nota e religar todas de volta.
 */
export function isStopSelected(
  focus: CargoFocus,
  stop: Readonly<{ documentIds: readonly string[]; sequence: number }>,
): boolean {
  if (focus.stops.has(stop.sequence)) return true

  return (
    stop.documentIds.length > 0 &&
    stop.documentIds.every((documentId) => focus.notes.has(documentId))
  )
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
    return toggleNoteFocus(focus, {
      documentId: box.documentId,
      siblingDocumentIds: [box.documentId],
      stopSequence: box.stopSequence,
    })

  return toggleCargoStopFocus(focus, { documentIds: [], sequence: box.stopSequence })
}
