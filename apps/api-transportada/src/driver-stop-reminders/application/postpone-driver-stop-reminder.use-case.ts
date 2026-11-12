/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.3 (RF13): a opção 4 do lembrete adia pelo intervalo sem consumir tentativa, até 3 vezes por etapa. Esgotados,
 * a resposta conta como sem resposta: nada é gravado e o lembrete segue o relógio até a escalada.
 */
import {
  DRIVER_STOP_REMINDER_POSTPONE_OUTCOME,
  DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME,
  DRIVER_STOP_REMINDER_STATUS,
  MILLISECONDS_PER_MINUTE,
} from '../domain/driver-stop-reminder.constant.js'
import { decideStopReminderPostponement } from '../domain/stop-reminder-message.policy.js'
import type { DriverStopReminderPostponementRepository } from './driver-stop-reminder-postponement.port.js'

export type PostponeDriverStopReminderParams = {
  readonly companyId: string
  readonly reminderId: string
}

export type PostponeDriverStopReminderResult = {
  readonly outcome: (typeof DRIVER_STOP_REMINDER_POSTPONE_OUTCOME)[keyof typeof DRIVER_STOP_REMINDER_POSTPONE_OUTCOME]
}

export type PostponeDriverStopReminderUseCase = {
  execute(params: PostponeDriverStopReminderParams): Promise<PostponeDriverStopReminderResult>
}

const OUTCOME = DRIVER_STOP_REMINDER_POSTPONE_OUTCOME

export function createPostponeDriverStopReminderUseCase(dependencies: {
  readonly clock?: () => Date
  readonly repository: DriverStopReminderPostponementRepository
}): PostponeDriverStopReminderUseCase {
  const { repository } = dependencies
  const clock = dependencies.clock ?? (() => new Date())

  return {
    async execute({ companyId, reminderId }) {
      const reminder = await repository.find({ companyId, reminderId })
      if (reminder?.status !== DRIVER_STOP_REMINDER_STATUS.PENDING)
        return { outcome: OUTCOME.CLOSED }
      const decision = decideStopReminderPostponement({ postponements: reminder.postponements })
      if (decision.outcome === DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME.NO_ANSWER) {
        return { outcome: OUTCOME.NO_ANSWER }
      }
      const now = clock()
      const intervalMinutes = await repository.readIntervalMinutes(companyId)
      const isApplied = await repository.applyPostponement({
        companyId,
        dueAt: new Date(now.getTime() + intervalMinutes * MILLISECONDS_PER_MINUTE),
        now,
        postponements: reminder.postponements,
        reminderId,
      })
      return { outcome: isApplied ? OUTCOME.POSTPONED : OUTCOME.CLOSED }
    },
  }
}
