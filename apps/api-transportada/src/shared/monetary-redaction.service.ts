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
 * foi o que produziu C1 e H3. `TollBoothRouteLine`, `RouteGeometryToll` e `RouteGeometryOption` já
 * usavam a classificação **exaustiva** abaixo: `Record<keyof T, 'money' | 'safe'>` obriga toda chave
 * existente a estar aqui, e o TypeScript já reprova a compilação se `T` ganhar um campo novo sem
 * entrada — antes de qualquer teste rodar, no mesmo `bun run typecheck` que já é gate.
 *
 * N6 (segunda revisão da 153): C1 e H3 aconteciam em `NfeDocumentSummary`, `TripDocumentDetail` e
 * `TripAmounts` — três tipos que este arquivo compartilhado não conhece, e que nunca passavam pela
 * exaustividade acima. Declarar a política aqui, genérica sobre `TDocument`, reproduzia a mesma
 * lista de exclusão que causou os dois achados. `FieldPolicy`/`moneyFieldsOf` saem exportados, e
 * `redactMoneyFields` abaixo troca a lista fixa de chaves por um array — quem conhece o tipo
 * concreto (o módulo dono: `nfe-documents.routes.ts`, `trip.routes.ts`,
 * `read-trip-revenue-totals.use-case.ts`) declara a própria `FieldPolicy<T>` com `satisfies` e passa
 * `moneyFieldsOf(...)` para cá. O acoplamento fica na direção certa, e a exaustividade chega aos três
 * tipos que de fato vazaram.
 */
export type FieldPolicy<TRecord> = Readonly<Record<keyof TRecord, 'money' | 'safe'>>

/** As chaves de `TPolicy` classificadas `'money'` — computado do tipo **literal** da política. */
export type MoneyKeysOf<TPolicy> = {
  readonly [TKey in keyof TPolicy]: TPolicy[TKey] extends 'money' ? TKey : never
}[keyof TPolicy]

export function moneyFieldsOf<TPolicy extends Record<string, 'money' | 'safe'>>(
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

/**
 * N6 (segunda revisão da 153): substituem `redactNfeDocumentMoney`/`redactTripDocumentMoney`/
 * `redactTripAmountsMoney` — cada um era lista de exclusão fixa, cega a campo monetário novo no
 * próprio tipo (o mesmo defeito de C1/H3). `redactMoneyFields` é o helper genérico sobre um array de
 * chaves; quem conhece o tipo concreto (`nfe-documents.routes.ts`, `trip.routes.ts`,
 * `read-trip-revenue-totals.use-case.ts` — o módulo dono de cada um) declara a própria
 * `FieldPolicy<T>` exaustiva com `satisfies` e passa `moneyFieldsOf(...)` para cá. O acoplamento
 * fica na direção certa, e a exaustividade chega aos três tipos que de fato vazaram.
 */
export function redactMoneyFields<TRecord extends object, TField extends keyof TRecord>(input: {
  readonly canReadFinancials: boolean
  readonly fields: readonly TField[]
  readonly record: TRecord
}): Omit<TRecord, TField> | TRecord {
  if (input.canReadFinancials) return input.record
  return omitFields(input.record, input.fields)
}
