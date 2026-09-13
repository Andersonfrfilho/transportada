/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D20 (T16): o hash ignora a etiqueta (D6), então a planta `ready` pode ter sido desenhada com
 * o rótulo, o cliente ou o número de nota de antes. Aqui a etiqueta da planta servida é trocada pela da
 * entrada de agora — sem recalcular nada. Posição, dimensão, contagem e motivo nunca são tocados.
 *
 * ⚠️ Parada ou caixa sem par na entrada de agora fica como está: etiqueta inventada é pior que velha.
 */
import type {
  CargoLayoutStop,
  CargoPlanBox,
  ResolvedCargoLayout,
} from '@adatechnology/cargo-placement'

export type RelabelCargoLayoutSource = { readonly stops: readonly CargoLayoutStop[] }

type LayoutPlacement = NonNullable<ResolvedCargoLayout['placement']>
type PlacedLayoutBox = LayoutPlacement['layers'][number]['boxes'][number]
type LayoutPendingMeasurement = ResolvedCargoLayout['pendingMeasurements'][number]

type RelabelContext = {
  /** Rótulo antigo da parada → o de agora, só quando o antigo aponta para um único novo. */
  readonly stopLabelRenames: ReadonlyMap<string, string>
  readonly stopsBySequence: ReadonlyMap<number, CargoLayoutStop>
}

/** O único valor da lista; `undefined` quando ela é vazia ou ambígua. */
function singleValueOf<TValue>(values: readonly TValue[]): { readonly value: TValue } | undefined {
  const distinct = [...new Set(values)]
  return distinct.length === 1 ? { value: distinct[0] as TValue } : undefined
}

function isUnmeasuredBox(box: CargoPlanBox): boolean {
  return box.heightMm === null && box.lengthMm === null && box.widthMm === null
}

/** A caixa fora do baú não tem parada nem nota — só o rótulo antigo da parada a liga à de agora. */
function buildStopLabelRenames(
  layout: ResolvedCargoLayout,
  stopsBySequence: ReadonlyMap<number, CargoLayoutStop>,
): ReadonlyMap<string, string> {
  const candidates = new Map<string, Set<string>>()
  for (const entry of [...layout.rows, ...layout.slices]) {
    const stop = stopsBySequence.get(entry.sequence)
    if (stop === undefined) continue
    candidates.set(entry.label, (candidates.get(entry.label) ?? new Set()).add(stop.label))
  }

  const renames = new Map<string, string>()
  for (const [oldLabel, newLabels] of candidates) {
    const single = singleValueOf([...newLabels])
    if (single !== undefined) renames.set(oldLabel, single.value)
  }
  return renames
}

/** A caixa posicionada casa pela parada e pela nota (`documentId`) — a mesma carona da spec 119. */
function relabelPlacedBox(box: PlacedLayoutBox, context: RelabelContext): PlacedLayoutBox {
  const stop = context.stopsBySequence.get(box.stopSequence)
  if (stop === undefined) return box
  if (box.documentId === null) {
    return { ...box, label: context.stopLabelRenames.get(box.label) ?? box.label }
  }

  const noteBoxes = (stop.boxes ?? []).filter((item) => item.documentId === box.documentId)
  const labels = noteBoxes.map((item) => item.label ?? stop.label)
  const label = labels.includes(box.label) ? undefined : singleValueOf(labels)
  const documentNumber = singleValueOf(noteBoxes.map((item) => item.documentNumber ?? null))
  return {
    ...box,
    documentNumber: documentNumber === undefined ? box.documentNumber : documentNumber.value,
    label: label === undefined ? box.label : label.value,
  }
}

function relabelPlacement(placement: LayoutPlacement, context: RelabelContext): LayoutPlacement {
  return {
    ...placement,
    layers: placement.layers.map((layer) => ({
      ...layer,
      boxes: layer.boxes.map((box) => relabelPlacedBox(box, context)),
    })),
    unplaced: placement.unplaced.map((item) => ({
      ...item,
      label: context.stopLabelRenames.get(item.label) ?? item.label,
    })),
  }
}

/** A linha do que falta medir casa pela parada e pelo produto; a nota desempata quando ainda bate. */
function relabelPendingMeasurement(
  item: LayoutPendingMeasurement,
  context: RelabelContext,
): LayoutPendingMeasurement {
  const stop = context.stopsBySequence.get(item.sequence)
  if (stop === undefined) return item

  const sameProduct = (stop.boxes ?? []).filter(
    (box) => isUnmeasuredBox(box) && (box.productCode ?? null) === item.productCode,
  )
  const sameNote = sameProduct.filter((box) => (box.documentNumber ?? null) === item.documentNumber)
  const matched = sameNote.length > 0 ? sameNote : sameProduct
  const documentNumber = singleValueOf(matched.map((box) => box.documentNumber ?? null))
  const label = singleValueOf(matched.map((box) => box.label ?? null))
  return {
    ...item,
    documentNumber: documentNumber === undefined ? item.documentNumber : documentNumber.value,
    label: label === undefined ? item.label : label.value,
    stopLabel: stop.label,
  }
}

/** Sem `sequence` na saída: o par é a mesma posição entre as paradas sem cubagem, na ordem da entrada. */
function relabelStopsWithoutVolume(
  entries: ResolvedCargoLayout['stopsWithoutVolume'],
  source: RelabelCargoLayoutSource,
): ResolvedCargoLayout['stopsWithoutVolume'] {
  const withoutVolume = source.stops.filter((stop) => stop.volumeM3 === null)
  return entries.map((entry, index) => {
    const stop = withoutVolume[index]
    if (stop?.documentsWithoutVolume !== entry.documentCount) return entry
    return { ...entry, label: stop.label }
  })
}

export function relabelCargoLayout(
  layout: ResolvedCargoLayout,
  source: RelabelCargoLayoutSource,
): ResolvedCargoLayout {
  const stopsBySequence = new Map(source.stops.map((stop) => [stop.sequence, stop]))
  const context: RelabelContext = {
    stopLabelRenames: buildStopLabelRenames(layout, stopsBySequence),
    stopsBySequence,
  }

  return {
    ...layout,
    pendingMeasurements: layout.pendingMeasurements.map((item) =>
      relabelPendingMeasurement(item, context),
    ),
    placement: layout.placement === null ? null : relabelPlacement(layout.placement, context),
    rows: layout.rows.map((row) => {
      const stop = stopsBySequence.get(row.sequence)
      if (stop === undefined) return row
      return {
        ...row,
        clientName: stop.clientName ?? '',
        label: stop.label,
        noteNumbers: stop.noteNumbers ?? [],
      }
    }),
    slices: layout.slices.map((slice) => {
      const stop = stopsBySequence.get(slice.sequence)
      return stop === undefined ? slice : { ...slice, label: stop.label }
    }),
    stopsWithoutVolume: relabelStopsWithoutVolume(layout.stopsWithoutVolume, source),
  }
}
