/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DEFAULT_OCCURRENCE_ITEMS_MODE,
  type OccurrenceItemsMode,
  type OccurrenceType,
} from './occurrence.constant'
import type { OccurrenceQuantitiesByCode } from './occurrenceProductSelection.service'

type ItemsModeSource = Pick<OccurrenceType, 'itemsMode'>

/** Spec 241 RF8: sem tipo escolhido, ou com API anterior ao campo, o tipo carrega itens como sempre. */
export function resolveOccurrenceItemsMode(type: ItemsModeSource | undefined): OccurrenceItemsMode {
  return type?.itemsMode ?? DEFAULT_OCCURRENCE_ITEMS_MODE
}

export function carriesOccurrenceItems(mode: OccurrenceItemsMode): boolean {
  return mode !== 'off'
}

export type OccurrenceItemsSelection = Readonly<{
  productCodes: readonly string[]
  quantitiesByCode: OccurrenceQuantitiesByCode
}>

type ItemsOnTypeChangeInput = OccurrenceItemsSelection &
  Readonly<{
    nextType: (ItemsModeSource & Pick<OccurrenceType, 'allowsMultipleItems'>) | undefined
  }>

/**
 * Trocar de tipo leva embora o que o novo tipo não aceita: `off` não carrega produto algum, e tipo
 * de item único fica com a primeira escolha — nunca soma (spec 166 RF8).
 */
export function resolveItemsOnTypeChange({
  nextType,
  productCodes,
  quantitiesByCode,
}: ItemsOnTypeChangeInput): OccurrenceItemsSelection {
  if (!carriesOccurrenceItems(resolveOccurrenceItemsMode(nextType))) {
    return { productCodes: [], quantitiesByCode: new Map() }
  }
  if (nextType?.allowsMultipleItems === false && productCodes.length > 1) {
    return { productCodes: productCodes.slice(0, 1), quantitiesByCode }
  }
  return { productCodes, quantitiesByCode }
}
