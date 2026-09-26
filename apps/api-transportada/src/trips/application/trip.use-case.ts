/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { assertTripDocumentReference } from '../domain/trip.policy.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import {
  TRIP_ACTION,
  checkTripAcceptsLinkage,
  checkTripTransition,
} from '../domain/trip-state.policy.js'
import { checkTripCloseRequiresReason } from '../domain/trip-close.policy.js'
import {
  TripCloseReasonRequiredError,
  TripDocumentAlreadyDeliveredError,
  TripDocumentNotFoundError,
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
  TripVehicleNotFoundError,
} from '../domain/trip.error.js'
import type { PlanTripRouteTollFreezer } from './plan-trip-route.use-case.js'
import type { TripAmounts } from './read-trip-revenue-totals.use-case.js'
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
  /**
   * Spec 143 D4: ausente é "sugere pela duração estimada" — decisão da política, não daqui.
   * `| undefined` explícito porque o corpo chega direto do zod (`z.number().int().optional()`),
   * que sempre tipa o campo assim sob `exactOptionalPropertyTypes` — nunca `.default()` aqui.
   */
  readonly dailyAllowanceDays?: number | undefined
  readonly driverIds: readonly string[]
  readonly vehicleId: string
}

export type CloseTripInput = {
  readonly context: TripCompanyContext
  readonly correlationId: string
  readonly ipAddress: string
  /** Spec 156 T8c: obrigatório só quando a viagem tem nota em aberto — a política decide isso. */
  readonly reason: string | null
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

export type UpdateTripCrewInput = {
  readonly context: TripCompanyContext
  readonly driverIds: readonly string[]
  readonly tripId: string
  readonly vehicleId: string | undefined
}

export type TripUseCase = {
  close(input: CloseTripInput): Promise<TripDetail>
  create(input: CreateTripInput): Promise<TripDetail>
  get(input: GetTripInput): Promise<TripDetail>
  linkDocument(input: LinkTripDocumentInput): Promise<TripDocument>
  list(input: ListTripsInput): Promise<TripPage>
  releaseDocument(input: ReleaseTripDocumentInput): Promise<TripDocument>
  updateCrew(input: UpdateTripCrewInput): Promise<TripDetail>
}

export function createTripUseCase(dependencies: {
  /** O expurgo do rastro ao vivo no fechamento (ADR-0050 §5). */
  readonly locations: {
    purgeByTrip(input: { readonly companyId: string; readonly tripId: string }): Promise<void>
  }
  /**
   * Quanto a carga vale e quanto ela rende, por viagem da página. Opcional porque a listagem tem de
   * continuar respondendo sem ela — a coluna some, a tela não.
   */
  readonly amounts?: {
    read(input: {
      readonly companyId: string
      readonly tripIds: readonly string[]
    }): Promise<ReadonlyMap<string, TripAmounts>>
  }
  readonly repository: TripRepositoryPort
  /** Spec 153 D6: viagem ainda não despachada recalcula com `cheapest`. Ausente, comportamento igual a antes. */
  readonly routeFreezer?: PlanTripRouteTollFreezer
}): TripUseCase {
  const { repository, routeFreezer } = dependencies

  return {
    async close({ context, correlationId, ipAddress, reason, tripId }) {
      const trip = await findTripOrThrow({ companyId: context.companyId, repository, tripId })

      /**
       * Spec 158 T12 (PERGUNTAS-ABERTAS #28): `close` passa pela mesma máquina de estados das
       * demais transições manuais — sem isso, `cancelled → completed` era aceito.
       */
      const transition = checkTripTransition({
        action: TRIP_ACTION.close,
        hasRoute: false,
        tripStatus: trip.status,
      })
      if (transition.outcome === 'blocked') {
        throw new TripStateTransitionNotAllowedError(transition.reason)
      }
      if (transition.outcome === 'unchanged') return trip

      if (reason === null && checkTripCloseRequiresReason(trip.documents)) {
        throw new TripCloseReasonRequiredError()
      }

      const closed = await repository.close({
        actorUserId: context.userId,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        closeReason: reason,
        companyId: context.companyId,
        correlationId,
        ipAddress,
        onBehalfOfDriverId: null,
        tripId,
      })
      if (closed === null) throw new TripNotFoundError()

      /**
       * ADR-0050 §5: **o rastro morre com a viagem.** Fora da transição de propósito, como o
       * congelamento do resultado financeiro (ADR-0049): apagar dentro dela seguraria o fechamento
       * por uma varredura de tabela que só o portal lê. O que sobrevive é o carimbo da entrega.
       */
      await dependencies.locations.purgeByTrip({ companyId: context.companyId, tripId })

      return closed
    },

    async create({ context, dailyAllowanceDays, driverIds, vehicleId }) {
      const companyId = context.companyId
      const vehicle = await resolveTripVehicleForCreation({ companyId, repository, vehicleId })
      /**
       * `CreateTripInput.vehicleId` ainda é obrigatório nesta fase (spec 216 Fase 2 o torna
       * opcional) — `null` aqui seria uma inconsistência interna, nunca uma viagem sem veículo.
       */
      if (vehicle === null) throw new TripVehicleNotFoundError()
      const crew = await resolveTripCrewForCreation({ companyId, driverIds, repository })
      return repository.create({
        actorUserId: context.userId,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId,
        crew,
        ...(dailyAllowanceDays === undefined ? {} : { dailyAllowanceDays }),
        vehicleId: vehicle.id,
      })
    },

    async get({ context, tripId }) {
      return findTripOrThrow({ companyId: context.companyId, repository, tripId })
    },

    async linkDocument({ context, freightCalculationId, nfeDocumentId, tripId }) {
      assertTripDocumentReference({ freightCalculationId, nfeDocumentId })
      const companyId = context.companyId
      await assertTripOpen({ companyId, repository, tripId })
      const linked = await repository.linkDocument({
        companyId,
        freightCalculationId,
        nfeDocumentId,
        tripId,
      })
      await freezeRouteGracefully({ companyId, routeFreezer, tripId })
      return linked
    },

    async list({ context, cursor, filters, limit }) {
      const page = await repository.list({
        companyId: context.companyId,
        cursor,
        ...(filters === undefined ? {} : { filters }),
        limit,
      })

      /**
       * A conta de dinheiro é **opcional por dependência**, não por flag: instalação que não a
       * injeta continua listando viagem com `amounts: null`, e a tela imprime a coluna vazia em vez
       * de quebrar. É o mesmo desenho da porta de notificação do worker.
       */
      const amounts = await dependencies.amounts?.read({
        companyId: context.companyId,
        tripIds: page.items.map((trip) => trip.id),
      })
      if (amounts === undefined) return page

      return {
        ...page,
        items: page.items.map((trip) => ({ ...trip, amounts: amounts.get(trip.id) ?? null })),
      }
    },

    async releaseDocument({ context, documentId, tripId }) {
      const companyId = context.companyId
      await assertTripOpen({ companyId, repository, tripId })

      const document = await findTripDocumentOrThrow({ companyId, documentId, repository, tripId })
      if (document.deliveredAt !== null) throw new TripDocumentAlreadyDeliveredError()

      const released = await repository.releaseDocument({ companyId, documentId, tripId })
      // Corrida rara: a nota foi entregue/liberada entre a leitura acima e este update.
      if (released === null) throw new TripDocumentAlreadyDeliveredError()
      await freezeRouteGracefully({ companyId, routeFreezer, tripId })
      return released
    },

    /**
     * Spec 216: define a tripulação de `awaiting_crew` (vira `draft`) ou troca a de uma viagem já
     * `draft` — antes do roteiro planejado, nada calculado a partir do veículo (pedágio) foi
     * congelado ainda. `checkTripTransition` aqui é a checagem prévia (UX); `repository.updateCrew`
     * reconfere sob lock, porque este status é anterior à transação (mesmo padrão de `close`).
     */
    async updateCrew({ context, driverIds, tripId, vehicleId }) {
      const companyId = context.companyId
      const trip = await findTripOrThrow({ companyId, repository, tripId })

      const transition = checkTripTransition({
        action: TRIP_ACTION.defineCrew,
        hasRoute: false,
        tripStatus: trip.status,
      })
      if (transition.outcome === 'blocked') {
        throw new TripStateTransitionNotAllowedError(transition.reason)
      }

      const vehicle = await resolveTripVehicleForCreation({ companyId, repository, vehicleId })
      const crew = await resolveTripCrewForCreation({ companyId, driverIds, repository })

      const updated = await repository.updateCrew({
        actorUserId: context.userId,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId,
        crew,
        tripId,
        vehicleId: vehicle?.id ?? null,
      })
      if (updated === null) throw new TripNotFoundError()
      return updated
    },
  }
}

/**
 * D6/D5: vincular ou desvincular muda o conjunto de paradas — a rota gravada descreve uma
 * sequência que não existe mais. O congelamento roda **depois** da escrita principal e nunca a
 * derruba, mesmo `catch` de fallback gracioso do `plan-trip-route`.
 */
async function freezeRouteGracefully(input: {
  readonly companyId: string
  readonly routeFreezer: PlanTripRouteTollFreezer | undefined
  readonly tripId: string
}): Promise<void> {
  if (input.routeFreezer === undefined) return
  try {
    await input.routeFreezer.freeze({ companyId: input.companyId, tripId: input.tripId })
  } catch {
    /* o vínculo já está gravado; o pedágio congela no próximo replanejamento */
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
