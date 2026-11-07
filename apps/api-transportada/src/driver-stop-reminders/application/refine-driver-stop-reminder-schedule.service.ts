/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteGeometryPort } from '../../trips/application/route-geometry.port.js'
import type { RouteDepot } from '../../trips/domain/route-depot.policy.js'
import { DRIVER_STOP_REMINDER_STAGE } from '../domain/driver-stop-reminder.constant.js'
import { resolveStopReminderOrigin } from '../domain/stop-reminder-origin.policy.js'
import { computeStopReminderSchedule } from '../domain/stop-reminder-schedule.policy.js'
import type { DriverStopReminderRefinementRepository } from './driver-stop-reminder.port.js'

export type DriverStopReminderRefiner = {
  refine(params: { readonly reminderId: string }): Promise<void>
}

/**
 * Depois do commit: troca a reserva de 45 min pela estrada do OSRM. Sem origem, sem destino ou sem estrada o
 * lembrete fica como nasceu (`origin_kind = 'fallback'`) — nunca erro para quem registrou o evento.
 */
export function createDriverStopReminderRefiner(dependencies: {
  readonly repository: DriverStopReminderRefinementRepository
  readonly routing: RouteGeometryPort | undefined
  readonly readDepot: (input: { readonly companyId: string }) => Promise<RouteDepot>
}): DriverStopReminderRefiner {
  const { readDepot, repository, routing } = dependencies

  return {
    async refine({ reminderId }) {
      if (routing === undefined) return
      const input = await repository.readRefinementInput({ reminderId })
      if (input?.destination === undefined) return

      const depot = await readDepot({ companyId: input.companyId })
      const origin = resolveStopReminderOrigin({
        companyPoint: depot.status === 'resolved' ? depot.origin : undefined,
        previousStopPoint: input.previousStopPoint,
        sharedPoint: input.sharedPoint,
      })
      if (origin.point === undefined) return

      const road = await routing.readRouteGeometry([origin.point, input.destination])
      const leg = road?.legs[0]
      if (leg === undefined) return

      const travelSeconds = Math.round(leg.durationSeconds)
      const schedule = computeStopReminderSchedule({
        anchorAt: input.anchorAt,
        settings: input.settings,
        stage: DRIVER_STOP_REMINDER_STAGE.ARRIVAL,
        travelSeconds,
      })
      await repository.applyRefinement({
        dueAt: schedule.dueAt,
        expectedAt: schedule.expectedAt,
        originKind: origin.kind,
        reminderId,
        travelSeconds,
        version: input.version,
      })
    },
  }
}
