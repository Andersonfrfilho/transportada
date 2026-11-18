/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DRIVER_STOP_REMINDER_DUE_ACTION,
  DRIVER_STOP_REMINDER_FALLBACK_TRAVEL_SECONDS,
  DRIVER_STOP_REMINDER_STAGE,
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
} from './driver-stop-reminder.constant.js'
import type {
  ComputeNextStopReminderDueAtParams,
  ComputeStopReminderScheduleParams,
  DecideStopReminderDueActionParams,
  StopReminderDueAction,
  StopReminderSchedule,
} from './driver-stop-reminder.types.js'

/**
 * O prazo de cada etapa é o tempo esperado até o próximo marco mais a folga da empresa (`graceMinMinutes`; 90 em
 * produção desde 18/11/2026). Cada evento recebido reinicia o prazo: o lembrete da etapa anterior fecha e o da
 * etapa seguinte nasce ancorado no evento novo.
 * - arrival: viagem prevista + max(folga, % da viagem) — com o percentual em 0, viagem + folga;
 * - settlement: permanência esperada (`dwellMinutes`) + folga;
 * - idle: espera esperada até o próximo marco (`idleMinutes`) + folga.
 */
export function computeStopReminderSchedule(
  params: ComputeStopReminderScheduleParams,
): StopReminderSchedule {
  const { stage, anchorAt, travelSeconds, settings } = params
  if (stage === DRIVER_STOP_REMINDER_STAGE.IDLE) {
    const dueAt = new Date(
      anchorAt.getTime() +
        (settings.idleMinutes + settings.graceMinMinutes) * MILLISECONDS_PER_MINUTE,
    )
    return { expectedAt: anchorAt, dueAt }
  }
  if (stage === DRIVER_STOP_REMINDER_STAGE.SETTLEMENT) {
    const dueAt = new Date(
      anchorAt.getTime() +
        (settings.dwellMinutes + settings.graceMinMinutes) * MILLISECONDS_PER_MINUTE,
    )
    return { expectedAt: anchorAt, dueAt }
  }
  const travelMs =
    (travelSeconds ?? DRIVER_STOP_REMINDER_FALLBACK_TRAVEL_SECONDS) * MILLISECONDS_PER_SECOND
  const graceMs = Math.max(
    settings.graceMinMinutes * MILLISECONDS_PER_MINUTE,
    (travelMs * settings.gracePercent) / 100,
  )
  const expectedAt = new Date(anchorAt.getTime() + travelMs)
  return { expectedAt, dueAt: new Date(expectedAt.getTime() + graceMs) }
}

export function computeNextStopReminderDueAt(params: ComputeNextStopReminderDueAtParams): Date {
  return new Date(
    params.lastSentAt.getTime() + params.settings.intervalMinutes * MILLISECONDS_PER_MINUTE,
  )
}

export function decideStopReminderDueAction(
  params: DecideStopReminderDueActionParams,
): StopReminderDueAction {
  return params.attempts < params.maxAttempts
    ? DRIVER_STOP_REMINDER_DUE_ACTION.SEND
    : DRIVER_STOP_REMINDER_DUE_ACTION.ESCALATE
}
