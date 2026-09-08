/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  calculatePercentageFreight,
  createFreightRuleSnapshot,
} from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import {
  buildTripValuation,
  costOverDistance,
  fuelCost,
  VALUATION_GAPS,
  type TripCostParcel,
  type TripRevenueLine,
  type TripValuation,
} from '../domain/trip-valuation.policy.js'
import { buildTripDriverCost, type TripCrewMember } from '../domain/trip-driver-cost.policy.js'
import { buildTripTaxParcels, type CompanyFederalRates } from '../domain/trip-tax.policy.js'
import { TripNotFoundError } from '../domain/trip.error.js'
import {
  readRouteGeometry,
  type ReadRouteGeometryDepotPort,
  type ReadRouteGeometryTollBoothsPort,
  type RouteGeometryToll,
} from './read-route-geometry.use-case.js'
import type { AxleCount } from '../../toll-booths/domain/toll-route-cost.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { RouteGeometryPort } from './route-geometry.port.js'

const ZERO = '0.0000'

/** Uma nota da viagem com o que decide a receita dela — medida se já houve emissão, prevista se não. */
export type TripValuationDocument = {
  readonly destinationCityCode: null | string
  /**
   * ADR-0049 §4: o ICMS **do documento**, como ele foi transmitido. `null` enquanto não há emissão;
   * `'0.0000'` quando o CST é isento — e a diferença entre os dois é o que a origem preserva.
   */
  readonly icmsAmount?: null | string
  readonly destinationState: null | string
  readonly issuedAt: null | string
  /** Soma dos `cte_batch_item_charges` do CT-e **autorizado** — `null` quando não há emissão. */
  readonly measuredAmount: null | string
  readonly nfeDocumentId: null | string
  readonly nfeTotalAmount: null | string
  readonly senderTaxId: null | string
  readonly tripDocumentId: string
}

export type TripValuationVehicle = {
  /**
   * Spec 090 T9: quantos eixos o veículo tem, e de onde o número veio (T6). `undefined` na viagem
   * já criada — ela ainda não calcula pedágio (ver nota no fim do arquivo); `null` na prévia
   * quando a ficha não tem eixo declarado nem tipo reconhecido para estimar.
   */
  readonly axles?: AxleCount | null
  /**
   * Spec 095 D4: com tag, a parcela usa a tarifa automática da praça quando ela é conhecida — a
   * mesma regra que a montagem já aplica. Sem isto, mapa e margem mostram pedágios diferentes para
   * a mesma viagem.
   */
  readonly hasAutomaticTollPayment?: boolean
  readonly kilometersPerLiter: null | string
  readonly otherCostsPerKilometer: null | string
}

export type TripValuationContext = {
  /** Quem dirige e como é pago — o agregado por rota, o da casa por quinzena (ADR-0049 §3). */
  readonly crew?: readonly TripCrewMember[]
  /** Taxas de entrega já conferidas (060). `null` enquanto a empresa não usa o módulo. */
  readonly deliveryChargesTotal?: null | string
  /** Metros do roteiro aceito; `null` quando ninguém calculou rota ainda. */
  readonly distanceMeters: null | number
  readonly documents: readonly TripValuationDocument[]
  /** `null` quando a empresa não declarou regime federal: PIS/COFINS fica `missing`. */
  readonly federalRates?: CompanyFederalRates | null
  readonly fuelPricePerLiter: null | string
  /**
   * Spec 090 T9: o pedágio calculado pela mesma rota que resolveu `distanceMeters` — `undefined`
   * fora da prévia. É a **projeção**; `tollTotal` abaixo é o **lançamento real**, e ele vence
   * sempre que existir (ver `resolveTollParcel`).
   */
  readonly toll?: null | RouteGeometryToll
  /** Pedágio e avulsos lançados na viagem. `null` quando ninguém lançou nada. */
  readonly tollTotal?: null | string
  readonly vehicle: TripValuationVehicle
}

export type ApplicableFreightRule = {
  readonly freightRuleId: string
  /**
   * O nome da regra que precificou. A consulta já juntava `freight_rules` para filtrar por tipo e
   * status, e o mapper descartava a linha inteira — quem via o número na tela não tinha como saber
   * qual parametrização o produziu, e com duas regras empatadas em prioridade isso é justamente o
   * que precisa aparecer.
   */
  readonly freightRuleName: string
  readonly freightRuleVersionId: string
  readonly maximumAmount: string
  readonly minimumAmount: string
  readonly percentage: string
  readonly validFrom: string
  readonly validUntil: string
  readonly version: string
}

export type TripValuationPort = {
  /** `null` quando a viagem não existe nesta empresa. */
  readContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripValuationContext | null>
  /** O mesmo seletor de regra da simulação — a previsão usa o parâmetro que geraria o documento. */
  findApplicableRule(input: {
    readonly companyId: string
    readonly destinationCityCode?: null | string
    readonly destinationState?: null | string
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: null | string
  }): Promise<ApplicableFreightRule | null>
}

export type ReadTripValuationInput = {
  readonly companyId: string
  readonly repository: TripValuationPort
  readonly tripId: string
}

/**
 * Spec 065 D7: **na montagem não existe receita realizada.** O caminhão sai antes de qualquer
 * emissão, então a viagem é avaliada pelos mesmos parâmetros que gerariam o CT-e — sem gerar CT-e
 * nenhum, sem gravar cálculo nenhum e sem tocar em lote.
 *
 * Isto emenda a D1 da 061 ("receita é o CT-e autorizado, e nada mais") em vez de contradizê-la: a
 * linha que já tem documento autorizado sobe como `measured`, e é ela que o relatório de resultado
 * usa. Previsão decide hoje; realizado mede ontem — e o `source` de cada linha é o que impede
 * alguém de somar os dois sem perceber.
 */
export async function readTripValuation(input: ReadTripValuationInput): Promise<TripValuation> {
  const context = await input.repository.readContext(input)
  if (context === null) throw new TripNotFoundError()

  return valuationOf({
    companyId: input.companyId,
    context,
    repository: input.repository,
  })
}

/**
 * A prévia lê o mesmo contexto por outro caminho: as notas escolhidas e o veículo do formulário, em
 * vez da viagem. O resto do cálculo é o mesmo — é por isso que a porta **estende** a de leitura em
 * vez de duplicá-la.
 */
export type TripValuationPreviewPort = TripValuationPort & {
  /** `null` quando o veículo não existe nesta empresa. */
  readPreviewContext(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  }): Promise<TripValuationContext | null>
  /**
   * Spec 090 D3: as coordenadas ordenadas da prévia, agrupadas pela mesma chave de parada que
   * `buildCargoPreviewStops` usa — a mesma que o mapa numerou. `stopOrder` vazio é ordem de
   * chegada da nota, igual à prévia de carga.
   */
  readPreviewStopCoordinates(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly stopOrder: readonly string[]
  }): Promise<readonly RouteGeometryPoint[]>
}

export type PreviewTripValuationInput = {
  readonly companyId: string
  /**
   * O barracão da empresa (spec 097). A prévia usa a **mesma** rota da montagem, então a perna do
   * barracão entra na distância dela também — duas contas diferentes sobre a mesma viagem é o
   * defeito que a 097 existe para acabar. ⚠️ A **carga** não muda: o barracão não ocupa baú (D3).
   */
  readonly depot?: null | ReadRouteGeometryDepotPort
  readonly driverIds: readonly string[]
  /** A mesma porta da geometria avulsa do mapa (`/route-geometry`) — spec 090 D3. */
  readonly geometry: RouteGeometryPort
  readonly nfeDocumentIds: readonly string[]
  readonly repository: TripValuationPreviewPort
  /** A ordem que o operador montou no mapa. Vazia é ordem de chegada — a prévia não inventa roteiro. */
  readonly stopOrder: readonly string[]
  /** O catálogo de praças — spec 090 T9, a mesma porta que `/route-geometry` já usa (T7). */
  readonly tollBooths: ReadRouteGeometryTollBoothsPort
  readonly vehicleId: string
}

/**
 * A mesma avaliação, **antes de a viagem existir**. É o que responde "vale a pena montar isto?" no
 * momento em que a pergunta é feita: depois de criada, a decisão já foi tomada.
 *
 * ⚠️ Sem roteiro planejado não há distância, e sem distância não há combustível. Nada é inventado —
 * a parcela sobe marcada como falta e a tela imprime a marca, que é o que distingue "custo baixo"
 * de "custo que ainda não dá para saber".
 *
 * Spec 090 D3: até aqui a distância vinha sempre `null` — a viagem não existe, então não havia
 * `trip_stops` para somar. Agora ela sai da mesma rota que o mapa da montagem já pediu ao
 * roteirizador, resolvida de novo aqui pelas mesmas paradas (`stopOrder` + agrupamento por
 * endereço), nunca lida de uma resposta que o cliente poderia adulterar.
 */
export async function previewTripValuation(
  input: PreviewTripValuationInput,
): Promise<TripValuation> {
  const context = await input.repository.readPreviewContext({
    companyId: input.companyId,
    driverIds: input.driverIds,
    nfeDocumentIds: input.nfeDocumentIds,
    vehicleId: input.vehicleId,
  })
  if (context === null) throw new TripNotFoundError()

  /**
   * ⚠️ D4/T9: o pedágio precisa do eixo do veículo, que só se conhece **depois** de ler o
   * contexto — por isso esta chamada não corre em paralelo com a de cima como a do combustível
   * corria antes desta task. `readRouteGeometry` continua sendo a **única** chamada ao
   * roteirizador: distância e pedágio saem da mesma resposta, nunca de duas rotas que poderiam
   * discordar (D4).
   */
  const road = await resolvePreviewRoad({
    axles: context.vehicle.axles ?? null,
    hasAutomaticTollPayment: context.vehicle.hasAutomaticTollPayment ?? false,
    companyId: input.companyId,
    depot: input.depot ?? null,
    geometry: input.geometry,
    nfeDocumentIds: input.nfeDocumentIds,
    repository: input.repository,
    stopOrder: input.stopOrder,
    tollBooths: input.tollBooths,
  })

  return valuationOf({
    companyId: input.companyId,
    context: { ...context, distanceMeters: road.distanceMeters, toll: road.toll },
    repository: input.repository,
  })
}

/**
 * ⚠️ Sem geometria (rota indisponível, ou menos de duas paradas) a distância é `null`, e o gap de
 * `noPlannedDistance` continua valendo — nada muda no que já existia antes desta task. O pedágio
 * segue a mesma regra de `readRouteGeometry`: `null` é "não calculei", nunca zero inventado.
 */
async function resolvePreviewRoad(input: {
  readonly axles: AxleCount | null
  readonly companyId: string
  readonly hasAutomaticTollPayment: boolean
  readonly depot: null | ReadRouteGeometryDepotPort
  readonly geometry: RouteGeometryPort
  readonly nfeDocumentIds: readonly string[]
  readonly repository: Pick<TripValuationPreviewPort, 'readPreviewStopCoordinates'>
  readonly stopOrder: readonly string[]
  readonly tollBooths: ReadRouteGeometryTollBoothsPort
}): Promise<{ readonly distanceMeters: null | number; readonly toll: null | RouteGeometryToll }> {
  const points = await input.repository.readPreviewStopCoordinates({
    companyId: input.companyId,
    nfeDocumentIds: input.nfeDocumentIds,
    stopOrder: input.stopOrder,
  })

  const road = await readRouteGeometry({
    axles: input.axles,
    depot: input.depot,
    hasAutomaticTollPayment: input.hasAutomaticTollPayment,
    geometry: input.geometry,
    stops: points,
    tollBooths: input.tollBooths,
  })
  if (road.legs.length === 0) return { distanceMeters: null, toll: road.toll }

  return {
    distanceMeters: road.legs.reduce((total, leg) => total + leg.distanceMetres, 0),
    toll: road.toll,
  }
}

async function valuationOf(input: {
  readonly companyId: string
  readonly context: TripValuationContext
  readonly repository: TripValuationPort
}): Promise<TripValuation> {
  const { context } = input

  const revenueLines = await Promise.all(
    context.documents.map((document) =>
      resolveRevenueLine({ companyId: input.companyId, document, repository: input.repository }),
    ),
  )

  const valuation = buildTripValuation({ costParcels: buildCostParcels(context), revenueLines })

  /**
   * O imposto entra **depois** da receita apurada, porque os federais incidem sobre ela. Ele não é
   * custo de operação — desce da receita —, e a tela separa as duas naturezas.
   */
  const taxParcels = buildTripTaxParcels({
    documents: context.documents.map((document) => ({ icmsAmount: document.icmsAmount ?? null })),
    federalRates: context.federalRates ?? null,
    revenueAmount: valuation.totalRevenue,
  })

  return buildTripValuation({
    costParcels: [...buildCostParcels(context), ...taxParcels],
    revenueLines,
  })
}

/**
 * ⚠️ **Exportada para a listagem de viagens, e é de propósito que seja a mesma função.** A coluna de
 * ganho de `/trips` responde à mesma pergunta que o painel de valoração — "quanto esta nota rende?"
 * — e reimplementá-la lá produziria dois números para a mesma carga, divergindo no dia em que a
 * regra de frete mudasse de forma. Quem chama em lote é `readTripRevenueTotals`.
 */
export async function resolveRevenueLine(input: {
  readonly companyId: string
  readonly document: TripValuationDocument
  /** Só a busca de regra: a linha não lê contexto, e pedir a porta inteira travaria o chamador em lote. */
  readonly repository: Pick<TripValuationPort, 'findApplicableRule'>
}): Promise<TripRevenueLine> {
  const { document } = input
  const line = {
    freightRuleId: null,
    freightRuleName: null,
    nfeDocumentId: document.nfeDocumentId,
    percentage: null,
    tripDocumentId: document.tripDocumentId,
  }

  if (document.measuredAmount !== null) {
    return { ...line, amount: document.measuredAmount, gap: null, source: 'measured' }
  }
  if (document.nfeTotalAmount === null || document.issuedAt === null) {
    return { ...line, amount: ZERO, gap: VALUATION_GAPS.noFreightRule, source: 'missing' }
  }

  const rule = await input.repository.findApplicableRule({
    companyId: input.companyId,
    destinationCityCode: document.destinationCityCode,
    destinationState: document.destinationState,
    issuedAt: document.issuedAt,
    ruleType: 'percentage_of_invoice_total',
    senderTaxId: document.senderTaxId,
  })
  if (rule === null) {
    return { ...line, amount: ZERO, gap: VALUATION_GAPS.noFreightRule, source: 'missing' }
  }

  const calculation = calculatePercentageFreight({
    invoice: {
      id: document.nfeDocumentId ?? document.tripDocumentId,
      issuedAt: document.issuedAt,
      totalAmount: document.nfeTotalAmount,
    },
    ruleSnapshot: createFreightRuleSnapshot({
      freightRuleId: rule.freightRuleId,
      freightRuleVersionId: rule.freightRuleVersionId,
      maximumAmount: emptyToNull(rule.maximumAmount),
      minimumAmount: emptyToNull(rule.minimumAmount),
      percentage: rule.percentage,
      ruleVersion: rule.version,
      type: 'percentage_of_invoice_total',
      validFrom: rule.validFrom,
      validUntil: emptyToNull(rule.validUntil),
    }),
  })

  return {
    ...line,
    amount: calculation.totalAmount,
    freightRuleId: rule.freightRuleId,
    freightRuleName: rule.freightRuleName === '' ? null : rule.freightRuleName,
    gap: null,
    percentage: rule.percentage,
    source: 'estimated',
  }
}

/**
 * O custo é composto, e cada parcela diz de onde veio (061 D2). Duas delas ainda não têm fonte
 * nenhuma no produto — pedágio e taxa de entrega —, e elas aparecem **ausentes por nome** em vez de
 * somarem zero: o total com buraco declarado é honesto, o total com buraco escondido não é.
 */
function buildCostParcels(context: TripValuationContext): readonly TripCostParcel[] {
  const distance = context.distanceMeters
  const hasDistance = distance !== null && distance > 0

  return [
    buildTripDriverCost(context.crew ?? []),
    resolveFuelParcel({ context, distanceMeters: hasDistance ? distance : null }),
    resolveOtherPerKilometer({ context, distanceMeters: hasDistance ? distance : null }),
    resolveTollParcel(context),
    resolveRecordedParcel({
      amount: context.deliveryChargesTotal ?? null,
      gap: VALUATION_GAPS.featureAbsent,
      kind: 'delivery_charges',
    }),
  ]
}

/**
 * Spec 090 T9: **lançamento manual sempre vence o calculado.** `tollTotal` é um pagamento real já
 * registrado; `context.toll` é uma projeção sobre o catálogo do OSM — a mesma inversão que a
 * receita proíbe entre `measured` e `estimated` (ADR-0049 §2 / spec 065 D7) valeria aqui: deixar a
 * projeção sobrescrever um valor pago de verdade esconderia dinheiro que já saiu do caixa.
 *
 * O calculado entra como `estimated` mesmo quando o eixo é `declared` — ele continua sendo uma
 * projeção sobre a rota, não um pagamento conferido; a marca de eixo estimado é responsabilidade
 * da tela da montagem (T7), não desta parcela. Fora da prévia (`context.toll === undefined`) o
 * comportamento é idêntico ao de antes desta task.
 */
function resolveTollParcel(context: TripValuationContext): TripCostParcel {
  const recorded = resolveRecordedParcel({
    amount: context.tollTotal ?? null,
    gap: VALUATION_GAPS.notRecorded,
    kind: 'toll',
  })
  if (recorded.gap === null) return recorded

  const calculated = context.toll ?? null
  if (calculated === null) return recorded

  /**
   * ⚠️ Praça sem tarifa no trajeto torna o total **incompleto**, e ele precisa dizer isso: quem lê
   * a margem decide aceitar ou recusar carga, e um número que soma três cancelas de cinco parece
   * uma estimativa fechada. `detail` nomeia quantas ficaram de fora, no molde de `CITY_WITHOUT_REGION`.
   */
  const partial = calculated.boothsWithoutCharge > 0

  return {
    amount: calculated.total,
    detail: partial ? String(calculated.boothsWithoutCharge) : null,
    gap: partial ? VALUATION_GAPS.tollPartial : null,
    kind: 'toll',
    source: 'estimated',
  }
}

/**
 * Parcela que só existe se alguém lançou. Ausência aqui é **ausência de lançamento**, e ela precisa
 * aparecer: zero silencioso num custo que existe é a margem otimista que a ADR-0049 §2 proíbe.
 */
function resolveRecordedParcel(input: {
  readonly amount: null | string
  readonly gap: (typeof VALUATION_GAPS)[keyof typeof VALUATION_GAPS]
  readonly kind: TripCostParcel['kind']
}): TripCostParcel {
  if (input.amount === null) {
    return { amount: ZERO, detail: null, gap: input.gap, kind: input.kind, source: 'missing' }
  }

  return { amount: input.amount, detail: null, gap: null, kind: input.kind, source: 'measured' }
}

function resolveFuelParcel(input: {
  readonly context: TripValuationContext
  readonly distanceMeters: null | number
}): TripCostParcel {
  const { context, distanceMeters } = input
  if (distanceMeters === null) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.noPlannedDistance,
      kind: 'fuel',
      source: 'missing',
    }
  }
  const consumption = context.vehicle.kilometersPerLiter
  const price = context.fuelPricePerLiter
  if (consumption === null || price === null) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.noFuelBaseline,
      kind: 'fuel',
      source: 'missing',
    }
  }

  const amount = fuelCost({ distanceMeters, kilometersPerLiter: consumption, pricePerLiter: price })
  if (amount === null) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.noFuelBaseline,
      kind: 'fuel',
      source: 'missing',
    }
  }

  return { amount, detail: null, gap: null, kind: 'fuel', source: 'estimated' }
}

function resolveOtherPerKilometer(input: {
  readonly context: TripValuationContext
  readonly distanceMeters: null | number
}): TripCostParcel {
  const { context, distanceMeters } = input
  const perKilometer = context.vehicle.otherCostsPerKilometer
  if (distanceMeters === null) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.noPlannedDistance,
      kind: 'other_per_kilometer',
      source: 'missing',
    }
  }
  if (perKilometer === null) {
    return {
      amount: ZERO,
      detail: null,
      gap: VALUATION_GAPS.notRecorded,
      kind: 'other_per_kilometer',
      source: 'missing',
    }
  }

  return {
    amount: costOverDistance({ amountPerKilometer: perKilometer, distanceMeters }),
    detail: null,
    gap: null,
    kind: 'other_per_kilometer',
    source: 'estimated',
  }
}

/**
 * O seletor de regra devolve string vazia para o limite ausente — `null` é o que o motor entende, e
 * a conversão vive aqui pelo mesmo motivo que vive na simulação: um `''` que atravessa vira
 * `INVALID_DECIMAL_FORMAT` a três chamadas de distância.
 */
function emptyToNull(value: string): null | string {
  return value.length === 0 ? null : value
}
