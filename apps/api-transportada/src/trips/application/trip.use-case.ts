/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { assertTripDocumentReference } from '../domain/trip.policy.js'
import { checkTripAcceptsLinkage } from '../domain/trip-state.policy.js'
import {
  TripDocumentAlreadyDeliveredError,
  TripDocumentNotFoundError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../domain/trip.error.js'
import { resolveTripCrewForCreation, resolveTripVehicleForCreation } from './trip-crew.service.js'
import type {
  TripCompanyContext,
  TripDetail,
  TripDocument,
  TripFilters,
  TripPage,
  TripRepositoryPort,
} from './trip.port.js'

export type CreateTripInput = {
  readonly context: TripCompanyContext
  readonly driverIds: readonly string[]
  readonly vehicleId: string
}

export type CloseTripInput = {
  readonly context: TripCompanyContext
  readonly tripId: string
}

export type DeliverTripDocumentInput = {
  readonly context: TripCompanyContext
  readonly documentId: string
  readonly tripId: string
}

export type GetTripInput = {
  readonly context: TripCompanyContext
  readonly tripId: string
}

export type ListTripsInput = {
  readonly context: TripCompanyContext
  readonly cursor: string | null
  readonly filters?: TripFilters
  readonly limit: number
}

export type LinkTripDocumentInput = {
  readonly context: TripCompanyContext
  readonly freightCalculationId: string | null
  readonly nfeDocumentId: string | null
  readonly tripId: string
}

export type ReleaseTripDocumentInput = {
  readonly context: TripCompanyContext
  readonly documentId: string
  readonly tripId: string
}

export type TripUseCase = {
  close(input: CloseTripInput): Promise<TripDetail>
  create(input: CreateTripInput): Promise<TripDetail>
  deliverDocument(input: DeliverTripDocumentInput): Promise<TripDocument>
  get(input: GetTripInput): Promise<TripDetail>
  linkDocument(input: LinkTripDocumentInput): Promise<TripDocument>
  list(input: ListTripsInput): Promise<TripPage>
  releaseDocument(input: ReleaseTripDocumentInput): Promise<TripDocument>
}

export function createTripUseCase(dependencies: {
  /** O expurgo do rastro ao vivo no fechamento (ADR-0050 §5). */
  readonly locations: {
    purgeByTrip(input: { readonly companyId: string; readonly tripId: string }): Promise<void>
  }
  readonly repository: TripRepositoryPort
}): TripUseCase {
  const { repository } = dependencies

  return {
    async close({ context, tripId }) {
      const trip = await findTripOrThrow({ companyId: context.companyId, repository, tripId })
      if (trip.status === 'completed') return trip

      const closed = await repository.close({ companyId: context.companyId, tripId })
      if (closed === null) throw new TripNotFoundError()

      /**
       * ADR-0050 §5: **o rastro morre com a viagem.** Fora da transição de propósito, como o
       * congelamento do resultado financeiro (ADR-0049): apagar dentro dela seguraria o fechamento
       * por uma varredura de tabela que só o portal lê. O que sobrevive é o carimbo da entrega.
       */
      await dependencies.locations.purgeByTrip({ companyId: context.companyId, tripId })

      return closed
    },

    async create({ context, driverIds, vehicleId }) {
      const companyId = context.companyId
      const vehicle = await resolveTripVehicleForCreation({ companyId, repository, vehicleId })
      const crew = await resolveTripCrewForCreation({ companyId, driverIds, repository })
      return repository.create({ companyId, crew, vehicleId: vehicle.id })
    },

    async deliverDocument({ context, documentId, tripId }) {
      const companyId = context.companyId
      await assertTripOpen({ companyId, repository, tripId })

      const document = await findTripDocumentOrThrow({ companyId, documentId, repository, tripId })
      if (document.deliveredAt !== null) return document

      const delivered = await repository.deliverDocument({ companyId, documentId, tripId })
      // O update é condicionado à viagem aberta: nulo aqui é nota inexistente ou fechamento
      // concorrente entre a leitura acima e a escrita.
      if (delivered === null) throw new TripDocumentNotFoundError()
      return delivered
    },

    async get({ context, tripId }) {
      return findTripOrThrow({ companyId: context.companyId, repository, tripId })
    },

    async linkDocument({ context, freightCalculationId, nfeDocumentId, tripId }) {
      assertTripDocumentReference({ freightCalculationId, nfeDocumentId })
      const companyId = context.companyId
      await assertTripOpen({ companyId, repository, tripId })
      return repository.linkDocument({ companyId, freightCalculationId, nfeDocumentId, tripId })
    },

    async list({ context, cursor, filters, limit }) {
      return repository.list({
        companyId: context.companyId,
        cursor,
        ...(filters === undefined ? {} : { filters }),
        limit,
      })
    },

    async releaseDocument({ context, documentId, tripId }) {
      const companyId = context.companyId
      await assertTripOpen({ companyId, repository, tripId })

      const document = await findTripDocumentOrThrow({ companyId, documentId, repository, tripId })
      if (document.deliveredAt !== null) throw new TripDocumentAlreadyDeliveredError()

      const released = await repository.releaseDocument({ companyId, documentId, tripId })
      // Corrida rara: a nota foi entregue/liberada entre a leitura acima e este update.
      if (released === null) throw new TripDocumentAlreadyDeliveredError()
      return released
    },
  }
}

async function findTripOrThrow(input: {
  readonly companyId: string
  readonly repository: TripRepositoryPort
  readonly tripId: string
}): Promise<TripDetail> {
  const trip = await input.repository.findById({ companyId: input.companyId, tripId: input.tripId })
  if (trip === null) throw new TripNotFoundError()
  return trip
}

/**
 * ADR-0043 §2, T013: vincular e desvincular selam a partir de `dispatched`, não só em `completed`
 * — a mesma porta de não-retorno de `separate`/`load` (T006), aplicada aqui via
 * `checkTripAcceptsLinkage` para não duplicar a lista de estados terminais em dois lugares.
 */
async function assertTripOpen(input: {
  readonly companyId: string
  readonly repository: TripRepositoryPort
  readonly tripId: string
}): Promise<void> {
  const trip = await findTripOrThrow(input)
  const reason = checkTripAcceptsLinkage(trip.status)
  if (reason !== null) throw new TripStateTransitionNotAllowedError(reason)
}

async function findTripDocumentOrThrow(input: {
  readonly companyId: string
  readonly documentId: string
  readonly repository: TripRepositoryPort
  readonly tripId: string
}): Promise<TripDocument> {
  const document = await input.repository.findDocumentById({
    companyId: input.companyId,
    documentId: input.documentId,
    tripId: input.tripId,
  })
  if (document === null) throw new TripDocumentNotFoundError()
  return document
}
