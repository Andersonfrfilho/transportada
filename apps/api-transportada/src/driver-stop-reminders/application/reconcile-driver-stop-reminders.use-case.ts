/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 (dono, 2026-11-07): o lembrete segue a viagem ativa, não só os eventos novos. A parada que já estava a
 * caminho quando a chave foi ligada nunca teria lembrete; a rotina do worker chama esta varredura a cada ciclo.
 */
import { computeStopReminderSchedule } from '../domain/stop-reminder-schedule.policy.js'
import type {
  DriverStopReminderRepository,
  OpenedStopReminder,
} from './driver-stop-reminder.port.js'
import type { DriverStopReminderReconciliationRepository } from './driver-stop-reminder-reconciliation.port.js'

export type ReconcileDriverStopRemindersUseCase = {
  execute(params: { readonly companyId: string }): Promise<{ readonly openedCount: number }>
}

export function createReconcileDriverStopRemindersUseCase(dependencies: {
  /** Refina a previsão depois que o lembrete abriu (o mesmo passo do evento). */
  readonly afterOpen?: (reminders: readonly OpenedStopReminder[]) => void
  readonly isEnabled: boolean
  readonly reconciliation: DriverStopReminderReconciliationRepository
  readonly reminders: Pick<DriverStopReminderRepository, 'open' | 'readSettings'>
}): ReconcileDriverStopRemindersUseCase {
  return {
    async execute({ companyId }) {
      if (!dependencies.isEnabled) return { openedCount: 0 }
      const missing = await dependencies.reconciliation.listMissingCurrentStages({ companyId })
      if (missing.length === 0) return { openedCount: 0 }
      const settings = await dependencies.reminders.readSettings({ companyId })
      const opened: OpenedStopReminder[] = []
      for (const item of missing) {
        const schedule = computeStopReminderSchedule({
          anchorAt: item.anchorAt,
          settings,
          stage: item.stage,
          travelSeconds: undefined,
        })
        const reminder = await dependencies.reminders.open({
          anchorAt: item.anchorAt,
          companyId,
          context: { driverId: item.driverId, stopId: item.stopId, tripId: item.tripId },
          dueAt: schedule.dueAt,
          expectedAt: schedule.expectedAt,
          stage: item.stage,
        })
        if (reminder !== undefined) opened.push({ companyId, reminderId: reminder.id })
      }
      dependencies.afterOpen?.(opened)
      return { openedCount: opened.length }
    },
  }
}
