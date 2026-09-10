/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MultiVehicleSuggestionDocumentUnavailableError,
  MultiVehicleSuggestionDriverRepeatedError,
  MultiVehicleSuggestionDriverUnavailableError,
  MultiVehicleSuggestionEmptyError,
  MultiVehicleSuggestionStopClaimedTwiceError,
  MultiVehicleSuggestionVehicleNotInProposalError,
  MultiVehicleSuggestionVehicleUnavailableError,
  RouteSuggestionNotDecidableError,
  RouteSuggestionNotFoundError,
} from '../domain/routing.error.js'
import type {
  AcceptedMultiVehicleTrip,
  SkippedMultiVehicleDocument,
  MultiVehicleScope,
  MultiVehicleSuggestionUseCase,
} from './multi-vehicle-suggestion.port.js'
import type {
  MultiVehicleSuggestionGroup,
  MultiVehicleSuggestionRepository,
} from './multi-vehicle-suggestion.repository.js'
import type { RouteOptimizationQueue } from './route-suggestion.use-case.js'
import type { RouteSuggestionAssumptions } from './route-suggestion.port.js'
import type { RouteSuggestionRepository } from './route-suggestion.repository.js'

/**
 * O que o aceite usa para transformar a proposta em viagem. São os casos de uso da 056 vistos de
 * fora — criar, vincular, ordenar e planejar —, e é de propósito que esta lista seja o contrato:
 * ela deixa explícito que a sugestão **não escreve viagem por conta própria** (ADR-0044 §5).
 */
export type TripComposer = Readonly<{
  createTrip: (input: {
    readonly context: MultiVehicleScope
    readonly driverId: string | null
    readonly vehicleId: string
  }) => Promise<{ readonly tripId: string }>
  /**
   * Spec 107 D1: devolve `false` quando a nota **já está viva em outra viagem**, em vez de lançar.
   * Um vínculo recusado não pode derrubar um aceite que já criou cinco viagens corretas — foi o que
   * aconteceu em 2026-09-09, e o operador leu um código de suporte no lugar do roteiro pronto.
   */
  linkDocument: (input: {
    readonly context: MultiVehicleScope
    readonly nfeDocumentId: string
    readonly tripId: string
  }) => Promise<boolean>
  planRoute: (input: {
    readonly context: MultiVehicleScope
    readonly tripId: string
  }) => Promise<void>
  /** As paradas nascem da reconciliação; aqui só se diz em que ordem elas ficam. */
  /**
   * Spec 107 D3: grava na viagem o ETA que a sugestão calculou, e **carimba quando** ele foi
   * calculado. ⚠️ A hora envelhece: sem o carimbo a tela mostraria uma previsão de 7h como se fosse
   * de agora.
   */
  applyEstimatedArrivals: (input: {
    readonly context: MultiVehicleScope
    readonly estimatedArrivalByAddressKey: ReadonlyMap<string, string>
    /** Spec 109 D2: a saída suposta, que vira a âncora do ETA na viagem. */
    readonly plannedDepartureAt: string | null
    readonly tripId: string
  }) => Promise<void>
  reorderStops: (input: {
    readonly context: MultiVehicleScope
    readonly orderedAddressKeys: readonly string[]
    readonly tripId: string
  }) => Promise<void>
}>

export type MultiVehicleSuggestionDependencies = Readonly<{
  createSeed?: () => number
  multiVehicle: MultiVehicleSuggestionRepository
  queue: RouteOptimizationQueue
  suggestions: RouteSuggestionRepository
  trips: TripComposer
}>

const MAX_SEED = 2_147_483_647

/**
 * Spec 107 D3: o término é a **maior** hora entre as paradas, não a última do mapa — `Map` preserva
 * a ordem de escrita, que é a das paradas propostas, e a reordenação pode não segui-la.
 *
 * ⚠️ Mapa vazio é `null`, nunca agora: planejamento sem ETA é o caso em que a tela cala.
 */
function resolveFinishAt(estimatedArrivalByAddressKey: ReadonlyMap<string, string>): string | null {
  let latest: string | null = null
  for (const arrival of estimatedArrivalByAddressKey.values()) {
    if (latest === null || arrival > latest) latest = arrival
  }

  return latest
}

export function createMultiVehicleSuggestionUseCase(
  dependencies: MultiVehicleSuggestionDependencies,
): MultiVehicleSuggestionUseCase {
  const createSeed = dependencies.createSeed ?? (() => Math.floor(Math.random() * MAX_SEED))

  async function readReady(input: { readonly companyId: string; readonly suggestionId: string }) {
    const found = await dependencies.suggestions.find(input)
    /**
     * `tripId !== null` é sugestão **de viagem**, e ela não se decide por aqui: as duas rotas moram
     * em árvores diferentes de propósito, e responder pela outra faria o aceite de uma viagem
     * existente criar viagem nova.
     */
    if (found === null || found.tripId !== null) throw new RouteSuggestionNotFoundError()
    if (found.status !== 'ready') throw new RouteSuggestionNotDecidableError()

    return found
  }

  return {
    async accept({ context, stopOrderByVehicle, suggestionId, vehicleIds }) {
      const found = await readReady({ companyId: context.companyId, suggestionId })
      const proposed = await dependencies.multiVehicle.readGroups({
        companyId: context.companyId,
        suggestionId,
      })

      /**
       * Spec 110 D5a: **a recusa vem antes da reivindicação.** Um veículo que esta distribuição
       * nunca propôs é pedido malformado, e consumir a sugestão por causa dele queimaria uma
       * proposta boa — o operador perderia as quatro viagens por causa de um id errado.
       */
      const groups = resolveAcceptedGroups({ proposed, stopOrderByVehicle, vehicleIds })

      /**
       * Spec 107 D2: **a sugestão é reivindicada antes de qualquer viagem nascer.**
       *
       * ⚠️ A ordem era a inversa, de propósito — criar primeiro deixava a sugestão `ready` quando a
       * criação falhava no meio, e o operador repetia. Mas `accept` gastava **onze segundos**
       * criando viagens entre ler `ready` e marcar `accepted`, e dois pedidos nessa janela passavam
       * os dois: medido em 2026-09-09, o segundo criou uma viagem órfã e morreu ao vincular uma nota
       * que o primeiro acabara de vincular.
       *
       * `decide` já era condicional (`where status = 'ready'`); faltava chamá-lo cedo. A retomada
       * que a ordem antiga protegia é preservada pela **escrita compensatória** do `catch`.
       */
      const decided = await dependencies.suggestions.decide({
        companyId: context.companyId,
        decidedByUserId: context.userId,
        status: 'accepted',
        suggestionId,
      })
      if (decided === null) throw new RouteSuggestionNotDecidableError()

      const trips: AcceptedMultiVehicleTrip[] = []
      const skippedDocuments: SkippedMultiVehicleDocument[] = []
      try {
        for (const group of groups) {
          /**
           * ⚠️ **O horário previsto é da ordem do solver**, gravado casado por endereço. Com a ordem
           * trocada à mão ele diria que o caminhão chega na terceira parada antes da primeira — e
           * campo vazio é o vocabulário da casa, nunca um horário plausível descrevendo outra ordem.
           */
          const arrivals = group.isManualOrder
            ? new Map<string, string>()
            : group.estimatedArrivalByAddressKey
          const { tripId } = await dependencies.trips.createTrip({
            context,
            driverId: group.driverId,
            vehicleId: group.vehicleId,
          })

          let linkedCount = 0
          for (const nfeDocumentId of group.documentIds) {
            const linked = await dependencies.trips.linkDocument({ context, nfeDocumentId, tripId })
            if (linked) linkedCount += 1
            else skippedDocuments.push({ nfeDocumentId, reason: 'already_linked' })
          }

          if (group.orderedAddressKeys.length > 0) {
            await dependencies.trips.reorderStops({
              context,
              orderedAddressKeys: group.orderedAddressKeys,
              tripId,
            })
          }

          /** A viagem sai daqui em `route_planned`: é o que a spec promete ao operador (RF-5). */
          await dependencies.trips.planRoute({ context, tripId })

          /**
           * ⚠️ **Depois de `reorderStops`**: a parada só existe pela reconciliação do vínculo, e o
           * casamento por endereço precisa dela gravada. Antes disso não há o que carimbar.
           */
          await dependencies.trips.applyEstimatedArrivals({
            context,
            estimatedArrivalByAddressKey: arrivals,
            plannedDepartureAt: found.plannedDepartureAt,
            tripId,
          })

          trips.push({
            documentCount: linkedCount,
            driverId: group.driverId,
            estimatedFinishAt: resolveFinishAt(arrivals),
            stopCount: group.orderedAddressKeys.length,
            tripId,
            vehicleId: group.vehicleId,
          })
        }
      } catch (cause) {
        /**
         * ⚠️ A escrita compensatória: devolve a sugestão para `ready`, e o operador repete — é a
         * propriedade que a ordem antiga protegia. Ela **não** desfaz as viagens já criadas:
         * apagá-las seria destruir trabalho que pode estar correto, e a lista de viagens mostra o
         * que nasceu.
         */
        await dependencies.suggestions.release({ companyId: context.companyId, suggestionId })
        throw cause
      }

      return { skippedDocuments, suggestion: { ...decided, stops: found.stops }, trips }
    },

    async create(input) {
      const documentIds = [...new Set(input.documentIds)]
      /** O par é único **pelo veículo**: pedir duas vezes o mesmo caminhão é o mesmo caminhão. */
      const vehicles = [...new Map(input.vehicles.map((pair) => [pair.vehicleId, pair])).values()]
      const vehicleIds = vehicles.map((pair) => pair.vehicleId)
      if (documentIds.length === 0) throw new MultiVehicleSuggestionEmptyError('documentIds')
      if (vehicleIds.length === 0) throw new MultiVehicleSuggestionEmptyError('vehicleIds')

      /**
       * RF-2: o mesmo motorista em dois pares seriam duas viagens simultâneas dele no PWA, sem nada
       * dizendo qual é a de hoje. Aqui a repetição é do **chamador**, e por isso é recusa, não
       * deduplicação como a do veículo — descartar em silêncio deixaria um caminhão sem motorista
       * sem ninguém saber por quê.
       */
      const driverIds = vehicles
        .map((pair) => pair.driverId)
        .filter((driverId): driverId is string => driverId !== undefined)
      const repeated = driverIds.filter((driverId, index) => driverIds.indexOf(driverId) !== index)
      if (repeated.length > 0) {
        throw new MultiVehicleSuggestionDriverRepeatedError([...new Set(repeated)])
      }

      /**
       * As conferências correm juntas: elas não dependem uma da outra, e a lentidão de uma seguida
       * da outra apareceria numa tela em que o operador acabou de selecionar oitenta notas.
       */
      const [unavailableDocuments, unavailableVehicles, unavailableDrivers] = await Promise.all([
        dependencies.multiVehicle.findUnavailableDocumentIds({
          companyId: input.context.companyId,
          documentIds,
        }),
        dependencies.multiVehicle.findUnavailableVehicleIds({
          companyId: input.context.companyId,
          vehicleIds,
        }),
        dependencies.multiVehicle.findUnavailableDriverIds({
          companyId: input.context.companyId,
          driverIds,
        }),
      ])
      if (unavailableDocuments.length > 0) {
        throw new MultiVehicleSuggestionDocumentUnavailableError(unavailableDocuments)
      }
      if (unavailableVehicles.length > 0) {
        throw new MultiVehicleSuggestionVehicleUnavailableError(unavailableVehicles)
      }
      if (unavailableDrivers.length > 0) {
        throw new MultiVehicleSuggestionDriverUnavailableError(unavailableDrivers)
      }

      const settings = await dependencies.suggestions.readSettings(input.context.companyId)
      const assumptions: RouteSuggestionAssumptions = {
        dutyEnabled: Object.values(settings.duty).some((limit) => limit !== null),
        endPolicy: settings.endPolicy,
        fallbackWeightKilograms: settings.fallbackWeightKilograms,
        originAddressKey: settings.originAddressKey,
        serviceTimeSeconds: settings.defaultServiceTimeSeconds,
        serviceTimeSource: 'default',
        solverTimeBudgetSeconds: input.solverTimeBudgetSeconds ?? settings.solverTimeBudgetSeconds,
      }

      const created = await dependencies.multiVehicle.create({
        assumptions,
        companyId: input.context.companyId,
        documentIds,
        seed: input.seed ?? createSeed(),
        vehicles,
      })

      await dependencies.queue.publish({
        companyId: input.context.companyId,
        correlationId: input.correlationId,
        suggestionId: created.id,
      })

      return created
    },

    async read({ context, suggestionId }) {
      const found = await dependencies.suggestions.find({
        companyId: context.companyId,
        suggestionId,
      })
      if (found === null || found.tripId !== null) throw new RouteSuggestionNotFoundError()

      return found
    },

    async reject({ context, suggestionId }) {
      await readReady({ companyId: context.companyId, suggestionId })

      const decided = await dependencies.suggestions.decide({
        companyId: context.companyId,
        decidedByUserId: context.userId,
        status: 'rejected',
        suggestionId,
      })
      if (decided === null) throw new RouteSuggestionNotDecidableError()

      return decided
    },
  }
}

/**
 * Quais grupos entram no aceite. Ausente é **todos**, que é o comportamento anterior à spec 110.
 *
 * ⚠️ A ordem da proposta é preservada: ela é a ordem em que os veículos foram ofertados, e é ela que
 * faz a mesma semente distribuir igual (spec 058 P2).
 */
type StopOrderEntry = Readonly<{ orderedAddressKeys: readonly string[]; vehicleId: string }>

/** O grupo como o aceite o cria: as paradas finais, e se a ordem deixou de ser a do solver. */
type AcceptedGroup = MultiVehicleSuggestionGroup & Readonly<{ isManualOrder: boolean }>

/**
 * Quais veículos viram viagem, com que paradas, e em que ordem cada um para.
 *
 * ⚠️ **Toda recusa acontece aqui, antes da reivindicação** (spec 107 D2): veículo fora da proposta
 * e parada reivindicada por dois caminhões são pedido malformado, e consumir a sugestão por causa
 * deles queimaria uma proposta boa.
 */
function resolveAcceptedGroups(
  input: Readonly<{
    proposed: readonly MultiVehicleSuggestionGroup[]
    stopOrderByVehicle: readonly StopOrderEntry[] | undefined
    vehicleIds: readonly string[] | undefined
  }>,
): readonly AcceptedGroup[] {
  const proposedIds = new Set(input.proposed.map((group) => group.vehicleId))
  const named = [
    ...(input.vehicleIds ?? []),
    ...(input.stopOrderByVehicle ?? []).map((entry) => entry.vehicleId),
  ]
  const unknown = [...new Set(named.filter((vehicleId) => !proposedIds.has(vehicleId)))]
  if (unknown.length > 0) throw new MultiVehicleSuggestionVehicleNotInProposalError(unknown)

  const accepted = input.vehicleIds === undefined ? proposedIds : new Set(input.vehicleIds)
  const chosenByVehicle = new Map(
    (input.stopOrderByVehicle ?? []).map((entry) => [entry.vehicleId, entry.orderedAddressKeys]),
  )
  const groupByVehicle = new Map(input.proposed.map((group) => [group.vehicleId, group]))
  const ownerByKey = new Map(
    input.proposed.flatMap((group) =>
      group.orderedAddressKeys.map((key) => [key, group.vehicleId]),
    ),
  )
  const movedTo = resolveMoves({ chosenByVehicle, ownerByKey })

  return input.proposed
    .filter((group) => accepted.has(group.vehicleId))
    .flatMap((group) => {
      const resolved = resolveGroup({
        chosen: chosenByVehicle.get(group.vehicleId) ?? [],
        group,
        groupByVehicle,
        movedTo,
        ownerByKey,
      })
      return resolved === null ? [] : [resolved]
    })
}

/**
 * As paradas que mudam de caminhão: chave → caminhão de destino.
 *
 * ⚠️ Spec 112 D3: **chave de outro caminhão na ordem de um veículo é movimento.** A spec 111 a
 * recusava, porque a 110 dizia que o solver desfaria o movimento — e desde a 111 o aceite não roda o
 * solver. Chave que a proposta não conhece segue ignorada (é o degrau `cidade:` da tela), e a mesma
 * chave na ordem de dois caminhões é recusada: qual deles fica com ela seria palpite.
 */
function resolveMoves(
  input: Readonly<{
    chosenByVehicle: ReadonlyMap<string, readonly string[]>
    ownerByKey: ReadonlyMap<string, string>
  }>,
): ReadonlyMap<string, string> {
  const claimedBy = new Map<string, string>()
  for (const [vehicleId, keys] of input.chosenByVehicle) {
    for (const key of new Set(keys)) {
      if (!input.ownerByKey.has(key)) continue
      const previous = claimedBy.get(key)
      if (previous !== undefined && previous !== vehicleId) {
        throw new MultiVehicleSuggestionStopClaimedTwiceError([previous, vehicleId])
      }
      claimedBy.set(key, vehicleId)
    }
  }
  return new Map(
    [...claimedBy].filter(([key, vehicleId]) => input.ownerByKey.get(key) !== vehicleId),
  )
}

/**
 * O caminhão depois dos movimentos: as paradas que ficam, as que chegam, e a ordem escolhida.
 *
 * ⚠️ É a mesma regra de `orderStopKeys`, que monta a planta de carga: parada que a ordem não
 * menciona **vai para o fim, na ordem do solver**. O aceite tem de criar o caminhão que o operador
 * acabou de ver desenhado; duas regras criariam outro.
 *
 * ⚠️ A parada que chega traz **as notas dela**, lidas do grupo de origem. Caminhão que não ganhou
 * nem perdeu parada segue com a lista de notas de sempre — nada a reescrever.
 */
function resolveGroup(
  input: Readonly<{
    chosen: readonly string[]
    group: MultiVehicleSuggestionGroup
    groupByVehicle: ReadonlyMap<string, MultiVehicleSuggestionGroup>
    movedTo: ReadonlyMap<string, string>
    ownerByKey: ReadonlyMap<string, string>
  }>,
): AcceptedGroup | null {
  const { group } = input
  const staying = group.orderedAddressKeys.filter((key) => !input.movedTo.has(key))
  const arriving = new Set(
    [...input.movedTo].filter(([, vehicleId]) => vehicleId === group.vehicleId).map(([key]) => key),
  )
  const available = new Set([...staying, ...arriving])
  const picked = [...new Set(input.chosen.filter((key) => available.has(key)))]
  const pickedSet = new Set(picked)
  const orderedAddressKeys = [...picked, ...staying.filter((key) => !pickedSet.has(key))]
  /**
   * Caminhão que **perdeu** todas as paradas para outros não vira viagem vazia. ⚠️ Só esse: grupo que
   * nunca teve chave de parada continua criando a viagem, como sempre criou — o aceite anterior
   * tratava esse caso de propósito, e contratos dependem dele.
   */
  if (group.orderedAddressKeys.length > 0 && orderedAddressKeys.length === 0) return null

  const changedStops = arriving.size > 0 || staying.length !== group.orderedAddressKeys.length
  const documentsOf = (key: string): readonly string[] =>
    input.groupByVehicle.get(input.ownerByKey.get(key) ?? '')?.documentIdsByAddressKey.get(key) ??
    []

  return {
    ...group,
    documentIds: changedStops ? orderedAddressKeys.flatMap(documentsOf) : group.documentIds,
    isManualOrder: changedStops || !isSameOrder(orderedAddressKeys, group.orderedAddressKeys),
    orderedAddressKeys,
  }
}

function isSameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index])
}
