/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166: quanto de cada item marcado foi atingido — opcional, e sempre alinhado por índice à
 * lista de itens (`resolveOccurrenceProductSelection`). Política pura: prova as regras sem HTTP,
 * sem banco, sem depender de multipart.
 *
 * Spec 172 (RF1/RF2/RF3): a unidade aceita deixou de ser só `unit`/`box` — cada item também aceita
 * a **própria** unidade comercial da nota (`commercialUnit`). Isso não abre a validação para
 * qualquer string: o que o cliente manda continua sendo conferido contra um vocabulário — só que o
 * vocabulário agora é **por item**, montado daqui (unit/box + a unidade daquele item específico),
 * nunca uma lista global fixa em código.
 */
import { OCCURRENCE_ITEM_QUANTITY_UNIT } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceItemQuantityUnit } from '../../shared/trip-occurrence.constant.js'
import {
  OccurrenceItemQuantityLengthMismatchError,
  OccurrenceItemQuantityNotPositiveError,
  OccurrenceItemQuantityUnitPairingError,
  OccurrenceItemQuantityUnitUnknownError,
} from './trip.error.js'

const FALLBACK_QUANTITY_UNITS = new Set<string>(Object.values(OCCURRENCE_ITEM_QUANTITY_UNIT))

/** Um número decimal simples — sem sinal, sem notação científica, sem separador de milhar. */
const QUANTITY_PATTERN = /^\d+(\.\d+)?$/

/** O que a política precisa saber de cada item da nota para montar a unidade aceita dele. */
export type OccurrenceItemQuantityProduct = {
  readonly code: string
  /** Ausente ou vazia é item sem unidade comercial declarada (RF3) — cai no par unit/box. */
  readonly commercialUnit?: string
}

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
  /**
   * Spec 172 (RF2): os itens da nota, para achar a unidade comercial de cada `productCodes[i]`.
   * Ausente é "nenhum item traz unidade comercial" — o vocabulário aceito vira só unit/box, como
   * antes desta spec (compatibilidade com quem ainda chama a política sem o dado novo).
   */
  readonly products?: readonly OccurrenceItemQuantityProduct[]
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

  const commercialUnitByCode = new Map(
    (input.products ?? [])
      .map((product) => [product.code.trim(), (product.commercialUnit ?? '').trim()] as const)
      .filter(([, commercialUnit]) => commercialUnit !== ''),
  )

  return productCodes.map((code, index) => {
    const rawQuantity = (quantities[index] ?? '').trim()
    const rawUnit = (units[index] ?? '').trim()

    if (rawQuantity === '' && rawUnit === '') return { code, quantity: null, unit: null }
    if (rawQuantity === '' || rawUnit === '') throw new OccurrenceItemQuantityUnitPairingError()

    /**
     * Spec 172 (RF2/RF6): o vocabulário aceito para este item é unit/box mais a unidade comercial
     * *daquele item*, nunca uma lista global — apontar a unidade de outro item da mesma nota é tão
     * errado quanto inventar uma sigla nova.
     */
    const itemCommercialUnit = commercialUnitByCode.get(code)
    const isKnownUnit = FALLBACK_QUANTITY_UNITS.has(rawUnit) || rawUnit === itemCommercialUnit
    if (!isKnownUnit) throw new OccurrenceItemQuantityUnitUnknownError()
    if (!QUANTITY_PATTERN.test(rawQuantity) || Number(rawQuantity) <= 0) {
      throw new OccurrenceItemQuantityNotPositiveError()
    }

    return { code, quantity: rawQuantity, unit: rawUnit as OccurrenceItemQuantityUnit }
  })
}
