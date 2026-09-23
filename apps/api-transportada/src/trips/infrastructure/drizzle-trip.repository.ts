/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, desc, eq, inArray, notInArray, isNull, sql } from 'drizzle-orm'
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
import { tripDocuments, tripDrivers, tripStops, trips } from '../../database/trip.schema.js'
import {
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
} from '../application/trip.port.js'
import {
  TripDocumentAlreadyLinkedError,
  TripDocumentNotFoundError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import type { TripDriverCandidate, TripVehicleCandidate } from '../domain/trip.policy.js'
import {
  TRIP_ACTION,
  TRIP_DISPATCHED_STATUSES,
  checkTripAcceptsLinkage,
  checkTripTransition,
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

  public async create(input: CreateTripRecord): Promise<TripDetail> {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(trips)
        .values({
          companyId: input.companyId,
          ...(input.dailyAllowanceDays === undefined
            ? {}
            : { dailyAllowanceDays: input.dailyAllowanceDays }),
          vehicleId: input.vehicleId,
        })
        .returning({ id: trips.id })
      if (created === undefined) throw new Error('TRIP_CREATE_FAILED')

      /**
       * Spec 171 RF1: mesmo caminho das demais transições — grava na mesma transação do `INSERT
       * trips`, direto em `trip_status_events`. `draft` é o `default` da coluna `trips.status`
       * (spec 158 T3 nunca escreveu a criação; agora escreve).
       */
      await recordTripCreation(transaction, {
        actorUserId: input.actorUserId,
        channel: input.channel,
        companyId: input.companyId,
        status: 'draft',
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

  public async findVehicle(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<TripVehicleCandidate | null> {
    const [record] = await this.database
      .select({ id: fleetVehicles.id, role: fleetVehicles.role, status: fleetVehicles.status })
      .from(fleetVehicles)
      .where(
        and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
      )
      .limit(1)
    return record ?? null
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
  params: { readonly companyId: string; readonly packageBoxLookup: PendingMeasurementBoxLookupPort },
): Promise<readonly CargoLayoutPendingMeasurement[]> {
  const boxMatchesByKey = await params.packageBoxLookup.findBoxIdsForPendingMeasurements({
    companyId: params.companyId,
    items: pendingMeasurements,
  })
  return pendingMeasurements.map((item) => {
    const key = buildPendingMeasurementBoxKey(item)
    const match = key === null ? undefined : boxMatchesByKey.get(key)
    return {
      ...item,
      grossWeightGrams: match?.grossWeightGrams ?? null,
      packageBoxId: match?.boxId ?? null,
      unitsPerBox: match?.unitsPerBox ?? null,
    }
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
      openOccurrenceCase: openOccurrenceCaseDocumentIds.has(row.document.id),
    }),
  )

  // T014: uma única leitura de paradas, independente de quantas existirem — o agrupamento com as
  // notas já buscadas acima acontece em memória, não numa query por parada (§15 do code-standart.md).
  const stopRecords = await queryable
    .select({
      /**
       * Spec 079 T012: a coordenada vem de `geocoded_addresses` pela `address_key`, **não** de
       * `trip_stops.latitude/longitude` — essas colunas existem e nunca são escritas (achado da
       * T009), e lê-las devolveria nulo em toda parada. `left join` porque endereço ainda não
       * geocodificado é o caso normal, e a tela o nomeia fora do mapa.
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
    vehicleId: record.vehicleId,
  })
  const cargoWeight = await loadTripCargoWeight(queryable, {
    companyId: input.companyId,
    nfeDocumentIds,
  }).then((weight) => weight.view)
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
