/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A conta **prevista** da viagem aberta — `GET /trips/:id/valuation`, que a API serve desde a 061 e
 * nenhum consumidor lia. O painel dizia "o que existe é a avaliação prevista" e não a mostrava.
 *
 * A conta congelada continua sendo outra coisa, e nasce só quando a viagem fecha.
 */
/**
 * ⚠️ Cópia por valor de `VALUATION_SOURCES` da API. O recorte anterior conhecia só `estimated` e
 * `measured`, e `missing` é justamente o que a conta responde quando **falta** parâmetro — regra de
 * frete, distância, valor do agregado. O validador devolvia `null` para a avaliação inteira, então
 * a viagem sem regra de frete não mostrava conta nenhuma, sem dizer por quê.
 */
export type ValuationSource = 'estimated' | 'measured' | 'missing' | 'period'

/**
 * Spec 110 D7: **de onde o número veio**, em valores crus. Cópia por valor de `TripCostParcelBasis`
 * na API — o bundle não carrega código dela.
 *
 * ⚠️ A API **não compõe a frase**. `184,2 km ÷ 2,8 km/l × R$ 6,29` é apresentação: quem imprime é
 * quem formata por locale, traduz e quebra em duas linhas.
 */
export type TripValuationCostParcelBasis =
  | Readonly<{
      kilometersPerLiter: string
      litres: string
      of: 'fuel'
      pricePerLiter: string
    }>
  | Readonly<{
      of: 'driver'
      paymentModel: string
      regionCity: null | string
      regionCode: null | string
      vehicleClass: string
    }>
  /** Spec 125: o ICMS projetado pelo perfil de emissão — CST e frações (não percentuais). */
  | Readonly<{
      baseReductionRate: string
      cst: string
      of: 'icms'
      rate: string
    }>

export type TripValuationCostParcel = Readonly<{
  amount: string
  /** Os insumos da parcela derivada. `null` onde o número não vem de conta nossa. */
  basis: null | TripValuationCostParcelBasis
  /** O que a lacuna nomeia — hoje a cidade a cadastrar (spec 086). `null` quando não há o que dizer. */
  detail: null | string
  gap: null | string
  kind: string
  source: ValuationSource
}>

export type TripValuationRevenueLine = Readonly<{
  amount: string
  /**
   * A parametrização que produziu o número, e a que percentual. ⚠️ Só a linha `estimated` os tem —
   * `measured` é a soma dos encargos do CT-e autorizado, e ali a origem é o documento emitido.
   */
  freightRuleId: null | string
  freightRuleName: null | string
  percentage: null | string
  gap: null | string
  nfeDocumentId: null | string
  source: ValuationSource
  tripDocumentId: string
}>

export type TripValuation = Readonly<{
  costParcels: readonly TripValuationCostParcel[]
  hasGaps: boolean
  marginPercentage: null | string
  revenueLines: readonly TripValuationRevenueLine[]
  revenueSource: ValuationSource
  totalCost: string
  totalMargin: string
  totalRevenue: string
}>

export type TripValuationSummary = Readonly<{
  cost: string
  /** As razões por extenso: número com lacuna sem dizer qual é número que engana. */
  gaps: readonly string[]
  hasGaps: boolean
  margin: string
  marginPercentage: null | string
  revenue: string
  revenueSource: ValuationSource
}>

/**
 * ⚠️ A lacuna viaja **junto do número**, nunca no lugar dele. Sem regra de frete, sem consumo do
 * veículo ou sem roteiro calculado, o total sai menor do que a viagem custa — e esconder o total
 * seria pior que mostrá-lo com a ressalva ao lado.
 */
export function summarizeTripValuation(
  valuation: null | TripValuation,
): null | TripValuationSummary {
  if (valuation === null) return null

  const gaps = [
    ...valuation.costParcels.flatMap((parcel) => (parcel.gap === null ? [] : [parcel.gap])),
    ...valuation.revenueLines.flatMap((line) => (line.gap === null ? [] : [line.gap])),
  ]

  return {
    cost: valuation.totalCost,
    gaps: [...new Set(gaps)],
    hasGaps: valuation.hasGaps,
    margin: valuation.totalMargin,
    marginPercentage: valuation.marginPercentage,
    revenue: valuation.totalRevenue,
    revenueSource: valuation.revenueSource,
  }
}
