/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DriverStopReminderClosedReason,
  DriverStopReminderOriginKind,
  DriverStopReminderStage,
} from '../../shared/driver-stop-reminder.constant.js'
import type { TripFieldChannel } from '../../trips/domain/trip-field-channel.constant.js'
import type {
  GeoPoint,
  StopReminderEvent,
  StopReminderOpen,
  StopReminderSettings,
} from '../domain/driver-stop-reminder.types.js'

export type StopReminderStopContext = {
  readonly stopId: string
  readonly tripId: string
  /** Sem condutor definido (`awaiting_crew`) não há a quem cobrar: nada abre. */
  readonly driverId: string | undefined
}

export type OpenStopReminderParams = {
  readonly companyId: string
  readonly context: StopReminderStopContext
  readonly stage: DriverStopReminderStage
  readonly anchorAt: Date
  readonly expectedAt: Date
  readonly dueAt: Date
}

export type CloseStopReminderParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly reason: DriverStopReminderClosedReason
  readonly closedAt: Date
}

/** Leituras e escritas do lembrete **na transação do evento**. */
export type DriverStopReminderRepository = {
  readStopContexts(params: {
    readonly companyId: string
    readonly stopIds?: readonly string[]
    readonly documentIds?: readonly string[]
  }): Promise<readonly StopReminderStopContext[]>
  listPending(params: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly StopReminderOpen[]>
  readSettings(params: { readonly companyId: string }): Promise<StopReminderSettings>
  /** `undefined` quando o único parcial já tinha o par (parada, etapa) pendente. */
  open(params: OpenStopReminderParams): Promise<{ readonly id: string } | undefined>
  close(params: CloseStopReminderParams): Promise<void>
}

export type StopReminderTarget =
  | { readonly stopId: string }
  | { readonly documentIds: readonly string[] }

export type OnStopEventParams = {
  readonly companyId: string
  readonly kind: Exclude<StopReminderEvent['kind'], 'trip_closed' | 'trip_cancelled'>
  readonly channel: TripFieldChannel
  readonly occurredAt: Date
  readonly recordedTogether?: boolean
  readonly stopClosed?: boolean
  readonly target: StopReminderTarget
}

export type OnStopEventResult = { readonly openedReminderIds: readonly string[] }

/** O que o refino depois do commit precisa para achar o lembrete sem atravessar empresas. */
export type OpenedStopReminder = { readonly companyId: string; readonly reminderId: string }

/** O que o use case enxerga: um método, dentro da sua transação. */
export type DriverStopReminderEventSink = {
  onStopEvent(params: OnStopEventParams): Promise<OnStopEventResult>
}

export type StopReminderRefinementInput = {
  readonly reminderId: string
  readonly version: bigint
  readonly companyId: string
  readonly tripStopId: string
  readonly stage: DriverStopReminderStage
  readonly anchorAt: Date
  readonly settings: StopReminderSettings
  readonly sharedPoint: GeoPoint | undefined
  readonly previousStopPoint: GeoPoint | undefined
  readonly destination: GeoPoint | undefined
}

export type ApplyStopReminderRefinementParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly version: bigint
  readonly originKind: DriverStopReminderOriginKind
  readonly travelSeconds: number
  readonly expectedAt: Date
  readonly dueAt: Date
}

/** Leituras e escrita do refinamento, **fora** de qualquer transação de evento. */
export type DriverStopReminderRefinementRepository = {
  readRefinementInput(params: {
    readonly companyId: string
    readonly reminderId: string
  }): Promise<StopReminderRefinementInput | undefined>
  /** `false` quando o lembrete mudou (ou fechou) desde a leitura: a previsão velha não se grava. */
  applyRefinement(params: ApplyStopReminderRefinementParams): Promise<boolean>
}
