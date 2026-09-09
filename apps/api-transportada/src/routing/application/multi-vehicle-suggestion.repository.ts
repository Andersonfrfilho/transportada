/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MultiVehicleSuggestionPair } from './multi-vehicle-suggestion.port.js'
import type { RouteSuggestionAssumptions } from './route-suggestion.port.js'
import type { RouteSuggestionStatus } from '../../database/route-suggestion.schema.js'
import type { RouteSuggestionRecord } from './route-suggestion.repository.js'

export type MultiVehicleSuggestionGroup = Readonly<{
  documentIds: readonly string[]
  /** O motorista escolhido para este veículo, ou `null` quando o par não trouxe nenhum. */
  driverId: string | null
  /** Na ordem que o solver propôs — é ela que vira a ordem das paradas da viagem criada. */
  orderedAddressKeys: readonly string[]
  /**
   * Spec 107 D3: a hora estimada de chegada em cada endereço, do planejamento. É o que o aceite
   * carrega para a viagem — sem isso o ETA morre na sugestão, e não há hora de término em lugar
   * nenhum do sistema.
   */
  estimatedArrivalByAddressKey: ReadonlyMap<string, string>
  vehicleId: string
}>

/**
 * Spec 101: as pernas de um veículo, na ordem das paradas. É o que `sumVehicleRoad` soma para dar
 * distância e duração da viagem proposta — sem tocar no roteirizador (D1).
 */
export type MultiVehicleSuggestionRoad = Readonly<{
  stops: readonly Readonly<{
    distanceFromPreviousMeters: number | null
    durationFromPreviousSeconds: number | null
  }>[]
  vehicleId: string
}>

export type CreateMultiVehicleSuggestionRecord = Readonly<{
  assumptions: RouteSuggestionAssumptions
  companyId: string
  documentIds: readonly string[]
  seed: number
  vehicles: readonly MultiVehicleSuggestionPair[]
}>

export type MultiVehicleSuggestionRepository = Readonly<{
  create: (input: CreateMultiVehicleSuggestionRecord) => Promise<RouteSuggestionRecord>
  /**
   * Os ids que **não** podem entrar no pool, com o motivo já decidido pela consulta: nota
   * inexistente e nota já em viagem respondem juntas, porque as duas significam "não use esta".
   */
  findUnavailableDocumentIds: (input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }) => Promise<readonly string[]>
  /** Motorista inexistente, de outra empresa ou inativo — a mesma resposta pelos três motivos. */
  findUnavailableDriverIds: (input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }) => Promise<readonly string[]>
  /** Veículo inexistente, inativo ou que não traciona — a mesma resposta pelos três motivos. */
  findUnavailableVehicleIds: (input: {
    readonly companyId: string
    readonly vehicleIds: readonly string[]
  }) => Promise<readonly string[]>
  /** O que o aceite precisa: quem leva o quê, em que ordem. Vazio quando o solver não distribuiu. */
  readGroups: (input: {
    readonly companyId: string
    readonly suggestionId: string
  }) => Promise<readonly MultiVehicleSuggestionGroup[]>
  /**
   * Spec 101: o estado da sugestão **desta empresa**. `null` é ausência — sugestão de outra empresa
   * responde igual a sugestão inexistente, porque dizer "existe, mas não é sua" já entrega que ela
   * existe.
   */
  readSuggestionStatus: (input: {
    readonly companyId: string
    readonly suggestionId: string
  }) => Promise<null | RouteSuggestionStatus>
  /**
   * Spec 101: as pernas por veículo, para a conta da sugestão.
   *
   * ⚠️ Consulta **própria**, e não uma coluna a mais em `readGroups`: aquela devolve uma linha por
   * (parada × nota), então uma parada com três notas apareceria três vezes e a soma triplicaria a
   * distância. Aqui a linha é a parada, e não há o que deduplicar.
   */
  readVehicleRoads: (input: {
    readonly companyId: string
    readonly suggestionId: string
  }) => Promise<readonly MultiVehicleSuggestionRoad[]>
}>
