/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BusinessCalendar } from '../../business-calendar/domain/business-calendar.types.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { DeliveryOutcomeKind } from '../domain/delivery-deadline-outcome.policy.js'

export type DeliveryDeadlineClock = { now(): Date }

export type DeliveryDeadlineReadContext = {
  readonly clock: DeliveryDeadlineClock
  readonly logger?: ApiLogger
}

export type DeliveryDeadlineNote = {
  readonly arrivedAt: Date | null
  /** A cópia gravada na chegada, nunca o perfil atual do contratante. */
  readonly deadlineBusinessDays: number | null
  readonly nfeDocumentId: string | null
  readonly outcomeKind: DeliveryOutcomeKind
  readonly tripDocumentId: string
}

/** O destino físico por nota fiscal (`listStopAddresses`): o código IBGE da cidade sai daqui. */
export type DeliveryDeadlineStopAddresses = ReadonlyMap<
  string,
  { readonly components: { readonly cityCode: string | null } }
>

export type ReadTripDeliveryDeadlinesParams = {
  /**
   * Recebe os calendários que a leitura montou (cidade → calendário), para quem vem depois na mesma leitura
   * aproveitar sem consultar de novo. Só é escrito; a leitura do prazo não depende dele.
   */
  readonly calendarSink?: Map<string, BusinessCalendar>
  readonly companyId: string
  readonly context: DeliveryDeadlineReadContext
  readonly notes: readonly DeliveryDeadlineNote[]
  readonly stopAddresses: DeliveryDeadlineStopAddresses
  readonly tripId: string
}

export type DeadlineCandidate = DeliveryDeadlineNote & {
  readonly arrivedAt: Date
  readonly deadlineBusinessDays: number
}

export type LocatedCandidate = {
  readonly cityIbgeCode: string
  readonly deliveredAt: Date | null
  readonly note: DeadlineCandidate
}
