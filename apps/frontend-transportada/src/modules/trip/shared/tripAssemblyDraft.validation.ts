/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A forma do rascunho da montagem como ele volta do armazenamento — lido como entrada não confiável.
 * Maps e Sets viram listas de pares e de ids: é o que `JSON` sabe guardar.
 *
 * ⚠️ Nenhum campo carrega endereço. A ordem das paradas é guardada pelo **id de uma nota de cada
 * parada**, e a chave `cidade|CEP|número` é recalculada na volta a partir das notas relidas.
 */
import { ROUTE_CHOICE_CRITERIA, type RouteChoice } from './routeGeometry.service'

/** A assinatura da API é um hash curto em hexadecimal; algo maior não é assinatura nossa. */
const ROUTE_SIGNATURE_MAX_LENGTH = 128

type IdPairs<TValue> = readonly (readonly [string, TValue])[]

export type ManualAssemblyDraft = Readonly<{
  /** `null` é "ninguém digitou" — e é o que deixa a sugestão da prévia aparecer no campo. */
  dailyAllowanceDaysInput: null | string
  documentIds: readonly string[]
  driverIds: readonly string[]
  isOpen: boolean
  routeChoice: null | RouteChoice
  stopOrderDocumentIds: readonly string[]
  vehicleId: string
}>

export type AutomaticProposalDraft = Readonly<{
  draftOrderDocumentIdsByVehicle: IdPairs<readonly string[]>
  draftStopMoves: IdPairs<string>
  openVehicleId: null | string
  orderDocumentIdsByVehicle: IdPairs<readonly string[]>
  pendingRemovals: readonly string[]
  releaseLayoutByVehicle: IdPairs<string>
  routeChoiceByVehicle: IdPairs<RouteChoice>
  selectedVehicleIds: readonly string[]
  stopMoves: IdPairs<string>
  suggestionId: string
}>

export type AutomaticAssemblyDraft = Readonly<{
  documentIds: readonly string[]
  driverIds: readonly string[]
  isOpen: boolean
  /** A sugestão pedida que ainda não ficou pronta: sem isto ela ficaria órfã no servidor. */
  pendingSuggestionId: null | string
  proposal: AutomaticProposalDraft | null
  vehicleIds: readonly string[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString)
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isRouteChoice(value: unknown): value is RouteChoice {
  return (
    isRecord(value) &&
    ROUTE_CHOICE_CRITERIA.some((criterion) => criterion === value.criterion) &&
    (value.signature === null ||
      (isString(value.signature) && value.signature.length <= ROUTE_SIGNATURE_MAX_LENGTH))
  )
}

function isIdPairs<TValue>(
  value: unknown,
  isValue: (entry: unknown) => entry is TValue,
): value is IdPairs<TValue> {
  return (
    Array.isArray(value) &&
    value.every(
      (pair) => Array.isArray(pair) && pair.length === 2 && isString(pair[0]) && isValue(pair[1]),
    )
  )
}

export function isManualAssemblyDraft(value: unknown): value is ManualAssemblyDraft {
  return (
    isRecord(value) &&
    isNullableString(value.dailyAllowanceDaysInput) &&
    isStringList(value.documentIds) &&
    isStringList(value.driverIds) &&
    typeof value.isOpen === 'boolean' &&
    (value.routeChoice === null || isRouteChoice(value.routeChoice)) &&
    isStringList(value.stopOrderDocumentIds) &&
    isString(value.vehicleId)
  )
}

export function isAutomaticProposalDraft(value: unknown): value is AutomaticProposalDraft {
  return (
    isRecord(value) &&
    isIdPairs(value.draftOrderDocumentIdsByVehicle, isStringList) &&
    isIdPairs(value.draftStopMoves, isString) &&
    isNullableString(value.openVehicleId) &&
    isIdPairs(value.orderDocumentIdsByVehicle, isStringList) &&
    isStringList(value.pendingRemovals) &&
    isIdPairs(value.releaseLayoutByVehicle, isString) &&
    isIdPairs(value.routeChoiceByVehicle, isRouteChoice) &&
    isStringList(value.selectedVehicleIds) &&
    isIdPairs(value.stopMoves, isString) &&
    isString(value.suggestionId)
  )
}

export function isAutomaticAssemblyDraft(value: unknown): value is AutomaticAssemblyDraft {
  return (
    isRecord(value) &&
    isStringList(value.documentIds) &&
    isStringList(value.driverIds) &&
    typeof value.isOpen === 'boolean' &&
    isNullableString(value.pendingSuggestionId) &&
    (value.proposal === null || isAutomaticProposalDraft(value.proposal)) &&
    isStringList(value.vehicleIds)
  )
}
