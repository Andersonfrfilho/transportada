/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: ordena as paradas do rascunho pela estrada.
 *
 * Corre depois do vínculo das notas (lote e avulsa) e no botão "Ordenar paradas". Lê o estado, monta a matriz do OSRM
 * com o barracão no ponto 0 e escreve pelo `reorderTripStops` (a mesma porta de não-retorno da 056), nunca pelo
 * repositório. ⚠️ **Falha não vira linha reta** (ADR-0044 §1 e §5): sem OSRM, sem barracão geocodificado ou com paradas
 * demais, a ordem de chegada fica e o motivo é gravado em `trips.stop_order_error_code`.
 */
import type { StopOrderErrorCode, StopOrderSource } from '../domain/draft-stop-order.constant.js'
import {
  DRAFT_STOP_ORDER_MAX_STOPS,
  STOP_ORDER_ERROR_CODES,
} from '../domain/draft-stop-order.constant.js'
import {
  orderStopsByRoad,
  resolveDraftStopOrderMode,
  type DraftStopForOrdering,
} from '../domain/draft-stop-order.policy.js'
import { TripStateTransitionNotAllowedError } from '../domain/trip.error.js'
import { checkTripAcceptsLinkage } from '../domain/trip-state.policy.js'
import type { RouteDepot } from '../domain/route-depot.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import type { TripRouteFreezeLogger } from './freeze-trip-route-gracefully.js'
import type { OrderDraftTripStopsPort } from './order-draft-trip-stops.port.js'
import type { PlanTripRouteTollFreezer } from './plan-trip-route.use-case.js'
import { reorderTripStops, type ReorderTripStopsPort } from './reorder-trip-stops.use-case.js'
import type { RoadMatrixPort } from './road-matrix.port.js'

/** Só estas precisões entram na conta: `city` é o centro do município, e ordenar por ele é ordenar por um palpite. */
const ORDERABLE_PRECISIONS = new Set(['rooftop', 'street', 'postal_code'])

export type DraftStopOrderOutcome = Readonly<{
  errorCode: StopOrderErrorCode | null
  /** Paradas que ficaram fora da conta por não terem coordenada confiável (RF3). */
  excludedStopCount: number
  /**
   * `ordered`: as paradas mudaram de lugar. `unchanged`: a ordem já era a certa. `unordered`: falhou e ficou a ordem
   * de chegada. `skipped`: nada a ordenar (viagem despachada, uma parada só, sem parada nova na ordem manual).
   */
  status: 'ordered' | 'skipped' | 'unchanged' | 'unordered'
}>

export type OrderDraftTripStopsInput = Readonly<{
  companyId: string
  /**
   * `reorder_all` ignora a origem `manual` e refaz tudo (botão "Ordenar paradas"). `auto` respeita o que o despachante
   * fez e só encaixa a parada nova (D2).
   */
  intent?: 'auto' | 'reorder_all'
  /** As paradas que a viagem já tinha antes do vínculo. As outras são as novas do modo `insert_new`. */
  knownStopIds?: ReadonlySet<string>
  /** O botão pede 409 em viagem despachada; o vínculo só segue adiante. */
  strict?: boolean
  tripId: string
}>

export type OrderDraftTripStops = Readonly<{
  execute(input: OrderDraftTripStopsInput): Promise<DraftStopOrderOutcome>
  /** O vínculo chama antes de vincular, para saber depois quais paradas nasceram nele. */
  snapshotStopIds(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<ReadonlySet<string>>
}>

export function createOrderDraftTripStops(dependencies: {
  readonly depot: { readDepot(input: { readonly companyId: string }): Promise<RouteDepot> }
  readonly logger?: TripRouteFreezeLogger
  /** Sem ele o ordenador não existe (instalação sem OSRM): `execute` devolve `skipped`. */
  readonly matrix: RoadMatrixPort | undefined
  readonly repository: OrderDraftTripStopsPort
  readonly reorder: ReorderTripStopsPort
  /** O vínculo recongela a rota depois, uma vez; o botão passa o congelador aqui. */
  readonly routeFreezer?: PlanTripRouteTollFreezer
}): OrderDraftTripStops {
  const { depot, matrix, repository } = dependencies

  async function fail(input: {
    readonly code: StopOrderErrorCode
    readonly companyId: string
    readonly excludedStopCount?: number
    readonly source: StopOrderSource
    readonly stopCount: number
    readonly tripId: string
  }): Promise<DraftStopOrderOutcome> {
    /** A ordem do despachante sobrevive à falha: só deixa de ser `manual` a que nunca foi dele. */
    const source = input.source === 'manual' ? 'manual' : 'unordered'
    await repository.recordStopOrder({
      companyId: input.companyId,
      errorCode: input.code,
      source,
      tripId: input.tripId,
    })
    dependencies.logger?.warn('trip_stop_order_unavailable', {
      errorCode: input.code,
      stopCount: input.stopCount,
      tripId: input.tripId,
    })
    return {
      errorCode: input.code,
      excludedStopCount: input.excludedStopCount ?? 0,
      status: 'unordered',
    }
  }

  return {
    async snapshotStopIds({ companyId, tripId }) {
      const state = await repository.readOrderingState({ companyId, tripId })
      return new Set(state?.stops.map((stop) => stop.id) ?? [])
    },

    async execute(input) {
      const { companyId, tripId } = input
      const skipped: DraftStopOrderOutcome = {
        errorCode: null,
        excludedStopCount: 0,
        status: 'skipped',
      }
      if (matrix === undefined) return skipped

      const state = await repository.readOrderingState({ companyId, tripId })
      if (state === null) return skipped
      const blocked = checkTripAcceptsLinkage(state.tripStatus)
      if (blocked !== null) {
        if (input.strict === true) throw new TripStateTransitionNotAllowedError(blocked)
        return skipped
      }
      if (state.stops.length < 2) return skipped

      const mode =
        input.intent === 'reorder_all'
          ? 'reorder_all'
          : resolveDraftStopOrderMode(state.stopOrderSource)
      const isNew = (stopId: string): boolean =>
        input.knownStopIds !== undefined && !input.knownStopIds.has(stopId)
      if (mode === 'insert_new' && !state.stops.some((stop) => isNew(stop.id))) return skipped

      const stopCount = state.stops.length
      const failure = { companyId, source: state.stopOrderSource, stopCount, tripId }
      if (stopCount > DRAFT_STOP_ORDER_MAX_STOPS) {
        return fail({ ...failure, code: STOP_ORDER_ERROR_CODES[2] })
      }

      const resolvedDepot = await depot.readDepot({ companyId })
      if (resolvedDepot.status !== 'resolved') {
        return fail({ ...failure, code: STOP_ORDER_ERROR_CODES[1] })
      }

      const coordinates = await repository.readStopCoordinates({
        addressKeys: [...new Set(state.stops.map((stop) => stop.addressKey))],
      })
      const points: RouteGeometryPoint[] = [resolvedDepot.origin]
      const matrixIndexByAddressKey = new Map<string, number>()
      const ordering: DraftStopForOrdering[] = []
      for (const stop of [...state.stops].sort((a, b) => a.sequence - b.sequence)) {
        let matrixIndex = matrixIndexByAddressKey.get(stop.addressKey) ?? null
        if (matrixIndex === null) {
          const coordinate = coordinates.get(stop.addressKey)
          if (coordinate !== undefined && ORDERABLE_PRECISIONS.has(coordinate.precision)) {
            points.push({ latitude: coordinate.latitude, longitude: coordinate.longitude })
            matrixIndex = points.length - 1
            matrixIndexByAddressKey.set(stop.addressKey, matrixIndex)
          }
        }
        ordering.push({
          id: stop.id,
          isNew: isNew(stop.id),
          matrixIndex,
          sequence: stop.sequence,
        })
      }
      const excludedStopCount = ordering.filter((stop) => stop.matrixIndex === null).length
      if (points.length === 1) return skipped

      const roadMatrix = await matrix.readMatrix(points)
      if (roadMatrix === null) return fail({ ...failure, code: STOP_ORDER_ERROR_CODES[0] })

      const { orderedStopIds } = orderStopsByRoad({
        costs: roadMatrix.durationsSeconds,
        mode,
        stops: ordering,
      })

      /** `manual` + parada nova continua sendo a ordem do despachante; o resto passa a ser sugestão. */
      const source: StopOrderSource = mode === 'insert_new' ? 'manual' : 'suggested'
      const currentOrder = ordering.map((stop) => stop.id)
      const unchanged = orderedStopIds.every((stopId, index) => stopId === currentOrder[index])
      if (unchanged) {
        await repository.recordStopOrder({ companyId, errorCode: null, source, tripId })
        return { errorCode: null, excludedStopCount, status: 'unchanged' }
      }

      await reorderTripStops({
        companyId,
        ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
        orderedStopIds,
        repository: dependencies.reorder,
        ...(dependencies.routeFreezer === undefined
          ? {}
          : { routeFreezer: dependencies.routeFreezer }),
        source,
        tripId,
      })
      return { errorCode: null, excludedStopCount, status: 'ordered' }
    },
  }
}
