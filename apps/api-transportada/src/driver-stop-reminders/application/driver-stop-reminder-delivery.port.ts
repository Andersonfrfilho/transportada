/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DriverStopReminderChannel,
  DriverStopReminderClosedReason,
  DriverStopReminderOriginKind,
  DriverStopReminderStage,
} from '../../shared/driver-stop-reminder.constant.js'
import type {
  OperatingHoursRange,
  StopReminderSettings,
} from '../domain/driver-stop-reminder.types.js'

export type DeliverableStopReminder = {
  readonly id: string
  readonly companyId: string
  readonly tripId: string
  readonly tripStopId: string
  readonly driverId: string
  readonly stage: DriverStopReminderStage
  readonly status: string
  readonly attempts: number
  readonly postponements: number
  readonly version: bigint
  readonly anchorAt: Date
  readonly expectedAt: Date | null
  readonly originKind: DriverStopReminderOriginKind
  readonly dueAt: Date
}

export type StopReminderDeliveryContext = {
  readonly settings: StopReminderSettings & {
    readonly enabled: boolean
    readonly operatingHours: readonly OperatingHoursRange[]
  }
  readonly timeZone: string
  readonly holidayDates: readonly string[]
  readonly stop: {
    readonly hasArrived: boolean
    readonly isClosed: boolean
    readonly firstNoteNumber: string
    readonly noteCount: number
    readonly clientName: string
  }
  /** O motorista **atual** da viagem (a troca de tripulação não reatribui o lembrete). */
  readonly driver: { readonly id: string; readonly name: string }
  readonly groupJid: string | undefined
  /** A próxima vaga de envio do Evolution (289), lida sem reservar. */
  readonly sendSlotAt: Date | undefined
}

export type ReserveStopReminderAttemptParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly version: bigint
  readonly now: Date
  readonly dispatchingUntil: Date
}

export type RecordStopReminderSentParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly sentAt: Date
  readonly nextDueAt: Date
  readonly channel: DriverStopReminderChannel
  readonly providerMessageId: string | null
}

export type CloseDeliveredStopReminderParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly reason: DriverStopReminderClosedReason
  readonly closedAt: Date
}

export type ReleaseStopReminderParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly dueAt: Date
}

export type EscalateStopReminderParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly escalatedAt: Date
}

/** Leitura e escrita da entrega: toda consulta e todo `UPDATE` leva `companyId` (RNF5). */
export type DriverStopReminderDeliveryRepository = {
  findReminder(params: {
    readonly companyId: string
    readonly reminderId: string
  }): Promise<DeliverableStopReminder | undefined>
  readContext(params: {
    readonly reminder: DeliverableStopReminder
    readonly now: Date
  }): Promise<StopReminderDeliveryContext>
  /** `UPDATE … WHERE id AND version AND status='pending'`: `false` quando outra entrega chegou primeiro. */
  reserveAttempt(params: ReserveStopReminderAttemptParams): Promise<boolean>
  recordSent(params: RecordStopReminderSentParams): Promise<void>
  /** Devolve a reserva sem consumir tentativa e marca o próximo vencimento. */
  release(params: ReleaseStopReminderParams): Promise<void>
  close(params: CloseDeliveredStopReminderParams): Promise<void>
  escalate(params: EscalateStopReminderParams): Promise<void>
}
