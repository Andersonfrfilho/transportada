/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStopScheduleStatus } from '../../database/delivery-client.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ApiError } from '../../shared/api.error.js'

export type TripStopSchedule = {
  readonly divergedAt: string | null
  readonly id: string
  readonly notes: string
  readonly protocol: string
  readonly scheduledAt: string | null
  readonly status: TripStopScheduleStatus
  readonly stopId: string
}

export type TripStopScheduleWrite = {
  readonly notes: string
  readonly protocol: string
  readonly scheduledAt: string | null
  readonly status: TripStopScheduleStatus
}

export type TripStopSchedulePort = {
  listByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripStopSchedule[]>
  /** `null` quando a parada não é desta viagem nesta empresa — existir já é informação. */
  save(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly stopId: string
    readonly tripId: string
    readonly values: TripStopScheduleWrite
  }): Promise<TripStopSchedule | null>
}

export class TripStopNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'TRIP_STOP_NOT_FOUND', message: 'Trip stop was not found', status: 404 })
  }
}

export class TripStopScheduleIncompleteError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_STOP_SCHEDULE_INCOMPLETE',
      details: [{ field: 'scheduledAt', message: 'confirmed schedules require a date and time' }],
      message: 'A confirmed schedule requires the scheduled date and time',
      status: 422,
    })
  }
}

export type TripStopSchedulesUseCase = {
  list(input: {
    readonly context: CompanyContext
    readonly tripId: string
  }): Promise<readonly TripStopSchedule[]>
  save(input: {
    readonly context: CompanyContext
    readonly stopId: string
    readonly tripId: string
    readonly values: TripStopScheduleWrite
  }): Promise<TripStopSchedule>
}

/**
 * Spec 060 D3: o agendamento é pendência da parada, e ele **bloqueia o despacho**. Esta é a mão que
 * o operador usa: pedir, confirmar com hora e protocolo, ou registrar a recusa do cliente.
 *
 * O protocolo viaja até o motorista (057): ele chega na portaria e precisa dizer o número. Um
 * agendamento que o sistema conhece e o motorista não é um agendamento que não existe.
 */
export function createTripStopSchedulesUseCase(dependencies: {
  readonly repository: TripStopSchedulePort
}): TripStopSchedulesUseCase {
  return {
    async list({ context, tripId }) {
      return dependencies.repository.listByTrip({ companyId: context.companyId, tripId })
    },
    async save({ context, stopId, tripId, values }) {
      /** Confirmado sem hora é agendamento que ninguém cumpre — e o banco recusaria adiante. */
      if (values.status === 'confirmed' && values.scheduledAt === null) {
        throw new TripStopScheduleIncompleteError()
      }

      const saved = await dependencies.repository.save({
        actorUserId: context.userId,
        companyId: context.companyId,
        stopId,
        tripId,
        values,
      })
      if (saved === null) throw new TripStopNotFoundError()

      return saved
    },
  }
}
