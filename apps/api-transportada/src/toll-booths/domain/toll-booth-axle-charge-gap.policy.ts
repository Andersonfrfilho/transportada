/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * RF2 (spec 154), decisão do usuário em 2026-09-17 (T202b): a contagem de "praças sem tarifa por
 * eixo conhecida" é pendência da EMPRESA do contexto — a mesma resposta que
 * `resolveEffectiveTollBoothCharge` (spec 086) daria, campo a campo, para `chargePerAxle`. Praça sem
 * tarifa no catálogo mas com ajuste da empresa não conta para ela; a mesma praça conta para outra
 * empresa que nunca a ajustou.
 *
 * Composta em memória, nunca em SQL (plano 154 item 4 — `COALESCE` entre catálogo e ajuste é
 * proibido no repositório): as duas leituras estreitas (catálogo mínimo e ajustes da empresa) entram
 * prontas, e esta função só replica a precedência `adjustment?.chargePerAxle ?? catalog.chargePerAxle`
 * que `resolveEffectiveTollBoothCharge` já define para este campo — sem precisar da praça inteira
 * (nome, operador, `chargeCar`) que aquela função também resolve.
 */

export type TollBoothAxleChargeAdjustmentRow = Readonly<{
  chargePerAxle: null | string
  osmNodeId: number
}>

export type TollBoothAxleChargeCatalogRow = Readonly<{
  chargePerAxle: null | string
  osmNodeId: number
}>

export function countBoothsWithoutKnownAxleCharge(input: {
  readonly adjustments: readonly TollBoothAxleChargeAdjustmentRow[]
  readonly catalog: readonly TollBoothAxleChargeCatalogRow[]
}): number {
  const adjustedChargePerAxleByNodeId = new Map(
    input.adjustments.map((adjustment) => [adjustment.osmNodeId, adjustment.chargePerAxle]),
  )

  return input.catalog.filter((booth) => {
    const effectiveChargePerAxle =
      adjustedChargePerAxleByNodeId.get(booth.osmNodeId) ?? booth.chargePerAxle
    return effectiveChargePerAxle === null
  }).length
}
