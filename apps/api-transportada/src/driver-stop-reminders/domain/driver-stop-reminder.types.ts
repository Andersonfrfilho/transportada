/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DRIVER_STOP_REMINDER_CHOICE_ACTION,
  DRIVER_STOP_REMINDER_DEFER_REASON,
  DRIVER_STOP_REMINDER_DUE_ACTION,
  DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME,
} from './driver-stop-reminder.constant.js'
import type {
  DriverStopReminderClosedReason,
  DriverStopReminderOriginKind,
  DriverStopReminderStage,
} from '../../shared/driver-stop-reminder.constant.js'

export type StopReminderSettings = {
  readonly maxAttempts: number
  readonly intervalMinutes: number
  readonly graceMinMinutes: number
  readonly gracePercent: number
  readonly dwellMinutes: number
}

export type ComputeStopReminderScheduleParams = {
  readonly stage: DriverStopReminderStage
  readonly anchorAt: Date
  readonly travelSeconds: number | undefined
  readonly settings: StopReminderSettings
}

export type StopReminderSchedule = { readonly expectedAt: Date; readonly dueAt: Date }

export type ComputeNextStopReminderDueAtParams = {
  readonly lastSentAt: Date
  readonly settings: Pick<StopReminderSettings, 'intervalMinutes'>
}

export type DecideStopReminderDueActionParams = {
  readonly attempts: number
  readonly maxAttempts: number
}

export type StopReminderDueAction =
  (typeof DRIVER_STOP_REMINDER_DUE_ACTION)[keyof typeof DRIVER_STOP_REMINDER_DUE_ACTION]

export type GeoPoint = { readonly latitude: number; readonly longitude: number }

export type ResolveStopReminderOriginParams = {
  readonly sharedPoint?: GeoPoint | undefined
  readonly previousStopPoint?: GeoPoint | undefined
  readonly companyPoint?: GeoPoint | undefined
}

export type StopReminderOriginResult = {
  readonly kind: DriverStopReminderOriginKind
  readonly point: GeoPoint | undefined
  readonly isSharedPoint: boolean
}

export type StopReminderEvent = {
  readonly kind:
    | 'departed'
    | 'departure_cancelled'
    | 'arrived'
    | 'delivered'
    | 'returned'
    | 'occurrence'
    | 'trip_closed'
    | 'trip_cancelled'
  readonly stopId: string
  readonly authorship?: 'crew' | 'office'
  readonly recordedTogether: boolean
  readonly stopClosed: boolean
}

export type StopReminderOpen = {
  readonly id: string
  readonly stopId: string
  readonly stage: DriverStopReminderStage
}

export type DecideStopReminderTransitionParams = {
  readonly event: StopReminderEvent
  readonly openReminders: readonly StopReminderOpen[]
}

export type StopReminderTransitionAction =
  | { readonly type: 'open'; readonly stopId: string; readonly stage: DriverStopReminderStage }
  | {
      readonly type: 'close'
      readonly reminderId: string
      readonly reason: DriverStopReminderClosedReason
    }

export type OperatingHoursRange = {
  readonly weekday: number
  readonly start: string
  readonly end: string
}

/** O que a empresa configura (RF19): os números da cobrança, o interruptor e o horário de funcionamento. */
export type StopReminderCompanySettings = StopReminderSettings & {
  readonly enabled: boolean
  readonly operatingHours: readonly OperatingHoursRange[]
}

export type StopReminderGateInput = {
  readonly now: Date
  readonly stage: DriverStopReminderStage
  readonly stop: { readonly hasArrived: boolean; readonly isClosed: boolean }
  readonly operatingHours: readonly OperatingHoursRange[]
  readonly holidayDates: readonly string[]
  readonly timeZone: string
  readonly hasOpenQuestion: boolean
  readonly sendSlotAt?: Date | undefined
}

export type StopReminderGateResult =
  | { readonly decision: 'send' }
  | { readonly decision: 'close' }
  | {
      readonly decision: 'defer'
      readonly reason: (typeof DRIVER_STOP_REMINDER_DEFER_REASON)[keyof typeof DRIVER_STOP_REMINDER_DEFER_REASON]
      readonly until: Date
    }

export type StopReminderMessageInput = {
  readonly stage: DriverStopReminderStage
  readonly driverName: string
  /** O bloco da parada já montado (vazio quando a leitura falhou: melhor esforço). */
  readonly stopBlock: string
  readonly departedAt?: Date | undefined
  readonly expectedAt?: Date | undefined
  readonly arrivedAt?: Date | undefined
  readonly isSharedPoint: boolean
  /** O instante da cobrança: decide se a saída/chegada foi hoje, ontem ou antes, no dia local da empresa. */
  readonly now: Date
  readonly timeZone: string
}

export type StopReminderChoiceAction =
  (typeof DRIVER_STOP_REMINDER_CHOICE_ACTION)[keyof typeof DRIVER_STOP_REMINDER_CHOICE_ACTION]

export type StopReminderMessage = {
  readonly nodeKey: string
  readonly variables: Readonly<Record<string, string>>
  readonly options: readonly {
    readonly choice: string
    readonly action: StopReminderChoiceAction
  }[]
}

export type DecideStopReminderPostponementParams = { readonly postponements: number }

export type StopReminderPostponementResult = {
  readonly outcome: (typeof DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME)[keyof typeof DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME]
  readonly postponements: number
  readonly consumesAttempt: boolean
}
