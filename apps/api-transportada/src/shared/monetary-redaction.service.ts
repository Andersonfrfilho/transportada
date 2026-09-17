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

/**
 * L4 (revisão final da 153): a lista de exclusão deixava campo monetário novo vazar por padrão —
 * foi o que produziu C1 e H3, os dois em tipos que não passam por aqui. Para `TollBoothRouteLine`,
 * `RouteGeometryToll` e `RouteGeometryOption` — os três tipos concretos que este arquivo já importa,
 * e onde uma lista de exclusão desatualizada vazaria dinheiro em silêncio — a lista vira uma
 * classificação **exaustiva**: `Record<keyof T, 'money' | 'safe'>` obriga toda chave existente a
 * estar aqui, e o TypeScript já reprova a compilação se `T` ganhar um campo novo sem entrada — antes
 * de qualquer teste rodar, no mesmo `bun run typecheck` que já é gate.
 *
 * ⚠️ `redactNfeDocumentMoney`/`redactTripDocumentMoney`/`redactTripAmountsMoney` abaixo continuam
 * como lista de exclusão: são genéricas sobre um `TDocument` cujo formato completo este arquivo não
 * conhece (o chamador só garante um bound mínimo), então não há `keyof` exaustivo possível sem
 * acoplar este módulo compartilhado ao tipo concreto de cada consumidor.
 */
type FieldPolicy<TRecord> = Readonly<Record<keyof TRecord, 'money' | 'safe'>>

/** As chaves de `TPolicy` classificadas `'money'` — computado do tipo **literal** da política. */
type MoneyKeysOf<TPolicy> = {
  readonly [TKey in keyof TPolicy]: TPolicy[TKey] extends 'money' ? TKey : never
}[keyof TPolicy]

function moneyFieldsOf<TPolicy extends Record<string, 'money' | 'safe'>>(
  policy: TPolicy,
): readonly MoneyKeysOf<TPolicy>[] {
  return (Object.keys(policy) as (keyof TPolicy)[]).filter(
    (key) => policy[key] === 'money',
  ) as MoneyKeysOf<TPolicy>[]
}

const TOLL_BOOTH_LINE_FIELD_POLICY = {
  chargeCar: 'money',
  chargePerAxle: 'money',
  chargePerAxleAutomatic: 'money',
  effectiveChargePerAxle: 'money',
  fellBackToManual: 'safe',
  latitude: 'safe',
  legIndex: 'safe',
  longitude: 'safe',
  name: 'safe',
  operator: 'safe',
  osmNodeId: 'safe',
  total: 'money',
} as const satisfies FieldPolicy<TollBoothRouteLine>
const TOLL_BOOTH_MONEY_FIELDS = moneyFieldsOf(TOLL_BOOTH_LINE_FIELD_POLICY)

function redactTollBoothLine(booth: TollBoothRouteLine): RedactedTollBoothLine {
  return omitFields(booth, TOLL_BOOTH_MONEY_FIELDS)
}

/** `booths` fica `safe` aqui: o campo em si não some, o que ele guarda é que se redige à parte. */
const ROUTE_GEOMETRY_TOLL_FIELD_POLICY = {
  axles: 'safe',
  booths: 'safe',
  boothsFallenBackToManual: 'safe',
  boothsWithoutCharge: 'safe',
  catalog: 'safe',
  chargePerAxle: 'money',
  multiplier: 'safe',
  multiplierLabel: 'safe',
  paymentMode: 'safe',
  tariffObservedOn: 'safe',
  total: 'money',
} as const satisfies FieldPolicy<RouteGeometryToll>
const ROUTE_GEOMETRY_TOLL_MONEY_FIELDS = moneyFieldsOf(ROUTE_GEOMETRY_TOLL_FIELD_POLICY)

function redactRouteGeometryToll(toll: RouteGeometryToll): RedactedRouteGeometryToll {
  const withoutTotals = omitFields(toll, ROUTE_GEOMETRY_TOLL_MONEY_FIELDS)
  return { ...withoutTotals, booths: toll.booths.map(redactTollBoothLine) }
}

/** `toll` fica `safe` pelo mesmo motivo de `booths` acima: redigido à parte, nunca omitido inteiro. */
const ROUTE_GEOMETRY_OPTION_FIELD_POLICY = {
  distanceMeters: 'safe',
  durationSeconds: 'safe',
  fuelTotal: 'money',
  isNoToll: 'safe',
  legs: 'safe',
  points: 'safe',
  signature: 'safe',
  toll: 'safe',
  totalCost: 'money',
} as const satisfies FieldPolicy<RouteGeometryOption>
const ROUTE_GEOMETRY_OPTION_MONEY_FIELDS = moneyFieldsOf(ROUTE_GEOMETRY_OPTION_FIELD_POLICY)

function redactRouteGeometryOption(option: RouteGeometryOption): RedactedRouteGeometryOption {
  const withoutMoney = omitFields(option, ROUTE_GEOMETRY_OPTION_MONEY_FIELDS)
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

/**
 * T707 (H3, achado anterior à 153): `GET /trips` mandava `documentsTotal`/`revenueTotal` sob a
 * política de leitura de viagem — a RF9 cobriu route-geometry, valuation-preview, NF-e e o
 * detalhe, mas esqueceu a listagem. `revenueSource` fica: é a origem do número, não o número.
 */
export function redactTripAmountsMoney<
  TAmounts extends Readonly<{ documentsTotal: unknown; revenueTotal: unknown }>,
>(input: {
  readonly amounts: TAmounts | null
  readonly canReadFinancials: boolean
}): null | Omit<TAmounts, 'documentsTotal' | 'revenueTotal'> | TAmounts {
  if (input.amounts === null) return null
  if (input.canReadFinancials) return input.amounts
  return omitFields(input.amounts, ['documentsTotal', 'revenueTotal'] as const)
}
