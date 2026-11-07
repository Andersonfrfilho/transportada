/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { decideStopReminderTransition } from '../domain/stop-reminder-transition.policy.js'
import { computeStopReminderSchedule } from '../domain/stop-reminder-schedule.policy.js'
import type { StopReminderEvent } from '../domain/driver-stop-reminder.types.js'
import type {
  DriverStopReminderEventSink,
  DriverStopReminderRepository,
  OnStopEventParams,
  OnStopEventResult,
  StopReminderStopContext,
} from './driver-stop-reminder.port.js'

export function createDriverStopReminderService(dependencies: {
  readonly repository: DriverStopReminderRepository
}): DriverStopReminderEventSink {
  const { repository } = dependencies

  async function applyForStop(
    params: OnStopEventParams,
    context: StopReminderStopContext,
  ): Promise<readonly string[]> {
    const event: StopReminderEvent = {
      kind: params.kind,
      recordedTogether: params.recordedTogether ?? false,
      stopClosed: params.stopClosed ?? false,
      stopId: context.stopId,
    }
    const openReminders = await repository.listPending({
      companyId: params.companyId,
      tripId: context.tripId,
    })
    const actions = decideStopReminderTransition({ event, openReminders })
    const settings = await repository.readSettings({ companyId: params.companyId })
    const openedReminderIds: string[] = []

    // Em sequência de propósito: fechar a etapa velha antes de abrir a nova, que dividem o único parcial.
    for (const action of actions) {
      if (action.type === 'close') {
        await repository.close({
          closedAt: params.occurredAt,
          companyId: params.companyId,
          reason: action.reason,
          reminderId: action.reminderId,
        })
        continue
      }
      if (context.driverId === undefined) continue
      const schedule = computeStopReminderSchedule({
        anchorAt: params.occurredAt,
        settings,
        stage: action.stage,
        travelSeconds: undefined,
      })
      const opened = await repository.open({
        anchorAt: params.occurredAt,
        companyId: params.companyId,
        context,
        dueAt: schedule.dueAt,
        expectedAt: schedule.expectedAt,
        stage: action.stage,
      })
      if (opened !== undefined) openedReminderIds.push(opened.id)
    }
    return openedReminderIds
  }

  return {
    async onStopEvent(params): Promise<OnStopEventResult> {
      const contexts = await repository.readStopContexts({
        companyId: params.companyId,
        ...('stopId' in params.target
          ? { stopIds: [params.target.stopId] }
          : { documentIds: params.target.documentIds }),
      })
      const openedReminderIds: string[] = []
      for (const context of contexts) {
        openedReminderIds.push(...(await applyForStop(params, context)))
      }
      return { openedReminderIds }
    },
  }
}
