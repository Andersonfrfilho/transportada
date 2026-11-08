/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.7 (RF21): a varredura da etapa `idle`, separada da varredura das etapas de parada. A rota de
 * reconciliação executa as duas.
 */
import { DRIVER_STOP_REMINDER_STAGE } from '../domain/driver-stop-reminder.constant.js'
import { computeStopReminderSchedule } from '../domain/stop-reminder-schedule.policy.js'
import type { DriverStopReminderRepository } from './driver-stop-reminder.port.js'
import type { DriverStopReminderIdleReconciliationRepository } from './driver-stop-reminder-idle-reconciliation.port.js'

export type ReconcileIdleDriverStopRemindersUseCase = {
  execute(params: { readonly companyId: string }): Promise<{ readonly openedCount: number }>
}

export function createReconcileIdleDriverStopRemindersUseCase(dependencies: {
  readonly isEnabled: boolean
  readonly reconciliation: DriverStopReminderIdleReconciliationRepository
  readonly reminders: Pick<DriverStopReminderRepository, 'open' | 'readSettings'>
}): ReconcileIdleDriverStopRemindersUseCase {
  return {
    async execute({ companyId }) {
      if (!dependencies.isEnabled) return { openedCount: 0 }
      const missing = await dependencies.reconciliation.listMissingIdleStages({ companyId })
      if (missing.length === 0) return { openedCount: 0 }
      const settings = await dependencies.reminders.readSettings({ companyId })
      let openedCount = 0
      for (const item of missing) {
        const schedule = computeStopReminderSchedule({
          anchorAt: item.anchorAt,
          settings,
          stage: DRIVER_STOP_REMINDER_STAGE.IDLE,
          travelSeconds: undefined,
        })
        const reminder = await dependencies.reminders.open({
          anchorAt: item.anchorAt,
          companyId,
          context: { driverId: item.driverId, stopId: item.stopId, tripId: item.tripId },
          dueAt: schedule.dueAt,
          expectedAt: schedule.expectedAt,
          stage: DRIVER_STOP_REMINDER_STAGE.IDLE,
        })
        if (reminder !== undefined) openedCount += 1
      }
      return { openedCount }
    },
  }
}

/** A rota de reconciliação roda as varreduras em sequência (a das etapas de parada e a do `idle`) e soma o que abriu. */
export function combineStopReminderReconciliations(
  reconciliations: readonly ReconcileIdleDriverStopRemindersUseCase[],
): ReconcileIdleDriverStopRemindersUseCase {
  return {
    async execute(params) {
      let openedCount = 0
      for (const reconciliation of reconciliations) {
        openedCount += (await reconciliation.execute(params)).openedCount
      }
      return { openedCount }
    },
  }
}
