/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 101: o que a conta da sugestão precisa do mundo lá fora.
 *
 * ⚠️ **Repare no que esta porta NÃO tem: geometria.** É a D1 escrita em forma de tipo — a distância
 * de cada viagem proposta sai das paradas que o solver já escolheu, e não há como chamar o
 * roteirizador daqui sem alargar esta interface, o que torna a decisão visível em revisão em vez de
 * escondida numa linha no meio do use case.
 */
import type { RouteSuggestionStatus } from '../../database/route-suggestion.schema.js'
import type { TripValuation } from '../../trips/domain/trip-valuation.policy.js'
import type { TripValuationContext } from '../../trips/application/read-trip-valuation.use-case.js'
import type {
  MultiVehicleSuggestionGroup,
  MultiVehicleSuggestionRoad,
} from './multi-vehicle-suggestion.repository.js'

export type SuggestionValuationPort = {
  /** Quem leva o quê: as notas e o motorista de cada veículo da distribuição. */
  readGroups: (input: {
    readonly companyId: string
    readonly suggestionId: string
  }) => Promise<readonly MultiVehicleSuggestionGroup[]>
  /**
   * O mesmo contexto que a prévia da montagem monta — ficha do veículo, tripulação, notas, regime
   * federal e preço do combustível. O que muda é quem escolhe o conjunto: aqui é a sugestão.
   */
  readPreviewContext: (input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  }) => Promise<TripValuationContext | null>
  /** `null` quando a sugestão não existe **para esta empresa** — ausência, nunca 403. */
  readSuggestionStatus: (input: {
    readonly companyId: string
    readonly suggestionId: string
  }) => Promise<null | RouteSuggestionStatus>
  readVehicleRoads: (input: {
    readonly companyId: string
    readonly suggestionId: string
  }) => Promise<readonly MultiVehicleSuggestionRoad[]>
  /** `buildValuationFromContext` — a única conta de margem do produto (spec 101 T1). */
  resolveValuation: (input: {
    readonly companyId: string
    readonly context: TripValuationContext
  }) => Promise<TripValuation>
}
