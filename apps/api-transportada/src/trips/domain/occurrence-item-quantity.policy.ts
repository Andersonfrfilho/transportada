/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166: quanto de cada item marcado foi atingido — opcional, e sempre alinhado por índice à
 * lista de itens (`resolveOccurrenceProductSelection`). Política pura: prova as regras sem HTTP,
 * sem banco, sem depender de multipart.
 */
import { OCCURRENCE_ITEM_QUANTITY_UNIT } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceItemQuantityUnit } from '../../shared/trip-occurrence.constant.js'
import {
  OccurrenceItemQuantityLengthMismatchError,
  OccurrenceItemQuantityNotPositiveError,
  OccurrenceItemQuantityUnitPairingError,
  OccurrenceItemQuantityUnitUnknownError,
} from './trip.error.js'

const QUANTITY_UNITS = new Set<string>(Object.values(OCCURRENCE_ITEM_QUANTITY_UNIT))

/** Um número decimal simples — sem sinal, sem notação científica, sem separador de milhar. */
const QUANTITY_PATTERN = /^\d+(\.\d+)?$/

export type OccurrenceItemQuantityRawInput = {
  /** A lista já resolvida (`resolveOccurrenceProductSelection`), na mesma ordem marcada. */
  readonly productCodes: readonly string[]
  /**
   * Alinhada por índice a `productCodes`. **Vazia é "ninguém mandou nada"** — compatibilidade com
   * quem ainda não manda o campo — e não é confrontada com o tamanho de `productCodes`. Presente,
   * o tamanho tem que bater: alinhamento por adivinhação nunca.
   */
  readonly quantities: readonly string[]
  readonly units: readonly string[]
}

export type OccurrenceItemQuantity = {
  readonly code: string
  /** Formato decimal cru, como digitado (`"3.5"`) — quem grava decide a escala do banco. */
  readonly quantity: null | string
  readonly unit: null | OccurrenceItemQuantityUnit
}

/**
 * ⚠️ **Os dois campos andam juntos** (RF1): quantidade sem unidade, ou o contrário, é recusado
 * aqui — o mesmo par que o CHECK do banco casa, só que com o código estável de quem escreveu.
 *
 * ⚠️ **Zero e negativo são recusados** (RF2): zero é "não aconteceu", e isso se diz não marcando o
 * item, nunca com zero gravado.
 */
export function resolveOccurrenceItemQuantities(
  input: OccurrenceItemQuantityRawInput,
): readonly OccurrenceItemQuantity[] {
  const { productCodes, quantities, units } = input

  if (quantities.length > 0 && quantities.length !== productCodes.length) {
    throw new OccurrenceItemQuantityLengthMismatchError()
  }
  if (units.length > 0 && units.length !== productCodes.length) {
    throw new OccurrenceItemQuantityLengthMismatchError()
  }

  return productCodes.map((code, index) => {
    const rawQuantity = (quantities[index] ?? '').trim()
    const rawUnit = (units[index] ?? '').trim()

    if (rawQuantity === '' && rawUnit === '') return { code, quantity: null, unit: null }
    if (rawQuantity === '' || rawUnit === '') throw new OccurrenceItemQuantityUnitPairingError()
    if (!QUANTITY_UNITS.has(rawUnit)) throw new OccurrenceItemQuantityUnitUnknownError()
    if (!QUANTITY_PATTERN.test(rawQuantity) || Number(rawQuantity) <= 0) {
      throw new OccurrenceItemQuantityNotPositiveError()
    }

    return { code, quantity: rawQuantity, unit: rawUnit as OccurrenceItemQuantityUnit }
  })
}
