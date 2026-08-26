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
import { TripNotFoundError } from '../domain/trip.error.js'

const ZERO = '0.0000'

/** Uma nota da viagem com o que decide a receita dela — medida se já houve emissão, prevista se não. */
export type TripValuationDocument = {
  readonly destinationCityCode: null | string
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
  /** Metros do roteiro aceito; `null` quando ninguém calculou rota ainda. */
  readonly distanceMeters: null | number
  readonly documents: readonly TripValuationDocument[]
  readonly fuelPricePerLiter: null | string
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

  const revenueLines = await Promise.all(
    context.documents.map((document) =>
      resolveRevenueLine({ companyId: input.companyId, document, repository: input.repository }),
    ),
  )

  return buildTripValuation({ costParcels: buildCostParcels(context), revenueLines })
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
    { amount: ZERO, gap: VALUATION_GAPS.noDriverRate, kind: 'driver', source: 'missing' },
    resolveFuelParcel({ context, distanceMeters: hasDistance ? distance : null }),
    resolveOtherPerKilometer({ context, distanceMeters: hasDistance ? distance : null }),
    { amount: ZERO, gap: VALUATION_GAPS.notRecorded, kind: 'toll', source: 'missing' },
    {
      amount: ZERO,
      gap: VALUATION_GAPS.featureAbsent,
      kind: 'delivery_charges',
      source: 'missing',
    },
  ]
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
