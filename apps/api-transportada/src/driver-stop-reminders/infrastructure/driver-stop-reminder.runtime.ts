/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import type { RouteGeometryPort } from '../../trips/application/route-geometry.port.js'
import type { RouteDepot } from '../../trips/domain/route-depot.policy.js'
import type { TripDatabase, TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type {
  DriverStopReminderEventSink,
  OpenedStopReminder,
} from '../application/driver-stop-reminder.port.js'
import { createDriverStopReminderService } from '../application/driver-stop-reminder.service.js'
import { createDriverStopReminderRefiner } from '../application/refine-driver-stop-reminder-schedule.service.js'
import { DrizzleDriverStopReminderRefinementRepository } from './drizzle-driver-stop-reminder-refinement.repository.js'
import { DrizzleDriverStopReminderRepository } from './drizzle-driver-stop-reminder.repository.js'

/** Existe só com `DRIVER_REMINDERS_ENABLED`: sem ele a unidade de trabalho não recebe runtime e nada é gravado. */
export type DriverStopReminderRuntime = {
  createEventSink(executor: TripQueryable): DriverStopReminderEventSink
  /** Dispara o refinamento (OSRM) depois do commit; nunca lança. */
  refineAfterCommit(reminders: readonly OpenedStopReminder[]): void
  /** Espera os refinamentos em andamento — testes e desligamento. */
  idle(): Promise<void>
}

export function createDriverStopReminderRuntime(dependencies: {
  readonly database: TripDatabase
  readonly logger?: ApiLogger
  readonly readDepot: (input: { readonly companyId: string }) => Promise<RouteDepot>
  readonly routing?: RouteGeometryPort | undefined
}): DriverStopReminderRuntime {
  const refiner = createDriverStopReminderRefiner({
    logger: dependencies.logger,
    readDepot: dependencies.readDepot,
    repository: new DrizzleDriverStopReminderRefinementRepository(dependencies.database),
    routing: dependencies.routing,
  })
  const inFlight = new Set<Promise<void>>()

  return {
    createEventSink: (executor) =>
      createDriverStopReminderService({
        repository: new DrizzleDriverStopReminderRepository(executor, dependencies.logger),
      }),
    idle: async () => {
      await Promise.all([...inFlight])
    },
    refineAfterCommit(reminders) {
      for (const { companyId, reminderId } of reminders) {
        const task = refiner.refine({ companyId, reminderId }).catch((error: unknown) => {
          dependencies.logger?.warn('driver_stop_reminder_refinement_failed', {
            reason: error instanceof Error ? error.name : 'unknown',
            reminderId,
          })
        })
        inFlight.add(task)
        void task.finally(() => inFlight.delete(task))
      }
    },
  }
}
