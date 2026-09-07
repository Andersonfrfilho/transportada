/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O valor efetivo de pedágio, por praça: ajuste manual da empresa, quando existe, e senão o
 * catálogo do OSM. No molde de `fuel-price.policy.ts` — a diferença é que aqui a decisão é por
 * **campo**, não por linha inteira: corrigir só o valor por eixo e deixar o carro de passeio no
 * catálogo é o caso comum (spec 095 D1).
 */

export type TollBoothCatalogEntry = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  name: null | string
  observedOn: string
  operator: null | string
  osmNodeId: number
}>

export type TollBoothChargeAdjustmentRow = Readonly<{
  actorUserId: string
  chargeCar: null | string
  chargePerAxle: null | string
  observedOn: string
  osmNodeId: number
  updatedAt: Date
}>

export type TollBoothChargeSource = 'catalog' | 'manual'

export type EffectiveTollBoothCharge = Readonly<{
  actorUserId: null | string
  catalog: Readonly<{
    chargeCar: null | string
    chargePerAxle: null | string
    observedOn: string
  }>
  /**
   * ⚠️ **A origem é por campo, não por linha.** Um ajuste que corrige só a tarifa de carro deixa o
   * valor por eixo vindo do mapa — e é o por eixo que decide o custo do caminhão. Uma origem só
   * para os dois mentiria sobre um deles, na página que existe justamente para dizer de onde cada
   * número veio.
   */
  chargeCarSource: TollBoothChargeSource
  chargePerAxleSource: TollBoothChargeSource
  effectiveChargeCar: null | string
  effectiveChargePerAxle: null | string
  name: null | string
  observedOn: string
  operator: null | string
  osmNodeId: number
  source: TollBoothChargeSource
  updatedAt: Date | null
}>

/**
 * ⚠️ Cada campo vence o catálogo por conta própria. `0.00` no ajuste é isenção afirmada por gente,
 * com autor e data — vence o `null` "desconhecida" do catálogo sem confundir os dois.
 */
export function resolveEffectiveTollBoothCharge(input: {
  readonly adjustment: TollBoothChargeAdjustmentRow | null
  readonly catalog: TollBoothCatalogEntry
}): EffectiveTollBoothCharge {
  const { adjustment, catalog } = input

  return {
    actorUserId: adjustment?.actorUserId ?? null,
    catalog: {
      chargeCar: catalog.chargeCar,
      chargePerAxle: catalog.chargePerAxle,
      observedOn: catalog.observedOn,
    },
    chargeCarSource: sourceOf(adjustment?.chargeCar ?? null),
    chargePerAxleSource: sourceOf(adjustment?.chargePerAxle ?? null),
    effectiveChargeCar: adjustment?.chargeCar ?? catalog.chargeCar,
    effectiveChargePerAxle: adjustment?.chargePerAxle ?? catalog.chargePerAxle,
    name: catalog.name,
    observedOn: adjustment?.observedOn ?? catalog.observedOn,
    operator: catalog.operator,
    osmNodeId: catalog.osmNodeId,
    source: adjustment === null ? 'catalog' : 'manual',
    updatedAt: adjustment?.updatedAt ?? null,
  }
}

/** Campo ajustado é `manual`; campo em branco no ajuste continua sendo o do mapa. */
function sourceOf(adjusted: null | string): TollBoothChargeSource {
  return adjusted === null ? 'catalog' : 'manual'
}
