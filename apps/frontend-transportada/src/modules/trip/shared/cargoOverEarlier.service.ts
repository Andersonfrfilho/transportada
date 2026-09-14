/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 148 D5: a caixa que a passada final pôs por cima de uma entrega que desce antes. Ela sempre
 * carrega também `needsRehandling`; `coversStops` diz quais entregas ela cobre.
 */
export const OVER_EARLIER_DELIVERY_REASON = 'overEarlierDelivery'

type OverEarlierBox = Readonly<{
  coversStops?: readonly number[] | undefined
  documentId?: string | null | undefined
  documentNumber?: string | null | undefined
  label: string
  reasons: readonly string[]
  stopSequence: number
}>

export type OverEarlierDeliveryRow = Readonly<{
  boxes: number
  /** A primeira entrega coberta: é nela que a caixa sai do caminho. `null` em planta sem `coversStops`. */
  clearAtStop: number | null
  coversStops: readonly number[]
  documentId: string | null
  documentNumber: string | null
  label: string
  stopSequence: number
}>

export function isOverEarlierDeliveryBox(box: Readonly<{ reasons: readonly string[] }>): boolean {
  return box.reasons.includes(OVER_EARLIER_DELIVERY_REASON)
}

/** Parada é inteiro positivo; o resto é descartado em vez de derrubar a lista. */
function readCoveredStops(coversStops: unknown): readonly number[] {
  if (!Array.isArray(coversStops)) return []
  const stops = coversStops.filter(
    (stop): stop is number => typeof stop === 'number' && Number.isInteger(stop) && stop > 0,
  )
  return [...new Set(stops)].sort((first, second) => first - second)
}

/**
 * A lista "Caixas por cima": uma linha por caixa igual da mesma nota, na mesma entrega e cobrindo
 * as mesmas entregas, na ordem em que o conferente as encontra ao descarregar.
 */
export function buildOverEarlierDeliveryRows(
  boxes: readonly OverEarlierBox[],
): readonly OverEarlierDeliveryRow[] {
  const rows = new Map<string, OverEarlierDeliveryRow>()
  for (const box of boxes) {
    if (!isOverEarlierDeliveryBox(box)) continue
    const coversStops = readCoveredStops(box.coversStops)
    const documentId = box.documentId ?? null
    const key = [documentId ?? '', box.label, box.stopSequence, coversStops.join(',')].join('|')
    const current = rows.get(key)
    rows.set(key, {
      boxes: (current?.boxes ?? 0) + 1,
      clearAtStop: coversStops[0] ?? null,
      coversStops,
      documentId,
      documentNumber: box.documentNumber ?? null,
      label: box.label,
      stopSequence: box.stopSequence,
    })
  }

  return [...rows.values()].sort(
    (first, second) =>
      (first.clearAtStop ?? Number.POSITIVE_INFINITY) -
        (second.clearAtStop ?? Number.POSITIVE_INFINITY) ||
      first.stopSequence - second.stopSequence,
  )
}
