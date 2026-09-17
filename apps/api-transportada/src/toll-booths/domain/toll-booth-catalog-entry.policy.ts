/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 D1 — a forma de uma linha do catálogo (vista ou não) e a ordenação das vistas: sem
 * tarifa por eixo conhecida primeiro, depois com tarifa, desempate por `osmNodeId`. Extraído de
 * `list-toll-booth-catalog.use-case.ts` (code-standart §"File Organization", T402 item 5) — pura,
 * sem porta nenhuma, então mora no domínio, não na aplicação.
 */
import {
  resolveEffectiveTollBoothCharge,
  type EffectiveTollBoothCharge,
} from '../../companies/domain/toll-booth-charge.policy.js'

export type TollBoothCatalogEntryView = EffectiveTollBoothCharge & Readonly<{ seen: boolean }>

export function toEntryView(input: {
  readonly adjustment: Parameters<typeof resolveEffectiveTollBoothCharge>[0]['adjustment']
  readonly catalog: Parameters<typeof resolveEffectiveTollBoothCharge>[0]['catalog']
  readonly seen: boolean
}): TollBoothCatalogEntryView {
  return {
    ...resolveEffectiveTollBoothCharge({ adjustment: input.adjustment, catalog: input.catalog }),
    seen: input.seen,
  }
}

/** Vistas sem tarifa por eixo primeiro, depois vistas com tarifa; desempate por `osmNodeId` (D1). */
export function orderSeenRowsByChargeKnown(
  rows: readonly TollBoothCatalogEntryView[],
): readonly TollBoothCatalogEntryView[] {
  return [...rows].sort((left, right) => {
    const priorityDelta = seenPriorityOf(left) - seenPriorityOf(right)
    if (priorityDelta !== 0) return priorityDelta
    return left.osmNodeId - right.osmNodeId
  })
}

function seenPriorityOf(row: TollBoothCatalogEntryView): number {
  return row.effectiveChargePerAxle === null ? 0 : 1
}
