/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 232: reparte o custo que a viagem já calculou entre as notas dela. Não recalcula nada — o
 * total não se move, só se divide, e `document-cost-apportionment.contract.ts` prende a invariante.
 *
 * Toda divisão é exata porque acontece em dois níveis, nunca num só: primeiro o balde se reparte
 * entre os trechos (e as paradas, no tempo), depois o valor de cada trecho se reparte entre as notas
 * a bordo. Dois `distribute` encadeados fecham a soma em cada nível, então ela fecha no fim.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'
import {
  APPORTIONMENT_BASES,
  COST_BASES,
  DWELL_BASES,
  TIME_BASES,
} from './document-cost-apportionment.types.js'
import type {
  ApportionDocumentCostsParams,
  ApportionDocumentCostsResult,
  ApportionmentBasis,
  CostKindApportionment,
  DocumentCostFigures,
  TimeBasis,
} from './document-cost-apportionment.types.js'

const ERROR_CODE_PREFIX = 'DOCUMENT_COST_APPORTIONMENT'
const PERCENT_FACTOR = 100n

/**
 * Spec 232 D1. `Record<TripCostKind, …>` obriga o compilador a cobrar parcela nova — e o contrato
 * cobra o **valor** de cada uma, porque classificar errado compila igual.
 */
export const COST_KIND_APPORTIONMENT: CostKindApportionment = {
  delivery_charges: APPORTIONMENT_BASES.distance,
  driver: APPORTIONMENT_BASES.time,
  fuel: APPORTIONMENT_BASES.distance,
  helper: APPORTIONMENT_BASES.time,
  icms: APPORTIONMENT_BASES.revenue,
  manual: APPORTIONMENT_BASES.tripShare,
  other_per_kilometer: APPORTIONMENT_BASES.distance,
  pis_cofins: APPORTIONMENT_BASES.revenue,
  toll: APPORTIONMENT_BASES.distance,
}

export function apportionDocumentCosts(
  params: ApportionDocumentCostsParams,
): ApportionDocumentCostsResult {
  if (params.documents.length === 0) return { documents: [] }

  const timeBasis = resolveTimeBasis(params)
  const freights = params.documents.map((document) => parseMoney(document.freightAmount))
  const taxBucket = bucketOf(params, APPORTIONMENT_BASES.revenue)
  const taxes = distribute(taxBucket, freights)
  const isTaxDistributable = taxBucket === 0n || sumOf(freights) > 0n

  if (!hasUsableRoute(params)) {
    return buildUnavailableResult({ isTaxDistributable, params, taxes, timeBasis })
  }

  const legCosts = new Array<bigint>(params.documents.length).fill(0n)
  let orphanCost = spreadDistance({ legCosts, params })
  orphanCost += spreadTime({ legCosts, params })

  const shares = distribute(
    bucketOf(params, APPORTIONMENT_BASES.tripShare) + orphanCost,
    // D3: igualmente, não pelo gasto já acumulado — a nota sem parada acumula zero e é justamente
    // quem só tem rateio.
    params.documents.map(() => 1n),
  )

  // Rede de segurança: o que desceu para as notas — trecho, rateio e imposto — tem de ser exatamente o
  // que as parcelas somam. Se não fechar por qualquer razão (hoje, frete total zero com imposto
  // positivo), "indisponível" é a resposta honesta; um número que parece conta e não fecha, não é.
  if (sumOf([...legCosts, ...shares, ...taxes]) !== sumOf(listParcelAmounts(params))) {
    return buildUnavailableResult({ isTaxDistributable, params, taxes, timeBasis })
  }

  return {
    documents: params.documents.map((document, index) => {
      const legCost = legCosts[index] ?? 0n
      const share = shares[index] ?? 0n
      const tax = taxes[index] ?? 0n
      const freight = freights[index] ?? 0n
      const margin = freight - legCost - share - tax

      return {
        costAmount: formatScaledDecimal(legCost + share, MONEY_SCALE),
        costBasis: COST_BASES.leg,
        freightAmount: document.freightAmount,
        legCostAmount: formatScaledDecimal(legCost, MONEY_SCALE),
        marginAmount: formatScaledDecimal(margin, MONEY_SCALE),
        marginPercentage:
          freight === 0n
            ? null
            : formatScaledDecimal(
                divideHalfUp(margin * PERCENT_FACTOR * scaleFactor(), freight),
                MONEY_SCALE,
              ),
        taxAmount: formatScaledDecimal(tax, MONEY_SCALE),
        timeBasis,
        tripDocumentId: document.tripDocumentId,
        tripShareCostAmount: formatScaledDecimal(share, MONEY_SCALE),
      } satisfies DocumentCostFigures
    }),
  }
}

type UnavailableResultParams = {
  readonly isTaxDistributable: boolean
  readonly params: ApportionDocumentCostsParams
  readonly taxes: readonly bigint[]
  readonly timeBasis: TimeBasis
}

/**
 * O imposto por nota é exato com ou sem roteiro, salvo quando há imposto e o frete total é zero: aí
 * não há como dividir e ele sai ausente. Gasto, lucro e margem ficam ausentes — nunca zero.
 */
function buildUnavailableResult(input: UnavailableResultParams): ApportionDocumentCostsResult {
  const { isTaxDistributable, params, taxes, timeBasis } = input

  return {
    documents: params.documents.map((document, index) => ({
      costAmount: null,
      costBasis: COST_BASES.unavailable,
      freightAmount: document.freightAmount,
      legCostAmount: null,
      marginAmount: null,
      marginPercentage: null,
      taxAmount: isTaxDistributable ? formatScaledDecimal(taxes[index] ?? 0n, MONEY_SCALE) : null,
      timeBasis,
      tripDocumentId: document.tripDocumentId,
      tripShareCostAmount: null,
    })),
  }
}

function listParcelAmounts(params: ApportionDocumentCostsParams): bigint[] {
  return params.costParcels.flatMap((parcel) =>
    parcel.amount === null ? [] : [parseMoney(parcel.amount)],
  )
}

function sumOf(values: readonly bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n)
}

/** D5: trecho ausente, ou contagem que não casa com as paradas, é ausência — nunca aproximação. */
function hasUsableRoute(params: ApportionDocumentCostsParams): boolean {
  return params.legs.length > 0 && params.legs.length === params.stops.length
}

/**
 * Reparte o balde da distância entre os trechos e o retorno; cada trecho desce igualmente para as
 * notas a bordo dele. Devolve o que não achou nota — o retorno e o trecho vazio —, que vira rateio.
 */
function spreadDistance(input: {
  readonly legCosts: bigint[]
  readonly params: ApportionDocumentCostsParams
}): bigint {
  const { legCosts, params } = input
  const returnDistance = BigInt(Math.max(0, Math.round(params.returnDistanceMetres ?? 0)))
  const weights = [
    ...params.legs.map((leg) => BigInt(Math.max(0, Math.round(leg.distanceMetres)))),
    returnDistance,
  ]
  const bucket = bucketOf(params, APPORTIONMENT_BASES.distance)
  // Sem distância nenhuma (paradas na mesma coordenada, barracão no mesmo ponto), `distribute` devolve
  // zeros e o balde some. `delivery_charges` e o pedágio lançado à mão não dependem de quilometragem:
  // o dinheiro existe, e desce como rateio da viagem — a mesma saída que o tempo já tem.
  if (weights.every((weight) => weight === 0n)) return bucket

  const perLeg = distribute(bucket, weights)

  return params.legs.reduce(
    (orphan, _leg, legIndex) =>
      orphan + giveToOnBoard({ amount: perLeg[legIndex] ?? 0n, legCosts, legIndex, params }),
    // O último peso é o retorno: ninguém está a bordo dele.
    perLeg[params.legs.length] ?? 0n,
  )
}

/**
 * O tempo tem duas naturezas no mesmo balde: o trecho rodado, que é das notas a bordo, e a espera na
 * parada (D9), que é só de quem desce ali — o caminhão parou **uma vez**, e somar `delivered −
 * arrived` por nota contaria o mesmo minuto várias vezes.
 */
function spreadTime(input: {
  readonly legCosts: bigint[]
  readonly params: ApportionDocumentCostsParams
}): bigint {
  const { legCosts, params } = input
  const weights = [
    ...params.legs.map((leg) => BigInt(Math.max(0, Math.round(leg.durationSeconds)))),
    ...params.stops.map((stop) => BigInt(Math.max(0, Math.round(stop.dwellSeconds)))),
  ]
  const bucket = bucketOf(params, APPORTIONMENT_BASES.time)
  // Viagem sem tempo nenhum: nada a repartir por tempo, e o balde inteiro desce como rateio.
  if (weights.every((weight) => weight === 0n)) return bucket

  const parts = distribute(bucket, weights)
  const legOrphan = params.legs.reduce(
    (orphan, _leg, legIndex) =>
      orphan + giveToOnBoard({ amount: parts[legIndex] ?? 0n, legCosts, legIndex, params }),
    0n,
  )

  return params.stops.reduce((orphan, stop, stopIndex) => {
    const amount = parts[params.legs.length + stopIndex] ?? 0n
    const indexes = params.documents.flatMap((document, documentIndex) =>
      document.stopId === stop.id ? [documentIndex] : [],
    )
    return orphan + giveEqually({ amount, indexes, legCosts })
  }, legOrphan)
}

/** Nota está a bordo do trecho `legIndex` quando desce em `legIndex` ou depois. */
function giveToOnBoard(input: {
  readonly amount: bigint
  readonly legCosts: bigint[]
  readonly legIndex: number
  readonly params: ApportionDocumentCostsParams
}): bigint {
  const { amount, legCosts, legIndex, params } = input
  const stopIndexById = new Map(params.stops.map((stop, index) => [stop.id, index]))
  const indexes = params.documents.flatMap((document, documentIndex) => {
    const stopIndex = document.stopId === null ? undefined : stopIndexById.get(document.stopId)
    return stopIndex !== undefined && stopIndex >= legIndex ? [documentIndex] : []
  })

  return giveEqually({ amount, indexes, legCosts })
}

/** Devolve o que não teve a quem dar. */
function giveEqually(input: {
  readonly amount: bigint
  readonly indexes: readonly number[]
  readonly legCosts: bigint[]
}): bigint {
  const { amount, indexes, legCosts } = input
  if (indexes.length === 0 || amount === 0n) return amount

  const parts = distribute(
    amount,
    indexes.map(() => 1n),
  )
  indexes.forEach((documentIndex, position) => {
    legCosts[documentIndex] = (legCosts[documentIndex] ?? 0n) + (parts[position] ?? 0n)
  })

  return 0n
}

/**
 * Divide `total` pelos pesos sem perder centavo: piso em cada parte e o resto inteiro para o de maior
 * peso. Determinístico no empate — o primeiro índice vence —, porque resto que muda de dono entre
 * execuções faz a mesma viagem mostrar números diferentes.
 */
function distribute(total: bigint, weights: readonly bigint[]): bigint[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n)
  if (totalWeight === 0n || total === 0n) return weights.map(() => 0n)

  const parts = weights.map((weight) => (total * weight) / totalWeight)
  const remainder = total - parts.reduce((sum, part) => sum + part, 0n)
  if (remainder === 0n) return parts

  let heaviest = 0
  weights.forEach((weight, index) => {
    if (weight > (weights[heaviest] ?? 0n)) heaviest = index
  })
  parts[heaviest] = (parts[heaviest] ?? 0n) + remainder

  return parts
}

function bucketOf(params: ApportionDocumentCostsParams, basis: ApportionmentBasis): bigint {
  return params.costParcels.reduce(
    (sum, parcel) =>
      parcel.amount === null || COST_KIND_APPORTIONMENT[parcel.kind] !== basis
        ? sum
        : sum + parseMoney(parcel.amount),
    0n,
  )
}

/**
 * D9: `unknown` vence `proxy`, que vence `measured` — o pior pedaço define o que a tela promete.
 * ⚠️ O `proxy` da **última** parada não conta: depois dela não existe `departed` que sirva de saída, então
 * ela é sempre `proxy` pelo último `delivered`. Se rebaixasse a viagem inteira, o aviso de tempo parcial
 * apareceria em toda viagem e deixaria de informar.
 */
function resolveTimeBasis(params: ApportionDocumentCostsParams): TimeBasis {
  if (params.stops.some((stop) => stop.dwellBasis === DWELL_BASES.unknown)) {
    return TIME_BASES.incomplete
  }
  if (params.stops.slice(0, -1).some((stop) => stop.dwellBasis === DWELL_BASES.proxy)) {
    return TIME_BASES.partial
  }

  return TIME_BASES.complete
}

function parseMoney(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value })
}

function scaleFactor(): bigint {
  return 10n ** MONEY_SCALE
}
