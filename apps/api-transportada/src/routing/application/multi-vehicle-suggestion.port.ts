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
  /**
   * Spec 107 D3: **quando este caminhão fica livre** — o ETA mais tardio das paradas que o
   * planejamento acabou de gravar. É o que a frase da sobra imprime, e `null` quando o planejamento
   * não calculou hora nenhuma: hora inventada ali é pior que silêncio.
   */
  estimatedFinishAt: string | null
  stopCount: number
  tripId: string
  vehicleId: string
}>

/**
 * Spec 107 D1: a nota que ficou de fora, **nomeada**. Vazio é o normal; não-vazio é o que a tela
 * abre numa lista, porque "56 notas" sem quais manda o operador procurar numa tela de 345.
 */
export type SkippedMultiVehicleDocument = Readonly<{
  nfeDocumentId: string
  reason: 'already_linked'
}>

export type AcceptedMultiVehicleSuggestion = Readonly<{
  skippedDocuments: readonly SkippedMultiVehicleDocument[]
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
/**
 * Spec 110 D5a: **aceitar parte.** `vehicleIds` ausente é a proposta inteira — o corpo de sempre.
 *
 * ⚠️ O que não é aceito **não vira nada**: as notas voltam ao maço porque nunca saíram dele. Manter
 * a sugestão `ready` para aceitar o resto depois foi recusado — entre os dois aceites o maço muda, e
 * a segunda metade descreveria uma distribuição que já não existe.
 */
export type AcceptMultiVehicleSuggestionInput = ReadMultiVehicleSuggestionInput &
  Readonly<{ vehicleIds?: readonly string[] }>

export type MultiVehicleSuggestionUseCase = Readonly<{
  accept: (input: AcceptMultiVehicleSuggestionInput) => Promise<AcceptedMultiVehicleSuggestion>
  create: (input: CreateMultiVehicleSuggestionInput) => Promise<RouteSuggestion>
  read: (input: ReadMultiVehicleSuggestionInput) => Promise<RouteSuggestion>
  reject: (input: ReadMultiVehicleSuggestionInput) => Promise<RouteSuggestion>
}>
