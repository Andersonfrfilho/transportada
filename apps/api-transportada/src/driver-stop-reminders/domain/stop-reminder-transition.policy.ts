/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DRIVER_STOP_REMINDER_STAGE } from './driver-stop-reminder.constant.js'
import type {
  DecideStopReminderTransitionParams,
  StopReminderOpen,
  StopReminderTransitionAction,
} from './driver-stop-reminder.types.js'
import type { DriverStopReminderClosedReason } from '../../shared/driver-stop-reminder.constant.js'

export type { StopReminderEvent, StopReminderOpen } from './driver-stop-reminder.types.js'

function closeAll(
  reminders: readonly StopReminderOpen[],
  reason: DriverStopReminderClosedReason,
): StopReminderTransitionAction[] {
  return reminders.map((reminder) => ({ type: 'close', reminderId: reminder.id, reason }))
}

function decideDeparture(
  params: DecideStopReminderTransitionParams,
): StopReminderTransitionAction[] {
  const { event, openReminders } = params
  const abandoned = openReminders.filter((reminder) => reminder.stopId !== event.stopId)
  const hasArrivalOpen = openReminders.some(
    (reminder) =>
      reminder.stopId === event.stopId && reminder.stage === DRIVER_STOP_REMINDER_STAGE.ARRIVAL,
  )
  const actions = closeAll(abandoned, 'superseded')
  if (hasArrivalOpen) return actions
  return [
    ...actions,
    { type: 'open', stopId: event.stopId, stage: DRIVER_STOP_REMINDER_STAGE.ARRIVAL },
  ]
}

function decideArrival(params: DecideStopReminderTransitionParams): StopReminderTransitionAction[] {
  const { event, openReminders } = params
  const ofStop = openReminders.filter((reminder) => reminder.stopId === event.stopId)
  const arrivals = ofStop.filter(
    (reminder) => reminder.stage === DRIVER_STOP_REMINDER_STAGE.ARRIVAL,
  )
  const hasSettlementOpen = ofStop.some(
    (reminder) => reminder.stage === DRIVER_STOP_REMINDER_STAGE.SETTLEMENT,
  )
  const actions = closeAll(arrivals, 'arrived')
  if (hasSettlementOpen) return actions
  return [
    ...actions,
    { type: 'open', stopId: event.stopId, stage: DRIVER_STOP_REMINDER_STAGE.SETTLEMENT },
  ]
}

export function decideStopReminderTransition(
  params: DecideStopReminderTransitionParams,
): readonly StopReminderTransitionAction[] {
  const { event, openReminders } = params
  const ofStop = openReminders.filter((reminder) => reminder.stopId === event.stopId)
  switch (event.kind) {
    case 'departed':
      return decideDeparture(params)
    case 'departure_cancelled':
      return closeAll(ofStop, 'departure_cancelled')
    case 'arrived':
      return decideArrival(params)
    case 'delivered':
    case 'returned':
      if (event.stopClosed) return closeAll(ofStop, 'stop_closed')
      return closeAll(
        ofStop.filter((reminder) => reminder.stage === DRIVER_STOP_REMINDER_STAGE.ARRIVAL),
        'arrived',
      )
    case 'occurrence':
      return closeAll(ofStop, 'occurrence')
    case 'trip_closed':
      return closeAll(openReminders, 'trip_closed')
    case 'trip_cancelled':
      return closeAll(openReminders, 'trip_cancelled')
  }
}
