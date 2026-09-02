/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import {
  fleetDrivers,
  fleetVehicles,
  freightCalculations,
  nfeDocuments,
} from '../../database/database.schema.js'
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
import { checkTripAcceptsLinkage } from '../domain/trip-state.policy.js'
import {
  reconcileStopOnLink,
  reconcileStopOnUnlink,
} from '../application/reconcile-trip-stops.use-case.js'
import { createTripStopReconciliationPort } from './drizzle-trip-stop-reconciliation.support.js'
import {
  resolveNfeDestinationAddress,
  resolveNfeDocumentId,
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
import { loadTripCargoWeight } from './trip-cargo-weight.support.js'
import { loadTripOccupancy } from './trip-occupancy.support.js'
import { resolveCargoLayout } from '../domain/cargo-layout.policy.js'
import { formatScaledDecimal, parseScaledDecimal } from '../../shared/decimal.service.js'
import type { PhysicalDestinationOrigin } from '../../nfe-documents/domain/physical-destination.policy.js'
import type { TripDatabase, TripQueryable, TripTransaction } from './trip-queryable.type.js'

const LIVE_DOCUMENT_CONSTRAINTS = new Set([
  'trip_documents_live_nfe_document_unique',
  'trip_documents_live_freight_calculation_unique',
])

/** Nota/frete de UUID válido mas inexistente nesta empresa — sem tradução vira 500 genérico. */
const MISSING_REFERENCE_CONSTRAINTS = new Set([
  'trip_documents_company_nfe_document_fk',
  'trip_documents_company_freight_calculation_fk',
])

export class DrizzleTripRepository implements TripRepositoryPort {
  public constructor(private readonly database: TripDatabase) {}

  public async close(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripDetail | null> {
    return this.database.transaction(async (transaction) => {
      const [closed] = await transaction
        .update(trips)
        .set({ status: 'completed', updatedAt: sql`now()` })
        .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
        .returning({ id: trips.id })
      if (closed === undefined) return null
      return readTripDetail(transaction, input)
    })
  }

  public async create(input: CreateTripRecord): Promise<TripDetail> {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(trips)
        .values({ companyId: input.companyId, vehicleId: input.vehicleId })
        .returning({ id: trips.id })
      if (created === undefined) throw new Error('TRIP_CREATE_FAILED')

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
        companyId: input.companyId,
        tripId: created.id,
      })
      if (detail === null) throw new Error('TRIP_CREATE_FAILED')
      return detail
    })
  }

  public async deliverDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<TripDocument | null> {
    const [delivered] = await this.database
      .update(tripDocuments)
      .set({ deliveredAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(...buildTripDocumentFilters(input), tripStillOpen(input)))
      .returning()
    return delivered === undefined ? null : mapTripDocument(delivered)
  }

  public async findById(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripDetail | null> {
    return readTripDetail(this.database, input)
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
      if (destinationOrigin === null && stopId === null) return mapTripDocument(record)

      const [withStop] = await transaction
        .update(tripDocuments)
        .set({ destinationOrigin, stopId })
        .where(and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, record.id)))
        .returning()
      return mapTripDocument(withStop ?? record)
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

    return { items: page.map(mapTrip), nextCursor }
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
async function reconcileLinkedDocumentStop(
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
async function readDocumentStopIdBeforeRelease(
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
 * ADR-0043 §2, T013: mesma porta de não-retorno de `checkTripAcceptsLinkage`
 * (`trip-state.policy.ts`) — `dispatched` em diante sela vínculo e desvínculo, não só os dois
 * terminais. A lista fica literal aqui porque SQL não importa `TRIP_STATUSES`; qualquer estado
 * novo que a T006 crie precisa deste `NOT IN` revisto junto.
 */
function tripStillOpen(input: { readonly companyId: string; readonly tripId: string }) {
  return sql`exists (
    select 1 from ${trips}
    where ${trips.companyId} = ${input.companyId}
      and ${trips.id} = ${input.tripId}
      and ${trips.status} not in ('dispatched', 'in_transit', 'completed', 'cancelled')
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

async function readTripDetail(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<TripDetail | null> {
  const [record] = await queryable
    .select()
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  if (record === undefined) return null

  const driverRecords = await queryable
    .select()
    .from(tripDrivers)
    .where(and(eq(tripDrivers.companyId, input.companyId), eq(tripDrivers.tripId, input.tripId)))
    .orderBy(asc(tripDrivers.position))
  const documentRecords = await queryable
    .select({
      cteAuthorized: sql<boolean>`${cteAuthorizedExpression()}`,
      document: tripDocuments,
      freightCalculationStatus: freightCalculations.status,
      nfeDocumentStatus: nfeDocuments.status,
      /**
       * Spec 079 T017: o que identifica a nota na tela. Sai da junção que já existia — nenhuma
       * consulta a mais, e a alternativa (uma leitura por nota) multiplicaria por vinte a tela mais
       * pesada do módulo.
       */
      nfeIssuedAt: nfeDocuments.issuedAt,
      nfeNumber: nfeDocuments.number,
      nfeSeries: nfeDocuments.series,
      nfeTotalValue: nfeDocuments.totalValue,
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
    .where(and(...buildTripDocumentListFilters(input)))
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))
  const documents = documentRecords.map(mapTripDocumentDetail)

  // T014: uma única leitura de paradas, independente de quantas existirem — o agrupamento com as
  // notas já buscadas acima acontece em memória, não numa query por parada (§15 do code-standart.md).
  const stopRecords = await queryable
    .select()
    .from(tripStops)
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
  const [cargo, cargoWeight] = await Promise.all([
    loadTripOccupancy(queryable, {
      companyId: input.companyId,
      nfeDocumentIds,
      vehicleId: record.vehicleId,
    }),
    loadTripCargoWeight(queryable, { companyId: input.companyId, nfeDocumentIds }),
  ])

  const stops = stopRecords.map((stopRecord) => ({
    documents: documentsByStopId.get(stopRecord.id) ?? [],
    label: stopRecord.label,
    sequence: Number(stopRecord.sequence),
  }))

  /**
   * Spec 076: a fatia do baú por parada, montada do que já veio — nenhuma consulta a mais. Parada
   * cujas notas não têm cubagem entra em `stopsWithoutVolume`, nunca como fatia zero.
   */
  const layout = resolveCargoLayout({
    capacityM3: cargo.capacityM3,
    stops: stops.map((stop) => {
      const volumes = stop.documents.map((document) =>
        document.nfeDocumentId === null
          ? null
          : (cargo.volumeByDocument.get(document.nfeDocumentId) ?? null),
      )
      const known = volumes.filter((volume): volume is string => volume !== null)
      return {
        documentsWithoutVolume: volumes.length - known.length,
        label: stop.label,
        sequence: stop.sequence,
        volumeM3: known.length === 0 ? null : sumDecimals(known),
      }
    }),
  })

  return {
    ...mapTrip(record),
    cargoLayout: layout,
    cargoWeight,
    documents,
    drivers: driverRecords.map(mapTripDriver),
    occupancy: cargo.occupancy,
    stops: stopRecords.map((stopRecord) => ({
      ...mapTripStop(stopRecord),
      documents: documentsByStopId.get(stopRecord.id) ?? [],
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

/** Soma decimal de verdade: `Number` traria erro binário para dentro de um volume. */
function sumDecimals(values: readonly string[]): string {
  const total = values.reduce(
    (accumulated, value) =>
      accumulated + parseScaledDecimal({ errorCodePrefix: 'TRIP_CARGO_LAYOUT', scale: 6n, value }),
    0n,
  )
  return formatScaledDecimal(total, 6n)
}
