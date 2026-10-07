/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, desc, eq, inArray, ne, notInArray, isNull, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  auditLogs,
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
} from '../../database/database.schema.js'
import { geocodedAddresses } from '../../database/geocoding.schema.js'
import {
  resolveTripDocumentFreight,
  type DocumentFreightRule,
} from '../domain/trip-document-freight.policy.js'
import { normalizeFreightRuleFilters } from '../../freight-rules/domain/freight-rule-filters.policy.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import {
  TRIP_TERMINAL_STATUSES,
  tripDocuments,
  tripDrivers,
  tripStops,
  trips,
} from '../../database/trip.schema.js'
import {
  violatedCheckConstraint,
  violatedForeignKeyConstraint,
  violatedUniqueConstraint,
} from '../../database/postgres-error.support.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type {
  CreateTripRecord,
  TripDetail,
  TripDocument,
  TripDocumentDetail,
  TripFilters,
  TripPage,
  TripRepositoryPort,
  TripTrailerView,
} from '../application/trip.port.js'
import {
  TripDocumentAlreadyLinkedError,
  TripDocumentNotFoundError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
  TripTrailerInUseError,
  TripTrailerNotVehicleItselfError,
} from '../domain/trip.error.js'
import type {
  TripDriverCandidate,
  TripDriverLine,
  TripVehicleCandidate,
} from '../domain/trip.policy.js'
import {
  TRIP_ACTION,
  TRIP_DISPATCHED_STATUSES,
  TRIP_STATUSES_BEFORE_DISPATCH,
  checkTripAcceptsLinkage,
  checkTripTransition,
  resolveCrewStatus,
} from '../domain/trip-state.policy.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'
import { TRIP_CLOSE_SETTLED_SEPARATION_STATUSES } from '../domain/trip-close.policy.js'
import type { LinkTripDocumentsBatchResult } from '../application/link-trip-documents-batch.use-case.js'
import {
  reconcileStopOnLink,
  reconcileStopOnUnlink,
} from '../application/reconcile-trip-stops.use-case.js'
import { createTripStopReconciliationPort } from './drizzle-trip-stop-reconciliation.support.js'
import { closePendingReviewsOnLink } from './trip-document-review-relink.support.js'
import {
  resolveNfeDestinationAddress,
  resolveNfeDocumentId,
  listStopAddresses,
} from './nfe-destination-address.support.js'
import {
  mapTrip,
  mapTripDocument,
  mapTripDocumentDetail,
  mapTripDriver,
  mapTripStop,
} from './trip.mapper.js'
import {
  buildTripDocumentListFilters,
  buildTripListFilters,
  cteAuthorizedExpression,
} from './trip.query.js'
import { listDeliveryContacts } from './delivery-proof-read.support.js'
import { loadTripDocumentIdsWithOpenOccurrenceCase } from './occurrence-case-marker.query.js'
import { loadProofPendingDocumentIds } from './proof-pending.query.js'
import { loadTripDocumentVolumeCounts } from './trip-document-volume.query.js'
import { readDispatchReadinessDocuments } from './dispatch-readiness.query.js'
import { resolveDispatchReadiness } from '../domain/dispatch-readiness.policy.js'
import { timelineActorMembership, timelineActorProfile } from './trip-timeline-condition.helper.js'
import {
  createRequestCargoLayoutForTrip,
  type RequestCargoLayoutForTrip,
} from './eager-cargo-layout-request.support.js'
import type { CargoLayoutLeaseOptions } from '../application/cargo-layout-request.types.js'
import { DEFAULT_CARGO_LAYOUT_LEASE_MS } from '../domain/cargo-layout-lease.policy.js'
import { loadTripCargoWeight } from './trip-cargo-weight.support.js'
import { withPayloadCeiling } from '../domain/trip-cargo-weight.policy.js'
import { resolveCargoSecuring } from '../domain/cargo-securing.policy.js'
import { CARGO_DELIVERY_REACH_M } from '../domain/cargo-delivery-reach.constant.js'
import { loadTripOccupancy } from './trip-occupancy.support.js'
import { buildLayoutStop } from './trip-cargo-layout-input.support.js'
import { readTripCargoLayout } from './stored-cargo-layout-read.support.js'
import type { BuildCargoLayoutInputParams } from '../domain/cargo-layout-hash.types.js'
import { buildPendingMeasurementBoxKey } from '../../nfe-documents/domain/pending-measurement-box.policy.js'
import type { PendingMeasurementBoxLookupPort } from '../application/pending-measurement-box-lookup.port.js'
import type { CargoLayoutPendingMeasurement } from '../application/read-cargo-layout.types.js'
import type { PendingMeasurement } from '@adatechnology/cargo-placement'
import type { PhysicalDestinationOrigin } from '../../nfe-documents/domain/physical-destination.policy.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import { recordTripCreation, recordTripStatusChange } from './trip-status-event.persistence.js'
import { applyTripCrewTransfer } from './trip-crew-transfer.persistence.js'
import type {
  TransferTripCrewParams,
  TransferTripCrewResult,
} from '../application/trip-crew-transfer.types.js'
import { clearPlannedRoute } from './trip-planned-route-clear.support.js'
import type { TripDatabase, TripQueryable, TripTransaction } from './trip-queryable.type.js'

/** Spec 156 T8c: encerrar não é em nome de ninguém — o alvo da auditoria é a própria viagem. */
const TRIP_CLOSE_AUDIT_ACTION = 'office.trip.close'
const TRIP_CLOSE_AUDIT_ENTITY_TYPE = 'trip'

const LIVE_DOCUMENT_CONSTRAINTS = new Set([
  'trip_documents_live_nfe_document_unique',
  'trip_documents_live_freight_calculation_unique',
])

/** Nota/frete de UUID válido mas inexistente nesta empresa — sem tradução vira 500 genérico. */
const MISSING_REFERENCE_CONSTRAINTS = new Set([
  'trip_documents_company_nfe_document_fk',
  'trip_documents_company_freight_calculation_fk',
])

const noPendingMeasurementBoxLookup: PendingMeasurementBoxLookupPort = {
  async findBoxIdsForPendingMeasurements() {
    return new Map()
  },
}

const TRAILER_OPEN_CONSTRAINT = 'trips_company_trailer_open_unique'

/** T18 (revisão): espelha o CHECK `trips_trailer_not_vehicle` (`trip.schema.ts`). */
const TRAILER_NOT_VEHICLE_CONSTRAINT = 'trips_trailer_not_vehicle'

export class DrizzleTripRepository implements TripRepositoryPort {
  private readonly requestCargoLayoutForTrip: RequestCargoLayoutForTrip
  private readonly cargoLayoutLeaseMs: number
  private readonly packageBoxLookup: PendingMeasurementBoxLookupPort

  public constructor(
    private readonly database: TripDatabase,
    options: CargoLayoutLeaseOptions = { cargoLayoutLeaseMs: DEFAULT_CARGO_LAYOUT_LEASE_MS },
    dependencies: { readonly packageBoxLookup?: PendingMeasurementBoxLookupPort } = {},
  ) {
    this.requestCargoLayoutForTrip = createRequestCargoLayoutForTrip(options)
    this.cargoLayoutLeaseMs = options.cargoLayoutLeaseMs
    this.packageBoxLookup = dependencies.packageBoxLookup ?? noPendingMeasurementBoxLookup
  }

  public async close(input: {
    readonly actorUserId: string
    readonly channel: TripFieldChannel
    readonly closeReason: string | null
    readonly companyId: string
    readonly correlationId: string
    readonly ipAddress: string
    readonly onBehalfOfDriverId: string | null
    readonly tripId: string
  }): Promise<TripDetail | null> {
    return this.database.transaction(async (transaction) => {
      const [tripRow] = await transaction
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .for('no key update')
        .limit(1)
      if (tripRow === undefined) return null

      /**
       * ADR-0068 "Consequências", defeito 29 (spec 158 T13): `tripRow.status` acabou de sair do
       * `SELECT … FOR NO KEY UPDATE` — é o único valor confiável, porque o portão do caso de uso
       * (`checkTripTransition` em `trip.use-case.ts`) leu o status **fora** da transação. Uma
       * corrida que cancele a viagem entre as duas leituras só é pega aqui, com o mesmo motivo que
       * a máquina de estados já usa — nunca duplicado à mão.
       */
      const transition = checkTripTransition({
        action: TRIP_ACTION.close,
        hasRoute: false,
        tripStatus: tripRow.status,
      })
      if (transition.outcome === 'blocked') {
        throw new TripStateTransitionNotAllowedError(transition.reason)
      }
      if (transition.outcome === 'unchanged') {
        return readTripDetail(transaction, {
          companyId: input.companyId,
          tripId: input.tripId,
          cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
          packageBoxLookup: this.packageBoxLookup,
        })
      }

      const openDocuments = await transaction
        .select({ id: tripDocuments.id })
        .from(tripDocuments)
        .where(
          and(
            eq(tripDocuments.companyId, input.companyId),
            eq(tripDocuments.tripId, input.tripId),
            isNull(tripDocuments.releasedAt),
            notInArray(tripDocuments.separationStatus, [...TRIP_CLOSE_SETTLED_SEPARATION_STATUSES]),
          ),
        )

      const [closed] = await transaction
        .update(trips)
        .set({
          closeReason: input.closeReason,
          closedAt: sql`now()`,
          closedByUserId: input.actorUserId,
          status: transition.nextStatus,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(trips.companyId, input.companyId),
            eq(trips.id, input.tripId),
            eq(trips.status, tripRow.status),
          ),
        )
        .returning({ id: trips.id })
      /**
       * Perder o compare-and-set não é "viagem não encontrada" — ela existe, e alguém mudou o
       * status debaixo do lock. Devolver `null` aqui traduziria a corrida em 404 (revisão da T13);
       * o motivo do conflito vem da própria máquina de estados, lida sobre o status novo.
       */
      if (closed === undefined) {
        const [currentRow] = await transaction
          .select({ status: trips.status })
          .from(trips)
          .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
          .limit(1)
        if (currentRow === undefined) return null
        const current = checkTripTransition({
          action: TRIP_ACTION.close,
          hasRoute: false,
          tripStatus: currentRow.status,
        })
        if (current.outcome === 'blocked') {
          throw new TripStateTransitionNotAllowedError(current.reason)
        }
        return readTripDetail(transaction, {
          cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
          packageBoxLookup: this.packageBoxLookup,
          companyId: input.companyId,
          tripId: input.tripId,
        })
      }

      await recordTripStatusChange(transaction, {
        actorUserId: input.actorUserId,
        channel: input.channel,
        companyId: input.companyId,
        fromStatus: tripRow.status,
        onBehalfOfDriverId: input.onBehalfOfDriverId,
        toStatus: 'completed',
        tripId: input.tripId,
      })

      /**
       * Spec 156 T8c, `security.md` §10: ação sensível — encerra entrega que outra pessoa fez. O
       * motivo nunca entra em `metadata` (é dado de negócio); só a contagem e os ids opacos das
       * notas que ficaram sem baixa.
       */
      await transaction.insert(auditLogs).values({
        action: TRIP_CLOSE_AUDIT_ACTION,
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: input.tripId,
        entityType: TRIP_CLOSE_AUDIT_ENTITY_TYPE,
        metadata: {
          documentIds: openDocuments.map((document) => document.id),
          ipAddress: input.ipAddress,
          openDocumentCount: openDocuments.length,
        },
        permission: TRIP_REPORT_ON_BEHALF_PERMISSION,
        targetId: input.tripId,
        targetType: TRIP_CLOSE_AUDIT_ENTITY_TYPE,
      })

      return readTripDetail(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
        cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
        packageBoxLookup: this.packageBoxLookup,
      })
    })
  }

  /**
   * Spec 216: `awaiting_crew → draft` (primeira definição) ou troca em `draft` (mesmo status).
   * Reconfere `checkTripTransition` sob o lock — o status que o caso de uso leu é anterior à
   * transação (ADR-0068, mesmo motivo de `close`).
   */
  public async updateCrew(input: {
    readonly actorUserId: string
    readonly channel: TripFieldChannel
    readonly companyId: string
    readonly crew: readonly TripDriverLine[]
    readonly tripId: string
    readonly vehicleId: string | null
  }): Promise<TripDetail | null> {
    return this.database.transaction(async (transaction) => {
      const [tripRow] = await transaction
        .select({
          plannedRouteFrozenAt: trips.plannedRouteFrozenAt,
          status: trips.status,
          vehicleId: trips.vehicleId,
        })
        .from(trips)
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .for('no key update')
        .limit(1)
      if (tripRow === undefined) return null

      /**
       * Spec 217 D1/D3-ter: sob o lock, o par resolvido decide o status, e a comparação do veículo
       * pedido com o **gravado** decide se o roteiro sobrevive. Ler o veículo aqui e não no caso de
       * uso é o que torna a decisão correta sob concorrência: a checagem prévia é UX, esta é a que
       * grava.
       */
      const vehicleChanged = input.vehicleId !== tripRow.vehicleId
      const transition = checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        crew: { hasDriver: input.crew.length > 0, hasVehicle: input.vehicleId !== null },
        hasRoute: tripRow.plannedRouteFrozenAt !== null,
        tripStatus: tripRow.status,
        vehicleChanged,
      })
      if (transition.outcome === 'blocked') {
        throw new TripStateTransitionNotAllowedError(transition.reason)
      }

      await transaction
        .delete(tripDrivers)
        .where(
          and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)),
        )
      if (input.crew.length > 0) {
        await transaction.insert(tripDrivers).values(
          input.crew.map((driver) => ({
            companyId: input.companyId,
            driverId: driver.driverId,
            driverName: driver.driverName,
            driverTaxId: driver.driverTaxId,
            position: BigInt(driver.position),
            role: driver.role,
            tripId: input.tripId,
          })),
        )
      }

      await transaction
        .update(trips)
        .set({
          status: transition.outcome === 'applied' ? transition.nextStatus : tripRow.status,
          updatedAt: sql`now()`,
          vehicleId: input.vehicleId,
        })
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))

      if (transition.outcome === 'applied') {
        await recordTripStatusChange(transaction, {
          actorUserId: input.actorUserId,
          channel: input.channel,
          companyId: input.companyId,
          fromStatus: tripRow.status,
          onBehalfOfDriverId: null,
          toStatus: transition.nextStatus,
          tripId: input.tripId,
        })
      }

      /**
       * Spec 217 D3: **a rota morre inteira, na mesma escrita da troca.** Só quando o veículo mudou de
       * verdade — o traçado e o pedágio foram congelados a partir dos eixos e da classe do caminhão
       * antigo, e o operador replaneja pelo caminho da 178. Trocar só o motorista não mexe em nada
       * disso (097 D1/D3/D4), e trocar pelo mesmo veículo é idempotente.
       *
       * ⚠️ `clearPlannedRoute` (spec 153 T704 M1) recebe **esta** transação, não abre outra: a troca e
       * a limpeza são uma escrita só, ou existe a janela em que a viagem tem tripulação nova e pedágio
       * velho. Não toca em ETA (`eta_departure_at`, `estimated_arrival_frozen_at`,
       * `trip_stops.estimated_arrival_at`), por decisão explícita da D3-bis: a hora que vale é a
       * ancorada na partida real do motorista, e zerar a âncora desligaria o deslocamento do despacho
       * em silêncio.
       */
      if (vehicleChanged) {
        await clearPlannedRoute(transaction, {
          companyId: input.companyId,
          tripId: input.tripId,
        })
      }

      return readTripDetail(transaction, {
        cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
        packageBoxLookup: this.packageBoxLookup,
        companyId: input.companyId,
        tripId: input.tripId,
      })
    })
  }

  /**
   * Spec 249: a transferência de tripulação de uma viagem na rua. A escrita inteira (lock, janela,
   * custo antes/depois, troca, histórico, auditoria) mora em `applyTripCrewTransfer`; aqui só se abre
   * a transação e se lê o detalhe na mesma conexão.
   */
  public async transferCrew(input: TransferTripCrewParams): Promise<TransferTripCrewResult | null> {
    return this.database.transaction(async (transaction) => {
      const transfer = await applyTripCrewTransfer(transaction, input)
      if (transfer === null) return null

      const trip = await readTripDetail(transaction, {
        cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
        companyId: input.companyId,
        packageBoxLookup: this.packageBoxLookup,
        tripId: input.tripId,
      })
      return trip === null ? null : { transfer, trip }
    })
  }

  public async create(input: CreateTripRecord): Promise<TripDetail> {
    return this.database.transaction(async (transaction) => {
      /**
       * Spec 217 D1: a mesma função que decide a troca (`updateCrew`) decide o nascimento — uma
       * função, duas leitoras, nenhuma chance de discordarem.
       */
      const status = resolveCrewStatus({
        hasDriver: input.crew.length > 0,
        hasVehicle: input.vehicleId !== null,
      })
      const created = await insertTripWithTrailerFallback(transaction, input, status)

      /**
       * Spec 171 RF1: mesmo caminho das demais transições — grava na mesma transação do `INSERT
       * trips`, direto em `trip_status_events`. Spec 217 D1: o status gravado é o derivado do par,
       * não mais `draft` fixo (o `default` da coluna só cobre quem nunca passa por aqui).
       */
      await recordTripCreation(transaction, {
        actorUserId: input.actorUserId,
        channel: input.channel,
        companyId: input.companyId,
        status,
        tripId: created.id,
      })

      if (input.crew.length > 0) {
        await transaction.insert(tripDrivers).values(
          input.crew.map((driver) => ({
            companyId: input.companyId,
            driverId: driver.driverId,
            driverName: driver.driverName,
            driverTaxId: driver.driverTaxId,
            position: BigInt(driver.position),
            role: driver.role,
            tripId: created.id,
          })),
        )
      }

      const detail = await readTripDetail(transaction, {
        cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
        packageBoxLookup: this.packageBoxLookup,
        companyId: input.companyId,
        tripId: created.id,
      })
      if (detail === null) throw new Error('TRIP_CREATE_FAILED')

      // D7: a viagem nasce sem parada, e mesmo assim pede o cálculo — o gatilho lazy (T10/T11)
      // reconcilia depois se algo mudar antes do worker desenhar a planta.
      await this.requestCargoLayoutForTrip(transaction, {
        companyId: input.companyId,
        tripId: created.id,
      })
      return detail
    })
  }

  public async findById(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripDetail | null> {
    return readTripDetail(this.database, {
      ...input,
      cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
      packageBoxLookup: this.packageBoxLookup,
    })
  }

  public async findDocumentById(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null> {
    const [record] = await this.database
      .select()
      .from(tripDocuments)
      .where(and(...buildTripDocumentFilters(input)))
      .limit(1)
    return record === undefined ? null : mapTripDocument(record)
  }

  /**
   * Spec 153 T708 (H4): as notas de um veículo já estão todas vivas numa viagem só é o sinal de
   * que ela nasceu numa composição anterior do mesmo aceite — o aceite reaproveita em vez de criar
   * outra vazia. Vínculo parcial (algumas notas em uma viagem, outras em outra ou soltas) devolve
   * `null`: reaproveitar uma composição incompleta é pior do que recomeçar.
   *
   * Spec 153 T801 (N1): o conjunto de notas por si só não identifica a composição — duas viagens
   * diferentes podem ter passado pelo mesmo conjunto se a frota mudou entre tentativas. O `join` em
   * `trips` exige o **mesmo veículo** (e o mesmo motorista, quando a composição atual tem um) e uma
   * viagem que ainda não foi despachada: reaproveitar a viagem do veículo/motorista errado, ou uma
   * já na rua, pendura frete, eixo e baseline de combustível de quem não vai carregar a nota.
   */
  public async findLiveTripIdForDocuments(input: {
    readonly companyId: string
    readonly driverId: string | null
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  }): Promise<string | null> {
    if (input.nfeDocumentIds.length === 0) return null

    const live = await this.database
      .select({ nfeDocumentId: tripDocuments.nfeDocumentId, tripId: tripDocuments.tripId })
      .from(tripDocuments)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          inArray(tripDocuments.nfeDocumentId, [...input.nfeDocumentIds]),
          isNull(tripDocuments.releasedAt),
          eq(trips.vehicleId, input.vehicleId),
          inArray(trips.status, [...TRIP_STATUSES_BEFORE_DISPATCH]),
        ),
      )
    if (live.length !== input.nfeDocumentIds.length) return null

    const tripIds = new Set(live.map((row) => row.tripId))
    if (tripIds.size !== 1) return null
    const tripId = [...tripIds][0]!

    if (input.driverId !== null) {
      const [driverRow] = await this.database
        .select({ id: tripDrivers.id })
        .from(tripDrivers)
        .where(
          and(
            eq(tripDrivers.companyId, input.companyId),
            eq(tripDrivers.tripId, tripId),
            eq(tripDrivers.driverId, input.driverId),
          ),
        )
        .limit(1)
      if (driverRow === undefined) return null
    }

    return tripId
  }

  public async findVehicle(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<TripVehicleCandidate | null> {
    const [record] = await this.database
      .select({
        defaultTrailerVehicleId: fleetVehicles.defaultTrailerVehicleId,
        id: fleetVehicles.id,
        role: fleetVehicles.role,
        status: fleetVehicles.status,
        vehicleType: fleetVehicles.vehicleType,
      })
      .from(fleetVehicles)
      .where(
        and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
      )
      .limit(1)
    return record ?? null
  }

  /** Feature 147 T10: mesmo recorte do índice `trips_company_trailer_open_unique`, sem a viagem em edição. */
  public async isTrailerInOpenTrip(input: {
    readonly companyId: string
    readonly excludingTripId?: string
    readonly vehicleId: string
  }): Promise<boolean> {
    const [record] = await this.database
      .select({ id: trips.id })
      .from(trips)
      .where(
        and(
          eq(trips.companyId, input.companyId),
          eq(trips.trailerVehicleId, input.vehicleId),
          input.excludingTripId === undefined ? undefined : ne(trips.id, input.excludingTripId),
          notInArray(trips.status, [...TRIP_TERMINAL_STATUSES]),
        ),
      )
      .limit(1)
    return record !== undefined
  }

  /**
   * Feature 147 T10: re-checa o portão de estado dentro da transação, como `linkDocument` — a
   * leitura do use-case não tem lock e pode ter ficado velha entre a checagem e esta escrita.
   */
  public async setTrailer(input: {
    readonly companyId: string
    readonly trailerVehicleId: string | null
    readonly tripId: string
  }): Promise<TripDetail | null> {
    return this.database.transaction(async (transaction) => {
      const [tripRow] = await transaction
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .for('update')
        .limit(1)
      if (tripRow === undefined) return null
      const blockReason = checkTripAcceptsLinkage(tripRow.status)
      if (blockReason !== null) throw new TripStateTransitionNotAllowedError(blockReason)

      await runTrailerGuarded(async () => {
        await transaction
          .update(trips)
          .set({ trailerVehicleId: input.trailerVehicleId, updatedAt: sql`now()` })
          .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      })

      return readTripDetail(transaction, {
        cargoLayoutLeaseMs: this.cargoLayoutLeaseMs,
        packageBoxLookup: this.packageBoxLookup,
        companyId: input.companyId,
        tripId: input.tripId,
      })
    })
  }

  public async linkDocument(input: {
    readonly companyId: string
    readonly freightCalculationId: string | null
    readonly nfeDocumentId: string | null
    readonly tripId: string
  }): Promise<TripDocument> {
    // T013 fechou a janela que ficava entre o `assertTripOpen` do caso de uso e este insert: um
    // `SELECT ... FOR UPDATE` trava a linha da viagem por toda a transação, então um despacho
    // concorrente ou espera este lock (e o vínculo acontece antes) ou o insert espera o despacho
    // (e falha contra o estado já sealed) — nunca os dois escrevem sobre a mesma corrida.
    return this.database.transaction(async (transaction) => {
      const [tripRow] = await transaction
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .for('update')
        .limit(1)
      if (tripRow === undefined) throw new TripNotFoundError()
      const blockReason = checkTripAcceptsLinkage(tripRow.status)
      if (blockReason !== null) throw new TripStateTransitionNotAllowedError(blockReason)

      const record = await runGuarded(async () => {
        const [created] = await transaction
          .insert(tripDocuments)
          .values({
            companyId: input.companyId,
            freightCalculationId: input.freightCalculationId,
            nfeDocumentId: input.nfeDocumentId,
            tripId: input.tripId,
          })
          .returning()
        return created
      })
      if (record === undefined) throw new Error('TRIP_DOCUMENT_LINK_FAILED')

      const { destinationOrigin, stopId } = await reconcileLinkedDocumentStop(transaction, {
        companyId: input.companyId,
        freightCalculationId: record.freightCalculationId,
        nfeDocumentId: record.nfeDocumentId,
        tripId: input.tripId,
      })
      // ⚠️ A origem sobrevive à parada ausente: o CEP que não normaliza deixa a nota `SEM ENDEREÇO`
      // (T007) e a procedência do endereço continua conhecida — é justamente a nota cuja origem
      // mais precisa ser explicada na tela.
      let linked = mapTripDocument(record)
      if (destinationOrigin !== null || stopId !== null) {
        const [withStop] = await transaction
          .update(tripDocuments)
          .set({ destinationOrigin, stopId })
          .where(and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, record.id)))
          .returning()
        linked = mapTripDocument(withStop ?? record)
      }

      /**
       * T704 M1: o conjunto de paradas mudou, então a rota gravada descreve uma viagem que não
       * existe mais. Ela morre **aqui**, na mesma transação — o recongelamento é best-effort e,
       * quando falha, o que sobra é rota nula (D5), nunca a rota velha passando por boa.
       */
      await clearPlannedRoute(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
      })

      /** Spec 148 D12: a nota que estava na fila de revisão entrou numa viagem — a entrada fecha. */
      await closePendingReviewsOnLink(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
      })
      await this.requestCargoLayoutForTrip(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
      })
      return linked
    })
  }

  /**
   * O lote paga **uma** transação e **um** lock da viagem para o maço inteiro. O caminho um a um
   * pagava os dois por nota, e uma viagem de trezentas notas era trezentas idas ao servidor — com a
   * viagem já criada quando a centésima falhava.
   *
   * ⚠️ A nota já vinculada é **filtrada antes do insert**, não capturada depois: numa transação só,
   * a violação de unicidade aborta o lote inteiro, e as duzentas e noventa e nove boas cairiam com
   * a repetida. Entre a leitura e o insert ainda cabe outra escrita, e é o índice
   * `trip_documents_live_nfe_document_unique` que decide — por isso o insert ignora o conflito.
   */
  public async linkDocumentsBatch(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly tripId: string
  }): Promise<LinkTripDocumentsBatchResult> {
    return this.database.transaction(async (transaction) => {
      const [tripRow] = await transaction
        .select({ status: trips.status })
        .from(trips)
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .for('update')
        .limit(1)
      if (tripRow === undefined) throw new TripNotFoundError()
      const blockReason = checkTripAcceptsLinkage(tripRow.status)
      if (blockReason !== null) throw new TripStateTransitionNotAllowedError(blockReason)

      if (input.nfeDocumentIds.length === 0) {
        return { linked: [], skipped: [], tripStatus: tripRow.status }
      }

      const live = await transaction
        .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
        .from(tripDocuments)
        .where(
          and(
            eq(tripDocuments.companyId, input.companyId),
            inArray(tripDocuments.nfeDocumentId, [...input.nfeDocumentIds]),
            isNull(tripDocuments.releasedAt),
          ),
        )
      const alreadyLinked = new Set(
        live.flatMap((row) => (row.nfeDocumentId === null ? [] : [row.nfeDocumentId])),
      )
      const pending = input.nfeDocumentIds.filter((id) => !alreadyLinked.has(id))

      const created =
        pending.length === 0
          ? []
          : await transaction
              .insert(tripDocuments)
              .values(
                pending.map((nfeDocumentId) => ({
                  companyId: input.companyId,
                  freightCalculationId: null,
                  nfeDocumentId,
                  tripId: input.tripId,
                })),
              )
              .onConflictDoNothing()
              .returning()

      const linked: TripDocument[] = []
      for (const record of created) {
        const { destinationOrigin, stopId } = await reconcileLinkedDocumentStop(transaction, {
          companyId: input.companyId,
          freightCalculationId: record.freightCalculationId,
          nfeDocumentId: record.nfeDocumentId,
          tripId: input.tripId,
        })
        if (destinationOrigin === null && stopId === null) {
          linked.push(mapTripDocument(record))
          continue
        }
        const [withStop] = await transaction
          .update(tripDocuments)
          .set({ destinationOrigin, stopId })
          .where(and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, record.id)))
          .returning()
        linked.push(mapTripDocument(withStop ?? record))
      }

      /** O que o `onConflictDoNothing` engoliu perdeu a corrida entre a leitura e o insert. */
      const insertedIds = new Set(
        created.flatMap((row) => (row.nfeDocumentId === null ? [] : [row.nfeDocumentId])),
      )
      const skipped = input.nfeDocumentIds
        .filter((id) => !insertedIds.has(id))
        .map((nfeDocumentId) => ({ nfeDocumentId, reason: 'already_linked' as const }))

      if (created.length > 0) {
        /**
         * T704 M1: o maço entrou e o conjunto de paradas mudou — a rota gravada descreve a viagem
         * de antes. Morre nesta transação; o recongelamento roda depois do commit, best-effort.
         * Lote que não vinculou nada não mexeu em parada nenhuma, e a rota boa continua valendo.
         */
        await clearPlannedRoute(transaction, {
          companyId: input.companyId,
          tripId: input.tripId,
        })
        await closePendingReviewsOnLink(transaction, {
          companyId: input.companyId,
          tripId: input.tripId,
        })
      }
      await this.requestCargoLayoutForTrip(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
      })
      return { linked, skipped, tripStatus: tripRow.status }
    })
  }

  public async listDrivers(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
  }): Promise<readonly TripDriverCandidate[]> {
    if (input.driverIds.length === 0) return []
    return this.database
      .select({
        canActAsHelper: fleetDrivers.canActAsHelper,
        canDrive: fleetDrivers.canDrive,
        id: fleetDrivers.id,
        name: fleetDrivers.name,
        status: fleetDrivers.status,
        taxId: fleetDrivers.taxId,
      })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          inArray(fleetDrivers.id, [...input.driverIds]),
        ),
      )
  }

  public async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: TripFilters
    readonly limit: number
  }): Promise<TripPage> {
    const cursor = decodeKeysetCursor(input.cursor)
    const conditions = buildTripListFilters({
      companyId: input.companyId,
      cursor,
      ...(input.filters === undefined ? {} : { filters: input.filters }),
    })

    const records = await this.database
      .select()
      .from(trips)
      .where(and(...conditions))
      .orderBy(desc(trips.createdAt), desc(trips.id))
      .limit(input.limit + 1)

    const page = records.slice(0, input.limit)
    const last = page.at(-1)
    const nextCursor =
      records.length > input.limit && last !== undefined
        ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
        : null

    /**
     * Uma consulta para a página inteira, nunca uma por linha: quem lê a listagem quer saber **quem
     * dirige**, e o `vehicleId` sozinho manda o operador abrir viagem por viagem para descobrir.
     */
    const driversByTrip = await this.loadTripDriverNames(page.map((record) => record.id))
    /**
     * Spec 107 D3: quando esta viagem termina — a última chegada estimada do roteiro. Uma consulta
     * para a página inteira, como a dos motoristas.
     */
    const finishByTrip = await this.loadTripFinishTimes(page.map((record) => record.id))

    return {
      items: page.map((record) => ({
        ...mapTrip(record),
        driverNames: driversByTrip.get(record.id) ?? [],
        /**
         * ⚠️ Os dois andam **em par**, sempre: a hora sem o carimbo é uma previsão sem idade, e a
         * tela mostraria o que o planejamento achava às 7h como se fosse de agora.
         */
        estimatedArrivalFrozenAt: record.estimatedArrivalFrozenAt?.toISOString() ?? null,
        estimatedFinishAt: finishByTrip.get(record.id) ?? null,
      })),
      nextCursor,
    }
  }

  /**
   * Só o nome, e na ordem em que a viagem os pareou (`position`): a listagem nomeia quem dirige, e
   * CPF e contato são da ficha — trazê-los para uma tabela de varredura seria PII sem consumidor.
   */
  /**
   * A **última** chegada estimada de cada viagem: é a hora em que o motorista fica livre.
   *
   * ⚠️ `max` e não a parada de maior sequência: parada sem ETA devolveria `null` e derrubaria a
   * conta inteira, e a última nem sempre é a que tem a hora.
   */
  private async loadTripFinishTimes(tripIds: readonly string[]): Promise<Map<string, string>> {
    const byTrip = new Map<string, string>()
    if (tripIds.length === 0) return byTrip

    const rows = await this.database
      .select({
        finishAt: sql<Date | null>`max(${tripStops.estimatedArrivalAt})`.as('finish_at'),
        tripId: tripStops.tripId,
      })
      .from(tripStops)
      .where(inArray(tripStops.tripId, [...tripIds]))
      .groupBy(tripStops.tripId)

    for (const row of rows) {
      if (row.finishAt !== null) byTrip.set(row.tripId, new Date(row.finishAt).toISOString())
    }

    return byTrip
  }

  private async loadTripDriverNames(
    tripIds: readonly string[],
  ): Promise<Map<string, readonly string[]>> {
    const byTrip = new Map<string, readonly string[]>()
    if (tripIds.length === 0) return byTrip

    const rows = await this.database
      .select({
        driverName: tripDrivers.driverName,
        position: tripDrivers.position,
        tripId: tripDrivers.tripId,
      })
      .from(tripDrivers)
      .where(inArray(tripDrivers.tripId, [...tripIds]))
      .orderBy(asc(tripDrivers.position))

    for (const row of rows) {
      byTrip.set(row.tripId, [...(byTrip.get(row.tripId) ?? []), row.driverName])
    }
    return byTrip
  }

  public async releaseDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null> {
    return this.database.transaction(async (transaction) => {
      // A parada de origem precisa ser lida **antes** do `UPDATE` abaixo: `RETURNING` reflete o
      // estado novo da linha (`stop_id` já nulo), não o antigo — a T010 aprendeu isso do jeito
      // caro com `releaseUnloadedDocuments`.
      const previousStopId = await readDocumentStopIdBeforeRelease(transaction, {
        companyId: input.companyId,
        documentId: input.documentId,
      })

      const [released] = await transaction
        .update(tripDocuments)
        .set({ releasedAt: sql`now()`, stopId: null, updatedAt: sql`now()` })
        .where(
          and(
            ...buildTripDocumentFilters(input),
            isNull(tripDocuments.deliveredAt),
            isNull(tripDocuments.releasedAt),
            tripStillOpen(input),
          ),
        )
        .returning()
      if (released === undefined) return null

      // A nota já perdeu a referência à parada no `UPDATE` acima — só depois disso
      // `reconcileStopOnUnlink` pode contar corretamente se a parada esvaziou (T007).
      if (previousStopId !== null) {
        await reconcileStopOnUnlink({
          companyId: input.companyId,
          repository: createTripStopReconciliationPort(transaction),
          stopId: previousStopId,
        })
      }

      /**
       * T704 M1: o conjunto de paradas mudou, então a rota gravada descreve uma viagem que não
       * existe mais. Ela morre **aqui**, na mesma transação — o recongelamento é best-effort e,
       * quando falha, o que sobra é rota nula (D5), nunca a rota velha passando por boa.
       */
      await clearPlannedRoute(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
      })
      await this.requestCargoLayoutForTrip(transaction, {
        companyId: input.companyId,
        tripId: input.tripId,
      })
      return mapTripDocument(released)
    })
  }
}

type LinkedDocumentDestination = {
  readonly destinationOrigin: PhysicalDestinationOrigin | null
  readonly stopId: string | null
}

/** Nota que não resolve a destino algum: nem parada, nem procedência a declarar. */
const NO_DESTINATION: LinkedDocumentDestination = { destinationOrigin: null, stopId: null }

/**
 * ADR-0043 §3: vincular cria a parada se faltar, reaproveitando a que já agrupa o mesmo endereço
 * normalizado. `stopId` nulo quando a NF-e não resolve a destino algum, ou quando o CEP não
 * normaliza (T007) — a nota fica `SEM ENDEREÇO`, sem quebrar o vínculo em si.
 *
 * A origem (spec 073 CA10) é devolvida **junto e em separado**: no segundo caso ela é conhecida e o
 * `stopId` não, e é essa nota que mais precisa da procedência impressa na tela.
 */
export async function reconcileLinkedDocumentStop(
  transaction: TripTransaction,
  input: {
    readonly companyId: string
    readonly freightCalculationId: string | null
    readonly nfeDocumentId: string | null
    readonly tripId: string
  },
): Promise<LinkedDocumentDestination> {
  const nfeDocumentId = await resolveNfeDocumentId(transaction, input)
  if (nfeDocumentId === null) return NO_DESTINATION

  const destination = await resolveNfeDestinationAddress(transaction, {
    companyId: input.companyId,
    nfeDocumentId,
  })
  if (destination === null) return NO_DESTINATION

  const stop = await reconcileStopOnLink({
    addressComponents: destination.components,
    companyId: input.companyId,
    label: destination.label,
    repository: createTripStopReconciliationPort(transaction),
    tripId: input.tripId,
  })
  return { destinationOrigin: destination.origin, stopId: stop?.id ?? null }
}

/**
 * O `RETURNING` do `UPDATE` que libera a nota já reflete `stop_id = null` — a T010 aprendeu isso do
 * jeito caro. A parada de origem precisa ser lida numa consulta separada, antes de reconciliar.
 */
export async function readDocumentStopIdBeforeRelease(
  transaction: TripTransaction,
  input: { readonly companyId: string; readonly documentId: string },
): Promise<string | null> {
  const [row] = await transaction
    .select({ stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.documentId)),
    )
    .limit(1)
  return row?.stopId ?? null
}

/**
 * Fecha a corrida entre o `assertTripOpen` do caso de uso e a escrita: um `POST /trips/:id/close`
 * concorrente pode fechar a viagem no intervalo, e a condição faz o update simplesmente não achar
 * linha em vez de gravar sobre viagem fechada.
 */
/**
 * A viagem ainda aceita trabalho de barracão: nem na rua, nem terminal.
 *
 * ⚠️ A lista **não** é literal: ela sai de `TRIP_DISPATCHED_STATUSES` mais `cancelled`. Ela já foi
 * literal, com um comentário pedindo revisão manual a cada estado novo — e foi assim que
 * `on_delivery_route` quase entrou deixando esta consulta com o recorte antigo.
 */
function tripStillOpen(input: { readonly companyId: string; readonly tripId: string }) {
  return sql`exists (
    select 1 from ${trips}
    where ${and(
      eq(trips.companyId, input.companyId),
      eq(trips.id, input.tripId),
      notInArray(trips.status, [...TRIP_DISPATCHED_STATUSES, 'cancelled']),
    )}
  )`
}

function buildTripDocumentFilters(input: {
  readonly companyId: string
  readonly documentId: string
  readonly tripId: string
}) {
  return [
    eq(tripDocuments.companyId, input.companyId),
    eq(tripDocuments.id, input.documentId),
    eq(tripDocuments.tripId, input.tripId),
  ]
}

/**
 * O `trip_documents_entity_xor_check` deixa a nota chegar por dois caminhos, e a T017 resolveu só o
 * direto: por cálculo de frete a tela voltava a imprimir o UUID. O alias resolve o segundo sem
 * tocar no join que decide o `fiscalStatus`.
 */
const nfeDocumentsViaFreight = alias(nfeDocuments, 'nfe_documents_via_freight')

/**
 * Spec 176: participantes da nota **direta** (`tripDocuments.nfeDocumentId`) — o caminho que precisa
 * de previsão de frete. A nota que chega só por cálculo (`freightCalculationId`) já tem o valor
 * congelado e não passa por aqui.
 */
const tripDocumentEmitter = alias(nfeParticipants, 'trip_document_freight_emitter')
const tripDocumentRecipient = alias(nfeParticipants, 'trip_document_freight_recipient')
const tripDocumentRecipientAddress = alias(nfeAddresses, 'trip_document_freight_recipient_address')

/**
 * Spec 156 T8d: mesmo molde da junção de ator da linha do tempo
 * (`timelineActorMembership`/`timelineActorProfile`, `trip-timeline-status.query.ts`) — membership
 * ativa escopada pela empresa. Pessoa sem membership ativa (removida) devolve `null`, nunca lança.
 */
async function resolveTripCloserName(
  queryable: TripQueryable,
  input: { readonly closedByUserId: string; readonly companyId: string },
): Promise<string | null> {
  const [row] = await queryable
    .select({ name: timelineActorProfile.name })
    .from(timelineActorMembership)
    .innerJoin(
      timelineActorProfile,
      eq(timelineActorProfile.userId, timelineActorMembership.userId),
    )
    .where(
      and(
        eq(timelineActorMembership.companyId, input.companyId),
        eq(timelineActorMembership.userId, input.closedByUserId),
        eq(timelineActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .limit(1)
  return row?.name ?? null
}

/**
 * Spec 176: as regras ativas de percentual da empresa, **uma consulta por leitura da viagem** — o
 * mesmo molde de `loadActiveFreightRules` em `drizzle-nfe-document.repository.ts`. `freight_rules`
 * é configuração (poucas linhas), e resolvê-la por nota faria uma consulta a mais por documento.
 */
async function loadActiveFreightRules(
  queryable: TripQueryable,
  companyId: string,
): Promise<readonly DocumentFreightRule[]> {
  const rows = await queryable
    .select({ rule: freightRules, version: freightRuleVersions })
    .from(freightRuleVersions)
    .innerJoin(
      freightRules,
      and(
        eq(freightRules.companyId, freightRuleVersions.companyId),
        eq(freightRules.id, freightRuleVersions.freightRuleId),
      ),
    )
    .where(
      and(
        eq(freightRuleVersions.companyId, companyId),
        eq(freightRules.type, 'percentage_of_invoice_total'),
        eq(freightRules.status, 'active'),
        eq(freightRuleVersions.status, 'active'),
      ),
    )

  return rows.map((row) => ({
    filters: normalizeFreightRuleFilters(
      row.version.filters as Parameters<typeof normalizeFreightRuleFilters>[0],
    ),
    freightRuleId: row.rule.id,
    maximumAmount: row.version.maximumAmount,
    minimumAmount: row.version.minimumAmount,
    name: row.rule.name,
    percentage: row.version.percentage,
    priority: row.rule.priority,
    validFrom: row.version.validFrom,
    validUntil: row.version.validUntil,
  }))
}

/**
 * Spec 168: mesma enriquecimento que `createReadCargoLayoutUseCase` faz — uma consulta para todas as
 * pendências, casada por `buildPendingMeasurementBoxKey`. `null` nos três campos quando a pendência
 * não casa nenhuma caixa (produto sem código, nota sem casamento, ou mais de uma caixa possível).
 */
async function enrichPendingMeasurementsWithBox(
  pendingMeasurements: readonly PendingMeasurement[],
  params: {
    readonly companyId: string
    readonly packageBoxLookup: PendingMeasurementBoxLookupPort
  },
): Promise<readonly CargoLayoutPendingMeasurement[]> {
  const boxMatchesByKey = await params.packageBoxLookup.findBoxIdsForPendingMeasurements({
    companyId: params.companyId,
    items: pendingMeasurements,
  })
  /**
   * Spec 168: a planta guardada pode ser mais velha que a última medida (fica `stale` enquanto o
   * worker recalcula) — sem descartar aqui, uma caixa já medida ficava na tabela do que falta medir
   * até o recálculo acontecer.
   */
  return pendingMeasurements.flatMap((item) => {
    const key = buildPendingMeasurementBoxKey(item)
    const match = key === null ? undefined : boxMatchesByKey.get(key)
    if (match?.isMeasured === true) return []
    return [
      {
        ...item,
        grossWeightGrams: match?.grossWeightGrams ?? null,
        packageBoxId: match?.boxId ?? null,
        unitsPerBox: match?.unitsPerBox ?? null,
      },
    ]
  })
}

async function readTripDetail(
  queryable: TripQueryable,
  input: {
    readonly cargoLayoutLeaseMs: number
    readonly companyId: string
    readonly packageBoxLookup: PendingMeasurementBoxLookupPort
    readonly tripId: string
  },
): Promise<TripDetail | null> {
  const [record] = await queryable
    .select()
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (record === undefined) return null

  /**
   * Spec 156 T8d: só uma consulta a mais, e só quando a viagem foi encerrada à mão — a derivação
   * automática nunca preenche `closed_by_user_id`, então o caminho comum (a maioria das viagens)
   * não paga nada por este campo (`test/integration/trip-detail-query-count.integration.ts`).
   */
  const closedByName =
    record.closedByUserId === null
      ? null
      : await resolveTripCloserName(queryable, {
          closedByUserId: record.closedByUserId,
          companyId: input.companyId,
        })

  /**
   * O contato sai da **ficha**, não do retrato: `trip_drivers` guarda nome e CPF de quando a viagem
   * foi montada, e telefone que mudou depois precisa aparecer atualizado — é para ligar agora.
   * `left join` porque ficha apagada não pode sumir com o motorista da viagem.
   */
  const driverRecords = await queryable
    .select({
      driver: tripDrivers,
      driverEmail: fleetDrivers.email,
      driverPhone: fleetDrivers.phone,
      driverSecuresCargo: fleetDrivers.securesCargo,
    })
    .from(tripDrivers)
    .leftJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)))
    .orderBy(asc(tripDrivers.position))
  const documentRecords = await queryable
    .select({
      cteAuthorized: sql<boolean>`${cteAuthorizedExpression()}`,
      document: tripDocuments,
      freightCalculationStatus: freightCalculations.status,
      freightCalculationTotalAmount: freightCalculations.totalAmount,
      nfeDocumentStatus: nfeDocuments.status,
      /**
       * Spec 079 T017: o que identifica a nota na tela. Sai da junção que já existia — nenhuma
       * consulta a mais, e a alternativa (uma leitura por nota) multiplicaria por vinte a tela mais
       * pesada do módulo.
       */
      nfeIssuedAt: sql<Date | null>`coalesce(${nfeDocuments.issuedAt}, ${nfeDocumentsViaFreight.issuedAt})`,
      nfeNumber: sql<
        null | string
      >`coalesce(${nfeDocuments.number}, ${nfeDocumentsViaFreight.number})`,
      nfeSeries: sql<
        null | string
      >`coalesce(${nfeDocuments.series}, ${nfeDocumentsViaFreight.series})`,
      nfeTotalValue: sql<
        null | string
      >`coalesce(${nfeDocuments.totalValue}, ${nfeDocumentsViaFreight.totalValue})`,
      /**
       * Spec 176: só para o caminho direto (`nfeDocumentId`) — a nota que chega por cálculo já tem
       * o valor de frete congelado em `freightCalculations`, e não precisa de participante nenhum.
       */
      freightDestinationCityCode: tripDocumentRecipientAddress.cityCode,
      freightDestinationState: tripDocumentRecipientAddress.state,
      freightSenderTaxId: tripDocumentEmitter.taxId,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      freightCalculations,
      and(
        eq(freightCalculations.companyId, tripDocuments.companyId),
        eq(freightCalculations.id, tripDocuments.freightCalculationId),
      ),
    )
    .leftJoin(
      nfeDocumentsViaFreight,
      and(
        eq(nfeDocumentsViaFreight.companyId, tripDocuments.companyId),
        eq(nfeDocumentsViaFreight.id, freightCalculations.nfeDocumentId),
      ),
    )
    .leftJoin(
      tripDocumentEmitter,
      and(
        eq(tripDocumentEmitter.companyId, nfeDocuments.companyId),
        eq(tripDocumentEmitter.documentId, nfeDocuments.id),
        eq(tripDocumentEmitter.role, 'emitter'),
      ),
    )
    .leftJoin(
      tripDocumentRecipient,
      and(
        eq(tripDocumentRecipient.companyId, nfeDocuments.companyId),
        eq(tripDocumentRecipient.documentId, nfeDocuments.id),
        eq(tripDocumentRecipient.role, 'recipient'),
      ),
    )
    .leftJoin(
      tripDocumentRecipientAddress,
      and(
        eq(tripDocumentRecipientAddress.companyId, tripDocumentRecipient.companyId),
        eq(tripDocumentRecipientAddress.participantId, tripDocumentRecipient.id),
      ),
    )
    .where(and(...buildTripDocumentListFilters(input)))
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))

  /**
   * Spec 176 (CA06): **uma consulta para as N notas** — as regras ativas da empresa são
   * configuração (poucas linhas), carregadas uma vez e casadas em memória, o mesmo padrão de
   * `loadActiveFreightRules` na listagem de notas (`drizzle-nfe-document.repository.ts`).
   */
  const activeFreightRules = await loadActiveFreightRules(queryable, input.companyId)
  /**
   * Spec 079 P2: o contato entra **aqui**, no mesmo map que monta a nota — depois seria tarde: as
   * paradas já agrupam `documents`, e um segundo objeto com contato produziria duas verdades sobre
   * a mesma nota.
   */
  const contacts = await listDeliveryContacts(queryable, {
    companyId: input.companyId,
    nfeDocumentIds: documentRecords.flatMap((row) =>
      row.document.nfeDocumentId === null ? [] : [row.document.nfeDocumentId],
    ),
  })
  /**
   * Spec 164 T15 (RF20): uma leitura a mais, fixa — nunca por nota nem por parada — que devolve só
   * os `trip_documents.id` com tratativa ainda não terminal. Sem escrita nenhuma em
   * `trip_documents.separation_status`.
   */
  const openOccurrenceCaseDocumentIds = await loadTripDocumentIdsWithOpenOccurrenceCase(queryable, {
    companyId: input.companyId,
    tripDocumentIds: documentRecords.map((row) => row.document.id),
  })
  /** Spec 223 RF4: até três leituras fixas para a viagem inteira; nenhuma sem nota baixada sem foto. */
  const proofPendingDocumentIds = await loadProofPendingDocumentIds(queryable, {
    companyId: input.companyId,
    tripDocumentIds: documentRecords.map((row) => row.document.id),
  })
  /**
   * Spec 185 T6.1: uma consulta a mais, fixa para a viagem inteira (nunca por nota) — o mesmo
   * `readDispatchReadinessDocuments` que o despacho usa, alimentando a mesma conta pura
   * (`resolveDispatchReadiness`). `leftBehind` vira o conjunto que marca `leavesBehindOnDispatch`.
   */
  const dispatchReadinessDocuments = await readDispatchReadinessDocuments(queryable, {
    companyId: input.companyId,
    tripId: input.tripId,
  })
  const leavesBehindOnDispatchIds = new Set(
    resolveDispatchReadiness({ documents: dispatchReadinessDocuments }).leftBehind.map(
      (document) => document.tripDocumentId,
    ),
  )
  /** Spec 233 T2.3: uma consulta agregada para as N notas (`GROUP BY document_id`) — nunca por nota. */
  const volumeCountByNfeDocumentId = await loadTripDocumentVolumeCounts(queryable, {
    companyId: input.companyId,
    nfeDocumentIds: documentRecords.flatMap((row) =>
      row.document.nfeDocumentId === null ? [] : [row.document.nfeDocumentId],
    ),
  })
  const documents = documentRecords.map((row) =>
    mapTripDocumentDetail({
      ...row,
      contact:
        row.document.nfeDocumentId === null
          ? null
          : (contacts.get(row.document.nfeDocumentId) ?? null),
      freight: resolveTripDocumentFreight({
        freightCalculationStatus: row.freightCalculationStatus,
        freightCalculationTotalAmount: row.freightCalculationTotalAmount,
        note:
          row.document.nfeDocumentId === null
            ? null
            : {
                destinationCityCode: row.freightDestinationCityCode,
                destinationState: row.freightDestinationState,
                issuedAt: row.nfeIssuedAt,
                senderTaxId: row.freightSenderTaxId,
                totalAmount: row.nfeTotalValue,
              },
        rules: activeFreightRules,
      }),
      leavesBehindOnDispatch: leavesBehindOnDispatchIds.has(row.document.id),
      openOccurrenceCase: openOccurrenceCaseDocumentIds.has(row.document.id),
      proofPending: proofPendingDocumentIds.has(row.document.id),
      volumeCount:
        row.document.nfeDocumentId === null
          ? null
          : (volumeCountByNfeDocumentId.get(row.document.nfeDocumentId) ?? null),
    }),
  )

  // T014: uma única leitura de paradas, independente de quantas existirem — o agrupamento com as
  // notas já buscadas acima acontece em memória, não numa query por parada (§15 do code-standart.md).
  const stopRecords = await queryable
    .select({
      /**
       * Spec 079 T012: a coordenada vem de `geocoded_addresses` pela `address_key`, o único lugar
       * onde ela existe — a 215 tirou de `trip_stops` as colunas que nunca foram escritas e
       * devolviam nulo em toda parada. `left join` porque endereço ainda não geocodificado é o
       * caso normal, e a tela o nomeia fora do mapa.
       *
       * ⚠️ `geocoded_addresses` **não tem tenant** de propósito (ADR-0044): é cache de endereço
       * público, e o recorte por empresa está na parada, que é o lado de cima da junção.
       */
      latitude: geocodedAddresses.latitude,
      longitude: geocodedAddresses.longitude,
      stop: tripStops,
    })
    .from(tripStops)
    .leftJoin(geocodedAddresses, eq(geocodedAddresses.addressKey, tripStops.addressKey))
    .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
    .orderBy(asc(tripStops.sequence))

  const documentsByStopId = new Map<string, TripDocumentDetail[]>()
  for (const document of documents) {
    if (document.stopId === null) continue
    const bucket = documentsByStopId.get(document.stopId)
    if (bucket === undefined) documentsByStopId.set(document.stopId, [document])
    else bucket.push(document)
  }

  const nfeDocumentIds = documents.flatMap((document) =>
    document.nfeDocumentId === null ? [] : [document.nfeDocumentId],
  )
  // Em série: o `queryable` pode ser transação, e consulta concorrente nela pode nunca voltar.
  const cargo = await loadTripOccupancy(queryable, {
    companyId: input.companyId,
    nfeDocumentIds,
    trailerVehicleId: record.trailerVehicleId,
    vehicleId: record.vehicleId,
  })
  const cargoWeight = await loadTripCargoWeight(queryable, {
    companyId: input.companyId,
    nfeDocumentIds,
  }).then((weight) => weight.view)
  const trailer = await readTripTrailer(queryable, {
    companyId: input.companyId,
    trailerVehicleId: record.trailerVehicleId,
  })
  /** Spec 093: o teto sai do mesmo veículo que a ocupação já leu — sem segunda consulta. */
  const cargoWeightWithCeiling = withPayloadCeiling({
    maxPayloadKg: cargo.maxPayloadKg,
    view: cargoWeight,
  })

  /**
   * O rótulo é **derivado**, não servido do gravado: `trip_stops.label` é escrito uma vez, na
   * criação da parada, e ficou congelado quando o rótulo passou a levar o número do endereço.
   * Recalcular por migration em SQL seria a quarta grafia de endereço nesta base — e a terceira já
   * divergiu em silêncio. Sem endereço resolvido, o gravado continua valendo.
   */
  const stopAddresses = await listStopAddresses(queryable, {
    companyId: input.companyId,
    nfeDocumentIds,
  })
  const addressOf = (stopId: string) => {
    for (const document of documentsByStopId.get(stopId) ?? []) {
      const address =
        document.nfeDocumentId === null ? undefined : stopAddresses.get(document.nfeDocumentId)
      if (address !== undefined) return address
    }
    return undefined
  }
  const labelOf = (stopId: string, stored: string): string => {
    for (const document of documentsByStopId.get(stopId) ?? []) {
      const address =
        document.nfeDocumentId === null ? undefined : stopAddresses.get(document.nfeDocumentId)
      // `address.label` já sai de `buildStopLabel`, dentro de `chooseNfeDestinationRow`: remontar
      // aqui seria uma segunda grafia do mesmo rótulo.
      if (address !== undefined) return address.label
    }
    return stored
  }

  /** A mesma montagem da parada que o gatilho eager usa — é ela que faz os dois hashes baterem. */
  const layoutStops = stopRecords.map((row) =>
    buildLayoutStop({
      addresses: stopAddresses,
      cargo,
      documents: documentsByStopId.get(row.stop.id) ?? [],
      stop: row.stop,
    }),
  )

  /**
   * Spec 145 D10 (T10): a entrada que o gatilho eager hasheia, montada do que já veio — nenhuma
   * consulta a mais —, e a planta lida de `trip_cargo_layouts` por esse hash. O detalhe não empacota.
   */
  /** Spec 145 D23: a **mesma** regra da prévia e do eager; ficha apagada é ninguém amarrando. */
  const { enclosedBody, securesCargo } = resolveCargoSecuring({
    bodyType: cargo.bodyType,
    driversSecureCargo: driverRecords.map((row) => row.driverSecuresCargo === true),
  })
  const cargoLayoutInput: BuildCargoLayoutInputParams = {
    /** Spec 088 D2: a medida vem da ficha, e não da ocupação — que é nula sem cubagem nenhuma. */
    bedDimensions: cargo.bedDimensions,
    capacityM3: cargo.capacityM3,
    /** Spec 145 D24: o mesmo alcance da prévia e do eager — o hash dos três tem de bater. */
    deliveryReachM: CARGO_DELIVERY_REACH_M,
    enclosedBody,
    /** Spec 094: o detalhe da viagem desenha a mesma planta da prévia — e pela mesma caixa. */
    fallbackBoxVolumeM3: cargo.fallbackBoxVolumeM3,
    loadingAccess: cargo.loadingAccess,
    measuredShapes: cargo.measuredShapes,
    /** Spec 098: o teto de massa já resolvido acima — a planta e o painel leem o mesmo número. */
    payloadRatio: cargoWeightWithCeiling?.payloadRatio ?? null,
    securesCargo,
    stops: layoutStops,
  }
  const { layoutId, pendingCargoLayoutInput, ...cargoLayoutReading } = await readTripCargoLayout(
    queryable,
    {
      companyId: input.companyId,
      input: cargoLayoutInput,
      leaseMs: input.cargoLayoutLeaseMs,
      tripId: input.tripId,
    },
  )
  /**
   * Spec 168: o mesmo enriquecimento que `createReadCargoLayoutUseCase` já faz na rota dedicada
   * (`GET /trips/:id/cargo-layouts/:layoutId`) — uma consulta para todas as pendências, casada por
   * `buildPendingMeasurementBoxKey`. Sem isso, `GET /trips/:id` (a rota que a tela usa de fato)
   * nunca devolvia `packageBoxId`/`grossWeightGrams`/`unitsPerBox`.
   */
  const cargoLayout =
    cargoLayoutReading.cargoLayout === null
      ? null
      : {
          ...cargoLayoutReading.cargoLayout,
          pendingMeasurements: await enrichPendingMeasurementsWithBox(
            cargoLayoutReading.cargoLayout.pendingMeasurements,
            { companyId: input.companyId, packageBoxLookup: input.packageBoxLookup },
          ),
        }

  return {
    ...mapTrip(record),
    closeReason: record.closeReason,
    closedAt: record.closedAt === null ? null : record.closedAt.toISOString(),
    closedByName,
    cargoLayout,
    cargoLayoutState: cargoLayoutReading.cargoLayoutState,
    cargoLayoutId: layoutId,
    ...(pendingCargoLayoutInput === null ? {} : { pendingCargoLayoutInput }),
    capacityUnknownReason: cargo.capacityUnknownReason,
    capacityUnknownVehicleId: cargo.capacityUnknownVehicleId,
    cargoWeight: cargoWeightWithCeiling,
    documents,
    drivers: driverRecords.map((row) =>
      mapTripDriver({
        ...row.driver,
        driverEmail: row.driverEmail ?? '',
        driverPhone: row.driverPhone ?? '',
      }),
    ),
    occupancy: cargo.occupancy,
    trailer,
    stops: stopRecords.map((row) => ({
      ...mapTripStop(row.stop),
      documents: documentsByStopId.get(row.stop.id) ?? [],
      /**
       * ⚠️ **Depois do spread, e é isso que faz a tela ver o número.** `mapTripStop` devolve o
       * rótulo **gravado**, congelado na criação da parada; derivá-lo só no `stops` intermediário
       * (o que alimenta o desenho do baú) deixou a tela mostrando rua sem número com o gate verde.
       */
      label: labelOf(row.stop.id, row.stop.label),
      latitude: row.latitude,
      longitude: row.longitude,
      cityCode: addressOf(row.stop.id)?.components.cityCode ?? '',
      state: addressOf(row.stop.id)?.state ?? '',
      /** Spec 164 T15 (RF21): o sinal do mapa — deriva das notas já agrupadas, sem consulta nova. */
      hasOpenOccurrence: (documentsByStopId.get(row.stop.id) ?? []).some(
        (document) => document.openOccurrenceCase,
      ),
    })),
  }
}

/**
 * Feature 147 D3/RF5: uma consulta a mais só quando a viagem tem carreta — a maioria não tem, e o
 * caso comum continua com o mesmo custo de antes desta feature.
 */
async function readTripTrailer(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly trailerVehicleId: string | null },
): Promise<TripTrailerView | null> {
  if (input.trailerVehicleId === null) return null

  const [record] = await queryable
    .select({
      bodyType: fleetVehicles.bodyType,
      id: fleetVehicles.id,
      plate: fleetVehicles.plate,
    })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.companyId, input.companyId),
        eq(fleetVehicles.id, input.trailerVehicleId),
      ),
    )
    .limit(1)
  return record ?? null
}

/**
 * T18 (revisão): duas viagens criadas ao mesmo tempo para cavalos que compartilham a mesma carreta
 * padrão disputam `trips_company_trailer_open_unique` — a segunda `INSERT` violava a unicidade e
 * subia como 500 genérico, nunca uma viagem de verdade. A criação sempre tem de terminar em viagem;
 * quem perde a corrida nasce sem carreta (o mesmo `null` que `resolveDefaultTrailerForCreation` já
 * escolhe quando a carreta está livre só na leitura e ocupada na escrita), e o despacho barra depois
 * com `TRIP_TRAILER_REQUIRED`. A tentativa com carreta roda num `SAVEPOINT` (`transaction.
 * transaction`) para a violação desfazer só o `INSERT`, nunca a transação inteira.
 */
async function insertTripWithTrailerFallback(
  transaction: TripTransaction,
  input: CreateTripRecord,
  status: 'awaiting_crew' | 'draft',
): Promise<{ readonly id: string }> {
  if (input.trailerVehicleId === null) {
    return insertTripRow(transaction, { ...input, status, trailerVehicleId: null })
  }

  try {
    return await transaction.transaction((savepoint) =>
      insertTripRow(savepoint, { ...input, status, trailerVehicleId: input.trailerVehicleId }),
    )
  } catch (error) {
    if (violatedCheckConstraint(error) === TRAILER_NOT_VEHICLE_CONSTRAINT) {
      throw new TripTrailerNotVehicleItselfError()
    }
    if (violatedUniqueConstraint(error) !== TRAILER_OPEN_CONSTRAINT) throw error
    return insertTripRow(transaction, { ...input, status, trailerVehicleId: null })
  }
}

async function insertTripRow(
  transaction: TripQueryable,
  input: {
    readonly companyId: string
    readonly dailyAllowanceDays?: number
    readonly status: 'awaiting_crew' | 'draft'
    readonly trailerVehicleId: string | null
    readonly vehicleId: string | null
  },
): Promise<{ readonly id: string }> {
  const [created] = await transaction
    .insert(trips)
    .values({
      companyId: input.companyId,
      ...(input.dailyAllowanceDays === undefined
        ? {}
        : { dailyAllowanceDays: input.dailyAllowanceDays }),
      status: input.status,
      trailerVehicleId: input.trailerVehicleId,
      vehicleId: input.vehicleId,
    })
    .returning({ id: trips.id })
  if (created === undefined) throw new Error('TRIP_CREATE_FAILED')
  return created
}

/** Feature 147 T10: fecha a corrida entre duas escritas concorrentes com a mesma carreta. */
async function runTrailerGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    if (violatedUniqueConstraint(error) === TRAILER_OPEN_CONSTRAINT) {
      throw new TripTrailerInUseError()
    }
    if (violatedCheckConstraint(error) === TRAILER_NOT_VEHICLE_CONSTRAINT) {
      throw new TripTrailerNotVehicleItselfError()
    }
    throw error
  }
}

async function runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    const duplicated = violatedUniqueConstraint(error)
    if (duplicated !== undefined && LIVE_DOCUMENT_CONSTRAINTS.has(duplicated)) {
      throw new TripDocumentAlreadyLinkedError()
    }
    const missing = violatedForeignKeyConstraint(error)
    if (missing !== undefined && MISSING_REFERENCE_CONSTRAINTS.has(missing)) {
      throw new TripDocumentNotFoundError()
    }
    throw error
  }
}
