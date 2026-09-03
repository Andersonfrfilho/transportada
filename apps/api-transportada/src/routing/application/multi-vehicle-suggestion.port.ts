/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { RouteSuggestion } from './route-suggestion.port.js'

/**
 * Aqui o contexto é o **completo**, não o `CompanyScope` do resto do roteirizador: o aceite compõe
 * viagem chamando os casos de uso da 056, e eles pedem `CompanyContext`. Estreitar o tipo aqui
 * obrigaria a alargá-lo de volta com um `as`, que é a forma de mentir sobre isso.
 */
export type MultiVehicleScope = CompanyContext

export type CreateMultiVehicleSuggestionInput = Readonly<{
  context: MultiVehicleScope
  correlationId: string
  documentIds: readonly string[]
  seed?: number | undefined
  solverTimeBudgetSeconds?: number | undefined
  /** ADR-0055: o par. `driverId` ausente é a distribuição sem escala definida. */
  vehicles: readonly MultiVehicleSuggestionPair[]
}>

export type MultiVehicleSuggestionPair = Readonly<{
  driverId?: string | undefined
  vehicleId: string
}>

export type ReadMultiVehicleSuggestionInput = Readonly<{
  context: MultiVehicleScope
  suggestionId: string
}>

/** Uma viagem por veículo que o solver usou — vazio quando a sugestão não distribuiu nada. */
export type AcceptedMultiVehicleTrip = Readonly<{
  documentCount: number
  /** Quem dirige esta viagem, ou `null` quando o par não trouxe motorista. */
  driverId: string | null
  stopCount: number
  tripId: string
  vehicleId: string
}>

export type AcceptedMultiVehicleSuggestion = Readonly<{
  suggestion: RouteSuggestion
  trips: readonly AcceptedMultiVehicleTrip[]
}>

/**
 * Spec 058 P2: **o pool ainda não é viagem.** A sugestão de uma viagem só parte de paradas que já
 * existem; esta parte de um monte de nota e um monte de veículo, e a viagem é **resultado** do
 * aceite, não pré-requisito dele.
 *
 * Daí a única diferença de desenho que importa: o aceite aqui **cria**. E como criar viagem, vincular
 * nota e ordenar parada já são casos de uso da 056, ele os chama — não reimplementa nenhum (D4).
 */
export type MultiVehicleSuggestionUseCase = Readonly<{
  accept: (input: ReadMultiVehicleSuggestionInput) => Promise<AcceptedMultiVehicleSuggestion>
  create: (input: CreateMultiVehicleSuggestionInput) => Promise<RouteSuggestion>
  read: (input: ReadMultiVehicleSuggestionInput) => Promise<RouteSuggestion>
  reject: (input: ReadMultiVehicleSuggestionInput) => Promise<RouteSuggestion>
}>
