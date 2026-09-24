/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { and, asc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm'

import {
  tripDispatchSnapshots,
  tripDocuments,
  tripStops,
  trips,
  type TripDocumentSeparationStatus,
  type TripStatus,
} from '../../database/trip.schema.js'
import type {
  DispatchTripPort,
  DispatchTripPreconditions,
  DispatchTripWriteInput,
  DispatchTripWriteResult,
} from '../application/dispatch-trip.use-case.js'
import { listUnscheduledStops } from '../../delivery-clients/infrastructure/unscheduled-stop.query.js'
import type { CancelTripPort } from '../application/cancel-trip.use-case.js'
import { buildCancelReleaseWhere } from './cancel-release.query.js'
import { resolveDispatchReadiness } from '../domain/dispatch-readiness.policy.js'
import { resolveEtaShiftMilliseconds } from '../domain/eta-anchor.policy.js'
import type { PlanTripRoutePort, TripRouteState } from '../application/plan-trip-route.use-case.js'
import type {
  ReorderTripStopsPort,
  ReorderTripStopsPreconditions,
} from '../application/reorder-trip-stops.use-case.js'
import {
  createRequestCargoLayoutForTrip,
  type RequestCargoLayoutForTrip,
} from './eager-cargo-layout-request.support.js'
import type { CargoLayoutLeaseOptions } from '../application/cargo-layout-request.types.js'
import { DEFAULT_CARGO_LAYOUT_LEASE_MS } from '../domain/cargo-layout-lease.policy.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import {
  TRIP_ACTION,
  TRIP_DOCUMENT_ACTION,
  checkTripDocumentTransition,
  checkTripTransition,
  type TripDocumentAction,
} from '../domain/trip-state.policy.js'
import {
  TripHasUnloadedDocumentsError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import { readDispatchReadinessDocuments } from './dispatch-readiness.query.js'
import {
  insertTripDocumentBatchEvents,
  timestampPatchFor,
} from './drizzle-trip-document-batch.repository.js'
import { recordTripStatusChange } from './trip-status-event.persistence.js'
import type { TripDatabase, TripQueryable, TripTransaction } from './trip-queryable.type.js'

/** Nota que pode virar `SEM ENDEREÇO`/pendência de rota: viva, mas ainda não chegou a `loaded`. */
const NOT_LOADED_STATUSES = ['pending', 'separated'] as const

/** Spec 185 (RF5): o motivo da nota deixada para trás, derivado do nome do tipo de ocorrência. */
const LEFT_BEHIND_REASON_PREFIX = 'Ocorrência: '

/**
 * Reordenar troca a `sequence` de todas as paradas da viagem numa tacada, e a unique
 * `(company_id, trip_id, sequence)` não é adiável — trocar a posição 1↔2 direto colidiria com a
 * própria linha que ainda não se moveu. Empurra tudo para um intervalo alto e sem uso primeiro,
 * depois grava os valores finais: nenhum `UPDATE` do segundo passo pode colidir com o que restou
 * do primeiro.
 */
const SEQUENCE_PARKING_OFFSET = 1_000_000

export class DrizzleTripRouteRepository
  implements PlanTripRoutePort, DispatchTripPort, CancelTripPort, ReorderTripStopsPort
{
  private readonly requestCargoLayoutForTrip: RequestCargoLayoutForTrip

  public constructor(
    private readonly database: TripDatabase,
    options: CargoLayoutLeaseOptions = { cargoLayoutLeaseMs: DEFAULT_CARGO_LAYOUT_LEASE_MS },
  ) {
    this.requestCargoLayoutForTrip = createRequestCargoLayoutForTrip(options)
  }

  public async readRouteState(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripRouteState | null> {
    return readRouteState(this.database, input)
  }

  public async markRoutePlanned(input: {
    readonly actorUserId: string
    readonly channel: TripFieldChannel
    readonly companyId: string
    /** Defeito 29 (ADR-0068 "Consequências"): reconferido aqui, com o status recém-travado. */
    readonly hasRoute: boolean
    readonly onBehalfOfDriverId: string | null
    readonly tripId: string
  }): Promise<TripStatus> {
    return this.database.transaction(async (transaction) => {
      const [tripRow] = await transaction
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .for('no key update')
        .limit(1)
      if (tripRow === undefined) return 'route_planned'

      /**
       * ADR-0068 "Consequências", defeito 29 (spec 158 T13): `planTripRoute` decide pela máquina de
       * estados **fora** da transação; reconferir aqui, com o status que o lock acabou de travar,
       * é o que impede uma corrida de gravar `route_planned` sobre uma viagem já cancelada/despachada.
       */
      const transition = checkTripTransition({
        action: TRIP_ACTION.planRoute,
        hasRoute: input.hasRoute,
        tripStatus: tripRow.status,
      })
      if (transition.outcome === 'blocked') {
        throw new TripStateTransitionNotAllowedError(transition.reason)
      }
      if (transition.outcome === 'unchanged') return tripRow.status

      const [updated] = await transaction
        .update(trips)
        .set({ status: transition.nextStatus, updatedAt: sql`now()` })
        .where(
          and(
            eq(trips.companyId, input.companyId),
            eq(trips.id, input.tripId),
            eq(trips.status, tripRow.status),
          ),
        )
        .returning({ status: trips.status })
      if (updated === undefined) return tripRow.status

      await recordTripStatusChange(transaction, {
        actorUserId: input.actorUserId,
        channel: input.channel,
        companyId: input.companyId,
        fromStatus: tripRow.status,
        onBehalfOfDriverId: input.onBehalfOfDriverId,
        toStatus: updated.status,
        tripId: input.tripId,
      })

      return updated.status
    })
  }

  public async readPreconditions(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<DispatchTripPreconditions | null> {
    const route = await readRouteState(this.database, input)
    if (route === null) return null

    const readiness = resolveDispatchReadiness({
      documents: await readDispatchReadinessDocuments(this.database, input),
    })

    return {
      hasRoute: route.hasRoute,
      isCargoClosed: readiness.isCargoClosed,
      leftBehind: readiness.leftBehind,
      toLoad: readiness.toLoad,
      tripStatus: route.tripStatus,
      unloadedDocumentIds: readiness.toLoad.map((document) => document.tripDocumentId),
      unscheduledStopIds: await listUnscheduledStops(this.database, input),
    }
  }

  public async dispatch(input: DispatchTripWriteInput): Promise<DispatchTripWriteResult> {
    try {
      return await this.database.transaction((transaction) => dispatch(transaction, input))
    } catch (error) {
      // Corrida perdida para outro despacho: a transação desfez o que esta chamada escreveu nas
      // notas, e a resposta é o `unchanged` da máquina de estados — nunca erro.
      if (error instanceof DispatchAlreadySettledSignal) return { tripStatus: error.tripStatus }
      throw error
    }
  }

  public async readTripStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null> {
    const [record] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    return record?.status ?? null
  }

  /**
   * Spec 102: cancelar **devolve a carga**. Até esta spec, este método só trocava `trips.status`, e
   * quem decide se uma nota está disponível olha `released_at` — nunca o status da viagem. Cancelar
   * prendia a carga para sempre, e nada na tela dizia por quê.
   *
   * ⚠️ **Na mesma transação, e nesta ordem.** Uma falha entre as duas escritas deixaria a viagem
   * cancelada com a carga presa — exatamente o defeito que esta spec corrige.
   *
   * ⚠️ **`stop_id` NÃO é zerado aqui**, ao contrário de `releaseTripDocument`. Lá a nota sai de uma
   * viagem que continua viva, e a parada precisa ser reconciliada (apagada se esvaziou); aqui a
   * viagem inteira morre, ninguém vai reordenar parada dela, e manter a referência preserva o
   * roteiro como ele foi planejado. Zerar produziria o pior dos dois: paradas vazias na tela e
   * notas todas no balde "Sem parada".
   */
  /**
   * Spec 107 D3: grava o ETA que o planejamento calculou e **carimba quando**, na mesma transação.
   *
   * ⚠️ O valor sem o carimbo é uma hora sem idade. O ETA congela no instante do planejamento e
   * envelhece — às 14h ele ainda diz o que achava às 7h —, e é `estimated_arrival_frozen_at` que
   * permite à tela dizer isso em vez de mostrar uma previsão que parece de agora.
   */
  public async writeEstimatedArrivals(input: {
    readonly arrivals: readonly { readonly estimatedArrivalAt: string; readonly stopId: string }[]
    readonly companyId: string
    /**
     * Spec 109 D2: a saída suposta pelo planejamento — a âncora do ETA. `null` é sugestão anterior a
     * esta spec: as horas ficam, e o despacho não as desloca por âncora inventada.
     */
    readonly plannedDepartureAt: string | null
    readonly tripId: string
  }): Promise<void> {
    if (input.arrivals.length === 0) return

    await this.database.transaction(async (transaction) => {
      for (const arrival of input.arrivals) {
        await transaction
          .update(tripStops)
          .set({ estimatedArrivalAt: new Date(arrival.estimatedArrivalAt) })
          .where(
            and(
              eq(tripStops.companyId, input.companyId),
              eq(tripStops.tripId, input.tripId),
              eq(tripStops.id, arrival.stopId),
            ),
          )
      }

      await transaction
        .update(trips)
        .set({
          estimatedArrivalFrozenAt: sql`now()`,
          etaDepartureAt:
            input.plannedDepartureAt === null ? null : new Date(input.plannedDepartureAt),
        })
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    })
  }

  public async markCancelled(input: {
    readonly actorUserId: string
    readonly channel: TripFieldChannel
    readonly companyId: string
    readonly onBehalfOfDriverId: string | null
    readonly tripId: string
  }): Promise<TripStatus> {
    return this.database.transaction(async (transaction) => {
      /**
       * ⚠️ A linha **permanece**, com `released_at` — é a única prova de que aquela nota chegou a
       * ser carregada nesta viagem, e é o que atende "deixe no histórico da nota". Apagá-la
       * destruiria o histórico enquanto todo teste de disponibilidade continuaria passando.
       */
      await transaction
        .update(tripDocuments)
        .set({ releasedAt: sql`now()`, updatedAt: sql`now()` })
        .where(buildCancelReleaseWhere(input))

      const [tripRow] = await transaction
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .for('no key update')
        .limit(1)
      if (tripRow === undefined) return 'cancelled'

      /**
       * ADR-0068 "Consequências", defeito 29 (spec 158 T13): `cancelTrip` decide pela máquina de
       * estados **fora** da transação; reconferir aqui, com o status recém-travado, é o que
       * impede uma corrida de gravar `cancelled` sobre uma viagem que já concluiu.
       */
      const transition = checkTripTransition({
        action: TRIP_ACTION.cancel,
        hasRoute: false,
        tripStatus: tripRow.status,
      })
      if (transition.outcome === 'blocked') {
        throw new TripStateTransitionNotAllowedError(transition.reason)
      }
      if (transition.outcome === 'unchanged') return tripRow.status

      const [updated] = await transaction
        .update(trips)
        .set({ status: transition.nextStatus, updatedAt: sql`now()` })
        .where(
          and(
            eq(trips.companyId, input.companyId),
            eq(trips.id, input.tripId),
            eq(trips.status, tripRow.status),
          ),
        )
        .returning({ status: trips.status })
      if (updated === undefined) return tripRow.status

      await recordTripStatusChange(transaction, {
        actorUserId: input.actorUserId,
        channel: input.channel,
        companyId: input.companyId,
        fromStatus: tripRow.status,
        onBehalfOfDriverId: input.onBehalfOfDriverId,
        toStatus: updated.status,
        tripId: input.tripId,
      })

      return updated.status
    })
  }

  public async readStopOrderPreconditions(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<ReorderTripStopsPreconditions | null> {
    const [tripRecord] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (tripRecord === undefined) return null

    const stopRows = await this.database
      .select({ id: tripStops.id })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

    return { stopIds: stopRows.map((row) => row.id), tripStatus: tripRecord.status }
  }

  public async reorderStops(input: {
    readonly companyId: string
    readonly orderedStopIds: readonly string[]
    readonly tripId: string
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await writeStopOrder(transaction, input)
      await this.requestCargoLayoutForTrip(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
      })
    })
  }
}

/**
 * Spec 164 T14b (RF18): a mesma escrita de `PATCH /trips/:id/stops/order`, extraída para ser
 * chamada **dentro** de uma transação já aberta (`redelivery-application`, que trava `trips`
 * primeiro) — nunca uma segunda escrita de `trip_stops` reinventada. `reorderStops` acima e a
 * aplicação da proposta de reentrega chamam esta mesma função.
 */
export async function writeStopOrder(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly orderedStopIds: readonly string[]
    readonly tripId: string
  },
): Promise<void> {
  await transaction
    .update(tripStops)
    .set({ sequence: sql`${tripStops.sequence} + ${SEQUENCE_PARKING_OFFSET}` })
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

  for (const [index, stopId] of input.orderedStopIds.entries()) {
    await transaction
      .update(tripStops)
      .set({ sequence: BigInt(index + 1), updatedAt: sql`now()` })
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.id, stopId)))
  }
}

async function readRouteState(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripRouteState | null> {
  const [tripRecord] = await queryable
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (tripRecord === undefined) return null

  const [stopCount] = await queryable
    .select({ count: sql<number>`count(*)::int` })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))

  const [unassignedLiveDocument] = await queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        isNull(tripDocuments.releasedAt),
        isNull(tripDocuments.stopId),
        ne(tripDocuments.separationStatus, 'returned'),
      ),
    )
    .limit(1)

  const hasAnyStop = (stopCount?.count ?? 0) > 0
  return {
    hasRoute: hasAnyStop && unassignedLiveDocument === undefined,
    tripStatus: tripRecord.status,
  }
}

/**
 * Spec 185 (D3): a reconferência sob o lock da viagem devolveu `unchanged` — outro despacho venceu
 * a corrida. Lançar desfaz a transação inteira, inclusive as notas que esta chamada já tinha
 * carregado ou liberado; `DrizzleTripRouteRepository.dispatch` converte de volta em resultado.
 */
class DispatchAlreadySettledSignal extends Error {
  public constructor(public readonly tripStatus: TripStatus) {
    super('TRIP_DISPATCH_ALREADY_SETTLED')
  }
}

/**
 * ⚠️ **Ordem das escritas (spec 185 D3, ADR-0068 §2 "notas → viagem")**: primeiro as notas
 * (carregar o que `loadRemaining` pediu, liberar o forçado e o deixado para trás), depois o lock
 * da viagem e a reconferência de `checkTripTransition`, e **só então** snapshot, ETA e o UPDATE por
 * compare-and-set. Antes, o snapshot era inserido antes do lock: o segundo despacho de uma corrida
 * batia na unique `(company_id, trip_id)` do snapshot — 23505, um 500 onde a regra é `unchanged`.
 * Reconferência que não aplica lança: nenhuma nota fica alterada por um despacho que não houve.
 */
async function dispatch(
  transaction: TripTransaction,
  input: DispatchTripWriteInput,
): Promise<DispatchTripWriteResult> {
  if (input.documentsToLoad.length > 0) {
    await loadRemainingDocuments(transaction, input)
  }

  const releasedDocumentIds = [
    ...input.unloadedDocumentIds,
    ...input.leftBehind.map((document) => document.tripDocumentId),
  ]
  if (releasedDocumentIds.length > 0) {
    await releaseUnloadedDocuments(transaction, {
      companyId: input.companyId,
      tripId: input.tripId,
      unloadedDocumentIds: releasedDocumentIds,
    })
  }

  const [tripRow] = await transaction
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .for('no key update')
    .limit(1)
  if (tripRow === undefined) return { tripStatus: 'dispatched' }

  /**
   * ADR-0068 "Consequências", defeito 29 (spec 158 T13): `dispatchTrip` decide pela máquina de
   * estados **fora** da transação; reconferir aqui, com o status recém-travado, é o que impede
   * uma corrida de gravar `dispatched` sobre uma viagem já cancelada/concluída.
   */
  const transition = checkTripTransition({
    action: TRIP_ACTION.dispatch,
    hasRoute: input.hasRoute,
    tripStatus: tripRow.status,
  })
  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') throw new DispatchAlreadySettledSignal(tripRow.status)

  await insertDispatchSnapshot(transaction, input)

  /**
   * Spec 109 D2: **o roteiro foi planejado para uma hora de saída, e o caminhão sai noutra.** Aqui,
   * no clique de quem sai, o ETA de cada parada anda o mesmo tanto que a saída atrasou.
   *
   * ⚠️ Deslocar, não recalcular: a ordem foi conferida no galpão e o caminhão foi carregado nela.
   * ⚠️ Na mesma transação do congelamento do roteiro — o snapshot e as horas descrevem a mesma saída.
   */
  await shiftEstimatedArrivals(transaction, input)

  const [updated] = await transaction
    .update(trips)
    .set({ status: transition.nextStatus, updatedAt: sql`now()` })
    .where(
      and(
        eq(trips.companyId, input.companyId),
        eq(trips.id, input.tripId),
        eq(trips.status, tripRow.status),
      ),
    )
    .returning({ status: trips.status })
  if (updated === undefined) throw new DispatchAlreadySettledSignal(tripRow.status)

  await recordTripStatusChange(transaction, {
    actorUserId: input.actorUserId,
    channel: input.channel,
    companyId: input.companyId,
    fromStatus: tripRow.status,
    onBehalfOfDriverId: input.onBehalfOfDriverId ?? null,
    toStatus: updated.status,
    tripId: input.tripId,
  })

  return { tripStatus: updated.status }
}

/**
 * Spec 185 (RF5, ADR-0074 §4): o motivo da nota deixada para trás mora **no snapshot**, ao lado do
 * roteiro congelado — `forced`/`force_reason` não servem: a CHECK
 * `trip_dispatch_snapshots_force_reason_check` casa os dois, e esse despacho não é forçado (a
 * assinatura é a do cadastro do tipo). Nem o evento de nota serve: liberar não muda
 * `separation_status`, e `trip_document_events` recusa evento sem transição.
 */
async function insertDispatchSnapshot(
  transaction: TripTransaction,
  input: DispatchTripWriteInput,
): Promise<void> {
  const route = await buildRouteSnapshot(transaction, input)
  const snapshot =
    input.leftBehind.length === 0
      ? route
      : {
          ...route,
          leftBehind: input.leftBehind.map((document) => ({
            documentId: document.tripDocumentId,
            reason: `${LEFT_BEHIND_REASON_PREFIX}${document.occurrenceTypeName}`,
          })),
        }
  const snapshotSha256 = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')

  await transaction.insert(tripDispatchSnapshots).values({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    forceReason: input.forceReason,
    forced: input.forced,
    snapshot,
    snapshotSha256,
    tripId: input.tripId,
  })
}

/**
 * Spec 185 (RF4, D3): `loadRemaining` leva cada nota de `toLoad` a `loaded` dentro da transação do
 * despacho — `pending → separated → loaded`, a aresta decidida por `checkTripDocumentTransition`,
 * com o evento de nota do mesmo escritor do lote. Cada UPDATE é guardado pelo status de origem: o
 * que outra escrita já moveu não é reescrito. Os UPDATEs travam as notas **antes** do lock da
 * viagem (ADR-0068 §2).
 *
 * O status da viagem lido aqui é sem lock, só para a política da nota; quem protege a escrita é a
 * reconferência sob `FOR NO KEY UPDATE` logo depois — viagem cancelada ou despachada no meio
 * desfaz tudo.
 */
async function loadRemainingDocuments(
  transaction: TripTransaction,
  input: DispatchTripWriteInput,
): Promise<void> {
  const [tripRow] = await transaction
    .select({ status: trips.status })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (tripRow === undefined) return

  const documentIds = input.documentsToLoad.map((document) => document.tripDocumentId)
  await advanceDocuments(transaction, input, {
    action: TRIP_DOCUMENT_ACTION.separate,
    documentIds: input.documentsToLoad
      .filter((document) => document.separationStatus === 'pending')
      .map((document) => document.tripDocumentId),
    fromStatus: 'pending',
    tripStatus: tripRow.status,
  })
  await advanceDocuments(transaction, input, {
    action: TRIP_DOCUMENT_ACTION.load,
    documentIds,
    fromStatus: 'separated',
    tripStatus: tripRow.status,
  })

  // Nota que uma escrita concorrente tirou do caminho (liberada, por exemplo) e ainda não chegou a
  // `loaded`: despachar deixaria carga para trás sem ninguém ter pedido — recusa e desfaz.
  const stillUnloaded = await transaction
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        inArray(tripDocuments.id, documentIds),
        isNull(tripDocuments.releasedAt),
        inArray(tripDocuments.separationStatus, [...NOT_LOADED_STATUSES]),
      ),
    )
  if (stillUnloaded.length > 0) {
    throw new TripHasUnloadedDocumentsError(stillUnloaded.map((row) => row.id))
  }
}

async function advanceDocuments(
  transaction: TripTransaction,
  input: DispatchTripWriteInput,
  step: {
    readonly action: TripDocumentAction
    readonly documentIds: readonly string[]
    readonly fromStatus: TripDocumentSeparationStatus
    readonly tripStatus: TripStatus
  },
): Promise<void> {
  if (step.documentIds.length === 0) return

  const transition = checkTripDocumentTransition({
    action: step.action,
    documentStatus: step.fromStatus,
    tripStatus: step.tripStatus,
  })
  if (transition.outcome === 'blocked') {
    throw new TripStateTransitionNotAllowedError(transition.reason)
  }
  if (transition.outcome === 'unchanged') return

  const updated = await transaction
    .update(tripDocuments)
    .set({
      separationStatus: transition.nextStatus,
      updatedAt: sql`now()`,
      ...timestampPatchFor(transition.nextStatus),
    })
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        inArray(tripDocuments.id, [...step.documentIds]),
        eq(tripDocuments.separationStatus, step.fromStatus),
        isNull(tripDocuments.releasedAt),
      ),
    )
    .returning({ id: tripDocuments.id })
  if (updated.length === 0) return

  await insertTripDocumentBatchEvents(
    transaction,
    {
      actorUserId: input.actorUserId,
      channel: input.channel,
      companyId: input.companyId,
      items: updated.map((row) => ({
        documentId: row.id,
        fromStatus: step.fromStatus,
        toStatus: transition.nextStatus,
      })),
      note: null,
      onBehalfOfDriverId: input.onBehalfOfDriverId,
      returnReason: null,
      tripId: input.tripId,
    },
    updated.map((row) => row.id),
  )
}

/**
 * ⚠️ **A âncora é reescrita com a saída real**, e é isso que torna o deslocamento idempotente:
 * despachar de novo passa a ter diferença zero, sem depender de o chamador lembrar disso.
 *
 * ⚠️ Viagem sem âncora — planejada antes desta spec, ou montada à mão — não desloca nada: deslocar
 * por uma âncora inventada erraria mais que não deslocar (`eta-anchor.policy.ts`).
 */
async function shiftEstimatedArrivals(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<void> {
  const [trip] = await transaction
    .select({ etaDepartureAt: trips.etaDepartureAt })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)

  const departedAt = new Date()
  const shiftMilliseconds = resolveEtaShiftMilliseconds({
    plannedAt: trip?.etaDepartureAt ?? null,
    reportedAt: departedAt,
  })
  if (shiftMilliseconds === 0) return

  await transaction
    .update(tripStops)
    .set({
      estimatedArrivalAt: sql`${tripStops.estimatedArrivalAt} + make_interval(secs => ${shiftMilliseconds / 1_000})`,
    })
    .where(
      and(
        eq(tripStops.companyId, input.companyId),
        eq(tripStops.tripId, input.tripId),
        isNotNull(tripStops.estimatedArrivalAt),
      ),
    )

  await transaction
    .update(trips)
    .set({ estimatedArrivalFrozenAt: departedAt, etaDepartureAt: departedAt })
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
}

async function releaseUnloadedDocuments(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly tripId: string
    readonly unloadedDocumentIds: readonly string[]
  },
): Promise<void> {
  // A parada de cada nota tem de ser lida **antes** do UPDATE: `RETURNING` devolve o estado novo
  // da linha, e a T010 acabou de descobrir isso do jeito caro — nulava `stopId` e depois tentava
  // ler `stopId` do próprio `RETURNING`, sempre vazio.
  const beforeRelease = await transaction
    .select({ stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        inArray(tripDocuments.id, [...input.unloadedDocumentIds]),
      ),
    )
  const affectedStopIds = [
    ...new Set(
      beforeRelease.map((row) => row.stopId).filter((stopId): stopId is string => stopId !== null),
    ),
  ]

  // `stopId: null` sai aqui — antes do DELETE da parada, nunca depois. A FK é `restrict`
  // (schema.ts), então a nota tem de soltar a parada por conta própria; esperar o banco fazer
  // isso sozinho foi o bug original (uma FK composta com `set null` zeraria `company_id` junto,
  // e ele é `not null`).
  // Guarda de corrida (spec 185): só libera a nota ainda viva e ainda não carregada — a que foi
  // carregada depois da leitura da precondição vai no caminhão.
  await transaction
    .update(tripDocuments)
    .set({ releasedAt: sql`now()`, stopId: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        inArray(tripDocuments.id, [...input.unloadedDocumentIds]),
        isNull(tripDocuments.releasedAt),
        inArray(tripDocuments.separationStatus, [...NOT_LOADED_STATUSES]),
      ),
    )

  if (affectedStopIds.length === 0) return

  // ADR-0043 §3: a parada é derivada — some quando a última nota viva sai dela. Uma consulta para
  // todas as paradas afetadas, um DELETE para as que esvaziaram.
  const stillOccupied = await transaction
    .select({ stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.stopId, affectedStopIds),
        isNull(tripDocuments.releasedAt),
      ),
    )
  const occupiedStopIds = new Set(
    stillOccupied.map((row) => row.stopId).filter((stopId): stopId is string => stopId !== null),
  )
  const emptiedStopIds = affectedStopIds.filter((stopId) => !occupiedStopIds.has(stopId))
  if (emptiedStopIds.length === 0) return

  await transaction
    .delete(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), inArray(tripStops.id, emptiedStopIds)))
}

type RouteSnapshotStop = {
  readonly documentIds: readonly string[]
  readonly id: string
  readonly label: string
  readonly sequence: number
}

type RouteSnapshot = { readonly stops: readonly RouteSnapshotStop[] }

async function buildRouteSnapshot(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<RouteSnapshot> {
  const stopRows = await transaction
    .select({ id: tripStops.id, label: tripStops.label, sequence: tripStops.sequence })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
    .orderBy(asc(tripStops.sequence))

  const documentRows = await transaction
    .select({ id: tripDocuments.id, stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.tripId, input.tripId),
        isNull(tripDocuments.releasedAt),
        notInArray(tripDocuments.separationStatus, ['returned']),
      ),
    )

  const documentIdsByStop = new Map<string, string[]>()
  for (const row of documentRows) {
    if (row.stopId === null) continue
    const list = documentIdsByStop.get(row.stopId) ?? []
    list.push(row.id)
    documentIdsByStop.set(row.stopId, list)
  }

  return {
    stops: stopRows.map((stop) => ({
      documentIds: documentIdsByStop.get(stop.id) ?? [],
      id: stop.id,
      label: stop.label,
      sequence: Number(stop.sequence),
    })),
  }
}
