/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MultiVehicleSuggestionPair } from './multi-vehicle-suggestion.port.js'
import type { RouteSuggestionAssumptions } from './route-suggestion.port.js'
import type { RouteSuggestionRecord } from './route-suggestion.repository.js'

export type MultiVehicleSuggestionGroup = Readonly<{
  documentIds: readonly string[]
  /** O motorista escolhido para este veículo, ou `null` quando o par não trouxe nenhum. */
  driverId: string | null
  /** Na ordem que o solver propôs — é ela que vira a ordem das paradas da viagem criada. */
  orderedAddressKeys: readonly string[]
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
}>
