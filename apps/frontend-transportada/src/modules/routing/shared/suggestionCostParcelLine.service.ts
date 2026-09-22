/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  composeCostParcelDetail,
  type Translate,
} from '@/modules/trip-financials/shared/tripCostParcelDetail.service'
import type { TripValuationCostParcel } from '@/modules/trip-financials/shared/tripValuation.service'

/** O que a proposta precisa dizer sobre uma parcela: o número, ou o motivo dele faltar, e a origem. */
export type SuggestionCostParcelLine = Readonly<{
  amount: string
  detail: null | string
  gap: null | string
  kind: string
}>

/**
 * Spec 143: **a parcela fala quando tem o que dizer** — lacuna ou derivação. A tela listava só
 * parcela com lacuna, o que bastava enquanto a diária sem valor cadastrado era lacuna; desde que ela
 * sempre responde, a parcela do motorista perdeu a lacuna e a frase da diária sumiu da proposta, que
 * é justamente onde se aceita ou recusa a carga.
 *
 * ⚠️ Parcela sem lacuna e sem derivação **fica de fora**: o total acima já a contou, e repetir o
 * número numa lista embaixo dele não informa nada. Quem quer a conta inteira abre o razão da viagem.
 */
export function buildSuggestionCostParcelLines(input: {
  readonly parcels: readonly TripValuationCostParcel[]
  readonly t: Translate
}): readonly SuggestionCostParcelLine[] {
  const lines: SuggestionCostParcelLine[] = []

  for (const parcel of input.parcels) {
    const detail = composeCostParcelDetail({
      basis: parcel.basis,
      detail: parcel.detail,
      t: input.t,
    })
    if (parcel.gap === null && detail === null) continue

    lines.push({ amount: parcel.amount, detail, gap: parcel.gap, kind: parcel.kind })
  }

  return lines
}
