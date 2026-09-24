/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 D10: todo dinheiro é `trip.financials`, cortado na API. Sem a permissão, o campo **sai**
 * do objeto — nunca `null` nem zero no lugar do valor. Cada função devolve um tipo diferente do de
 * entrada quando falta a permissão, para o TypeScript recusar quem tentar ler o campo sem checar.
 */
import type {
  RouteGeometryOption,
  RouteGeometryToll,
  RouteGeometryView,
  TollBoothRouteLine,
} from '../trips/application/read-route-geometry.use-case.js'

export type RedactedTollBoothLine = Omit<
  TollBoothRouteLine,
  'chargeCar' | 'chargePerAxle' | 'chargePerAxleAutomatic' | 'effectiveChargePerAxle' | 'total'
>

export type RedactedRouteGeometryToll = Omit<
  RouteGeometryToll,
  'booths' | 'chargePerAxle' | 'total'
> &
  Readonly<{ booths: readonly RedactedTollBoothLine[] }>

export type RedactedRouteGeometryOption = Omit<
  RouteGeometryOption,
  'fuelTotal' | 'toll' | 'totalCost'
> &
  Readonly<{ toll: null | RedactedRouteGeometryToll }>

export type RedactedRouteGeometryView<TView extends RouteGeometryView> = Omit<
  TView,
  'options' | 'toll'
> &
  Readonly<{
    options: readonly RedactedRouteGeometryOption[]
    toll: null | RedactedRouteGeometryToll
  }>

function omitFields<TRecord extends object, TField extends keyof TRecord>(
  record: TRecord,
  fields: readonly TField[],
): Omit<TRecord, TField> {
  const excluded = new Set<string>(fields as readonly string[])
  return Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.has(key))) as Omit<
    TRecord,
    TField
  >
}

const TOLL_BOOTH_MONEY_FIELDS = [
  'chargeCar',
  'chargePerAxle',
  'chargePerAxleAutomatic',
  'effectiveChargePerAxle',
  'total',
] as const

function redactTollBoothLine(booth: TollBoothRouteLine): RedactedTollBoothLine {
  return omitFields(booth, TOLL_BOOTH_MONEY_FIELDS)
}

function redactRouteGeometryToll(toll: RouteGeometryToll): RedactedRouteGeometryToll {
  const withoutTotals = omitFields(toll, ['chargePerAxle', 'total'] as const)
  return { ...withoutTotals, booths: toll.booths.map(redactTollBoothLine) }
}

function redactRouteGeometryOption(option: RouteGeometryOption): RedactedRouteGeometryOption {
  const withoutMoney = omitFields(option, ['fuelTotal', 'totalCost'] as const)
  return {
    ...withoutMoney,
    toll: option.toll === null ? null : redactRouteGeometryToll(option.toll),
  }
}

/**
 * D9: distância, duração e volta não são dinheiro e atravessam intactas — só `toll` (o do topo e o
 * de cada opção) e os totais de combustível/custo saem. As praças continuam no mapa, sem preço.
 */
export function redactRouteGeometryMoney<TView extends RouteGeometryView>(input: {
  readonly canReadFinancials: boolean
  readonly view: TView
}): RedactedRouteGeometryView<TView> | TView {
  if (input.canReadFinancials) return input.view
  const { options, toll, ...rest } = input.view
  return {
    ...rest,
    options: options.map(redactRouteGeometryOption),
    toll: toll === null ? null : redactRouteGeometryToll(toll),
  } as RedactedRouteGeometryView<TView>
}

/** NF-e: `freightRuleName` fica — é regra aplicada, não valor. */
export function redactNfeDocumentMoney<
  TDocument extends Readonly<{ freightAmount: unknown; totalAmount: unknown }>,
>(input: {
  readonly canReadFinancials: boolean
  readonly document: TDocument
}): Omit<TDocument, 'freightAmount' | 'totalAmount'> | TDocument {
  if (input.canReadFinancials) return input.document
  return omitFields(input.document, ['freightAmount', 'totalAmount'] as const)
}

/** Spec 176: `freightRuleName` fica — é regra aplicada, não valor; só `freightAmount` é dinheiro. */
export function redactTripDocumentMoney<
  TDocument extends Readonly<{ freightAmount: unknown; nfeTotalValue: unknown }>,
>(input: {
  readonly canReadFinancials: boolean
  readonly document: TDocument
}): Omit<TDocument, 'freightAmount' | 'nfeTotalValue'> | TDocument {
  if (input.canReadFinancials) return input.document
  return omitFields(input.document, ['freightAmount', 'nfeTotalValue'] as const)
}

/** Spec 156 L6: `amounts` da listagem de viagens é receita e soma das notas — dinheiro inteiro. */
export function redactTripAmounts<TTrip extends Readonly<{ amounts: unknown }>>(input: {
  readonly canReadFinancials: boolean
  readonly trip: TTrip
}): Omit<TTrip, 'amounts'> | TTrip {
  if (input.canReadFinancials) return input.trip
  return omitFields(input.trip, ['amounts'] as const)
}
