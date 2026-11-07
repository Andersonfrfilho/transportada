/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DRIVER_STOP_REMINDER_CHOICE_ACTION as ACTION,
  DRIVER_STOP_REMINDER_MAX_POSTPONEMENTS,
  DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME,
  DRIVER_STOP_REMINDER_SPEECH_NODE,
  DRIVER_STOP_REMINDER_STAGE,
} from './driver-stop-reminder.constant.js'
import type {
  DecideStopReminderPostponementParams,
  StopReminderChoiceAction,
  StopReminderMessage,
  StopReminderMessageInput,
  StopReminderPostponementResult,
} from './driver-stop-reminder.types.js'

export type { StopReminderMessageInput } from './driver-stop-reminder.types.js'

const ARRIVAL_ACTIONS = [ACTION.ARRIVED, ACTION.DELIVERED, ACTION.OCCURRENCE, ACTION.POSTPONE]
const SETTLEMENT_ACTIONS = [
  ACTION.DELIVERED,
  ACTION.NOT_DELIVERED,
  ACTION.OCCURRENCE,
  ACTION.POSTPONE,
]

function formatLocalTime(moment: Date | undefined, timeZone: string): string {
  if (!moment) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(moment)
}

function buildStopLabel(stop: StopReminderMessageInput['stop']): string {
  const extraNotes = stop.noteCount - 1
  const suffix = extraNotes > 0 ? ` +${extraNotes}` : ''
  return `NF ${stop.firstNoteNumber}${suffix} · ${stop.clientName}`
}

function buildOptions(
  actions: readonly StopReminderChoiceAction[],
): StopReminderMessage['options'] {
  return actions.map((action, index) => ({ choice: String(index + 1), action }))
}

export function buildStopReminderMessage(input: StopReminderMessageInput): StopReminderMessage {
  const base = { nome: input.driverName, parada: buildStopLabel(input.stop) }
  if (input.stage === DRIVER_STOP_REMINDER_STAGE.SETTLEMENT) {
    return {
      nodeKey: DRIVER_STOP_REMINDER_SPEECH_NODE.settlement,
      variables: { ...base, chegada: formatLocalTime(input.arrivedAt, input.timeZone) },
      options: buildOptions(SETTLEMENT_ACTIONS),
    }
  }
  const departure = { ...base, saida: formatLocalTime(input.departedAt, input.timeZone) }
  if (!input.isSharedPoint) {
    return {
      nodeKey: DRIVER_STOP_REMINDER_SPEECH_NODE.arrivalWithoutEstimate,
      variables: departure,
      options: buildOptions(ARRIVAL_ACTIONS),
    }
  }
  return {
    nodeKey: DRIVER_STOP_REMINDER_SPEECH_NODE.arrival,
    variables: { ...departure, previsao: formatLocalTime(input.expectedAt, input.timeZone) },
    options: buildOptions(ARRIVAL_ACTIONS),
  }
}

export function decideStopReminderPostponement(
  params: DecideStopReminderPostponementParams,
): StopReminderPostponementResult {
  const { postponements } = params
  if (postponements >= DRIVER_STOP_REMINDER_MAX_POSTPONEMENTS) {
    return {
      outcome: DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME.NO_ANSWER,
      postponements,
      consumesAttempt: true,
    }
  }
  return {
    outcome: DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME.POSTPONED,
    postponements: postponements + 1,
    consumesAttempt: false,
  }
}
