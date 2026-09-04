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
  /** Pedágio e avulsos lançados na viagem. `null` quando ninguém lançou nada. */
  readonly tollTotal?: null | string
  readonly vehicle: TripValuationVehicle
}

export type ApplicableFreightRule = {
  readonly freightRuleId: string
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
}

export type PreviewTripValuationInput = {
  readonly companyId: string
  readonly driverIds: readonly string[]
  readonly nfeDocumentIds: readonly string[]
  readonly repository: TripValuationPreviewPort
  readonly vehicleId: string
}

/**
 * A mesma avaliação, **antes de a viagem existir**. É o que responde "vale a pena montar isto?" no
 * momento em que a pergunta é feita: depois de criada, a decisão já foi tomada.
 *
 * ⚠️ Sem roteiro planejado não há distância, e sem distância não há combustível. Nada é inventado —
 * a parcela sobe marcada como falta e a tela imprime a marca, que é o que distingue "custo baixo"
 * de "custo que ainda não dá para saber".
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

  return valuationOf({
    companyId: input.companyId,
    context,
    repository: input.repository,
  })
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

async function resolveRevenueLine(input: {
  readonly companyId: string
  readonly document: TripValuationDocument
  readonly repository: TripValuationPort
}): Promise<TripRevenueLine> {
  const { document } = input
  const line = {
    nfeDocumentId: document.nfeDocumentId,
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

  return { ...line, amount: calculation.totalAmount, gap: null, source: 'estimated' }
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
    resolveRecordedParcel({
      amount: context.tollTotal ?? null,
      gap: VALUATION_GAPS.notRecorded,
      kind: 'toll',
    }),
    resolveRecordedParcel({
      amount: context.deliveryChargesTotal ?? null,
      gap: VALUATION_GAPS.featureAbsent,
      kind: 'delivery_charges',
    }),
  ]
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
    return { amount: ZERO, gap: input.gap, kind: input.kind, source: 'missing' }
  }

  return { amount: input.amount, gap: null, kind: input.kind, source: 'measured' }
}

function resolveFuelParcel(input: {
  readonly context: TripValuationContext
  readonly distanceMeters: null | number
}): TripCostParcel {
  const { context, distanceMeters } = input
  if (distanceMeters === null) {
    return { amount: ZERO, gap: VALUATION_GAPS.noPlannedDistance, kind: 'fuel', source: 'missing' }
  }
  const consumption = context.vehicle.kilometersPerLiter
  const price = context.fuelPricePerLiter
  if (consumption === null || price === null) {
    return { amount: ZERO, gap: VALUATION_GAPS.noFuelBaseline, kind: 'fuel', source: 'missing' }
  }

  const amount = fuelCost({ distanceMeters, kilometersPerLiter: consumption, pricePerLiter: price })
  if (amount === null) {
    return { amount: ZERO, gap: VALUATION_GAPS.noFuelBaseline, kind: 'fuel', source: 'missing' }
  }

  return { amount, gap: null, kind: 'fuel', source: 'estimated' }
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
      gap: VALUATION_GAPS.noPlannedDistance,
      kind: 'other_per_kilometer',
      source: 'missing',
    }
  }
  if (perKilometer === null) {
    return {
      amount: ZERO,
      gap: VALUATION_GAPS.notRecorded,
      kind: 'other_per_kilometer',
      source: 'missing',
    }
  }

  return {
    amount: costOverDistance({ amountPerKilometer: perKilometer, distanceMeters }),
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
