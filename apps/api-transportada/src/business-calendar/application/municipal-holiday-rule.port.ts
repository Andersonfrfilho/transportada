/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MunicipalHolidayKind } from '../domain/business-calendar.types.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'

export type MunicipalHolidayRuleRecord = {
  readonly cityIbgeCode: string
  readonly createdAt: Date
  readonly day: number
  readonly id: string
  readonly kind: MunicipalHolidayKind
  /** Até que ano as datas fixas foram geradas: a tela avisa quando fica para trás. */
  readonly materializedThroughYear: number
  readonly month: number
  readonly name: string
  readonly updatedAt: Date
}

/** A cidade não se edita: outra cidade é outra regra. */
export type MunicipalHolidayRuleChanges = {
  readonly day?: number
  readonly kind?: MunicipalHolidayKind
  readonly month?: number
  readonly name?: string
}

export type MunicipalHolidayRuleFields = {
  readonly cityIbgeCode: string
  readonly day: number
  readonly kind: MunicipalHolidayKind
  readonly month: number
  readonly name: string
}

export type CreateMunicipalHolidayRuleResult = {
  /** `false` quando a regra idêntica já existia: a escrita é idempotente. */
  readonly created: boolean
  readonly rule: MunicipalHolidayRuleRecord
}

export type MaterializationSummary = {
  readonly holidaysCreated: number
  readonly rulesProcessed: number
}

type WithCurrentYear = { readonly currentYear: number }

/**
 * Todo método recebe a empresa do contexto. Toda escrita grava `audit_logs` na mesma transação,
 * sob um lock por empresa que serializa regras e datas.
 */
export type MunicipalHolidayRulePort = {
  create(
    input: BusinessCalendarActor & MunicipalHolidayRuleFields & WithCurrentYear,
  ): Promise<CreateMunicipalHolidayRuleResult>
  list(input: {
    readonly cityIbgeCode?: string
    readonly companyId: string
  }): Promise<readonly MunicipalHolidayRuleRecord[]>
  materialize(input: BusinessCalendarActor & WithCurrentYear): Promise<MaterializationSummary>
  remove(input: BusinessCalendarActor & { readonly id: string }): Promise<void>
  update(
    input: BusinessCalendarActor &
      WithCurrentYear & { readonly changes: MunicipalHolidayRuleChanges; readonly id: string },
  ): Promise<MunicipalHolidayRuleRecord | null>
}
