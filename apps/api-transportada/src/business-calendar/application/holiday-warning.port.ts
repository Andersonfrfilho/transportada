/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6): o que quem avisa pede e recebe. Cada item tem uma `key` de quem chama (a
 * parada, ou cidade+data) e volta com o aviso dele; a cidade que o calendário recusou volta à parte, com o
 * código — quem chama decide se isso derruba a leitura ou só tira o aviso.
 */
import type { BusinessCalendarErrorCode } from '../domain/business-calendar.constant.js'
import type { BusinessCalendar, CivilDate } from '../domain/business-calendar.types.js'
import type { HolidayWarning } from '../domain/holiday-warning.policy.js'

export type HolidayWarningItem = {
  readonly cityIbgeCode: string
  /** Do endereço do destino físico, quando se sabe; ausente, o aviso sai sem a chave `cityName`. */
  readonly cityName?: string
  readonly date: CivilDate
  readonly key: string
}

export type ReadHolidayWarningsParams = {
  readonly companyId: string
  readonly items: readonly HolidayWarningItem[]
  /** Calendários que quem chama já carregou: se cobrem os anos dos itens, nada é lido de novo. */
  readonly knownCalendars?: ReadonlyMap<string, BusinessCalendar>
}

/** `referenceYear` é o ano corrente de quem lê: só as datas de um ano atrás a dois adiante entram na leitura. */
export type ReadHolidayWarningsInput = ReadHolidayWarningsParams & {
  readonly referenceYear: number
}

export type HolidayWarningsResult = {
  readonly refusals: ReadonlyMap<string, BusinessCalendarErrorCode>
  readonly warnings: ReadonlyMap<string, HolidayWarning>
}

export type HolidayWarningPort = {
  read(params: ReadHolidayWarningsParams): Promise<HolidayWarningsResult>
}
