/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveCargoLayout } from '@adatechnology/cargo-placement'

import { canRequestCargoLayout } from '../domain/cargo-layout-availability.policy.js'
import { buildCargoLayoutInput, hashCargoLayoutInput } from '../domain/cargo-layout-hash.policy.js'
import { relabelCargoLayout } from '../domain/cargo-layout-label.policy.js'
import {
  UNAVAILABLE_CARGO_LAYOUT_STATE,
  markCargoLayoutRequested,
  resolveCargoLayoutReading,
} from '../domain/cargo-layout-state.policy.js'
import type {
  ResolvePreviewCargoLayoutParams,
  ResolvePreviewCargoLayoutResult,
} from './preview-cargo-layout.types.js'
import type { RequestCargoLayoutResult } from './request-cargo-layout.types.js'

/** D3: a prévia ainda não é viagem — o pedido nasce com `tripId null`, e a viagem o adota depois. */
function requestPreviewCargoLayout(
  params: ResolvePreviewCargoLayoutParams,
): Promise<RequestCargoLayoutResult> {
  return params.requestCargoLayout.execute({
    ...params.layoutInput,
    companyId: params.companyId,
    correlationId: params.correlationId,
    tripId: null,
  })
}

/**
 * Spec 145 D3/D10 (T11): a planta da prévia sai de `trip_cargo_layouts` pelo hash, nunca do
 * empacotador na requisição — foi a prévia de 82 paradas que travou o event loop.
 *
 * - Sem capacidade ou sem baú (D15): a planta leve de antes, na hora, `unavailable`. Com o baú
 *   forçado a `null`, `placeCargo` devolve `null` na primeira linha e nada é empacotado.
 * - Senão: a linha do hash decide; sem linha, ou falha/pedido parado além do lease (D18), o upsert
 *   pede de novo — os mesmos casos do detalhe (T10). Reabriu, a resposta é `pending` sem código;
 *   `failed` dentro da espera sai como está. Pendente é `cargoLayout: null`.
 */
export async function resolvePreviewCargoLayout(
  params: ResolvePreviewCargoLayoutParams,
): Promise<ResolvePreviewCargoLayoutResult> {
  const { layoutInput } = params
  if (!canRequestCargoLayout(layoutInput)) {
    return {
      cargoLayout: resolveCargoLayout({ ...layoutInput, bedDimensions: null }),
      state: UNAVAILABLE_CARGO_LAYOUT_STATE,
    }
  }

  const inputHash = hashCargoLayoutInput(buildCargoLayoutInput(layoutInput))
  const stored = await params.layouts.findByInputHash({ companyId: params.companyId, inputHash })
  const reading = resolveCargoLayoutReading({ current: stored, previousReady: undefined })
  const request = reading.shouldRequest ? await requestPreviewCargoLayout(params) : undefined
  const layoutId = request?.layoutId ?? stored?.id

  return {
    /** D20: o hash ignora a etiqueta — a da planta pronta pode ser de antes; a de agora está aqui. */
    cargoLayout:
      reading.cargoLayout === null ? null : relabelCargoLayout(reading.cargoLayout, layoutInput),
    ...(layoutId === undefined ? {} : { layoutId }),
    state:
      request?.enqueued === true
        ? markCargoLayoutRequested(reading.cargoLayoutState)
        : reading.cargoLayoutState,
  }
}
