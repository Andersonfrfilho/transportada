/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MunicipalHolidayKind } from '../domain/business-calendar.types.js'
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'

/**
 * O feriado é da cidade, e alimentado à mão: nenhuma fonte pública de feriado **municipal** é
 * confiável o bastante para virar dependência (ADR-0048 §3). `generatedByRuleId` nulo é a data
 * digitada; preenchido, ela nasceu de uma regra "todo ano" e só a regra a muda.
 */
export type MunicipalHoliday = {
  readonly cityIbgeCode: string
  readonly generatedByRuleId: string | null
  readonly holidayOn: string
  readonly id: string
  readonly kind: MunicipalHolidayKind
  readonly name: string
}

/** A data e a cidade são a identidade da linha: mudar uma delas é apagar e criar outra. */
export type MunicipalHolidayChanges = {
  readonly kind?: MunicipalHolidayKind
  readonly name?: string
}

export type SaveMunicipalHolidayInput = BusinessCalendarActor & {
  readonly cityIbgeCode: string
  readonly holidayOn: string
  /** Ausente: o feriado novo é `holiday` e o recadastro mantém o tipo que a linha já tinha. */
  readonly kind?: MunicipalHolidayKind
  readonly name: string
}

export type MunicipalHolidayPort = {
  list(input: {
    readonly cityIbgeCode?: string
    readonly companyId: string
    readonly from?: string
    readonly to?: string
  }): Promise<readonly MunicipalHoliday[]>
  /** Apagar o que não existe é no-op; a gerada por regra é 409 e a digitada sobre a regra volta a ser gerada. */
  remove(
    input: BusinessCalendarActor & { readonly currentYear: number; readonly id: string },
  ): Promise<void>
  /** Idempotente por `(company_id, city_ibge_code, holiday_on)`; sobre uma data gerada é adoção. */
  save(input: SaveMunicipalHolidayInput): Promise<MunicipalHoliday>
  update(
    input: BusinessCalendarActor & {
      readonly changes: MunicipalHolidayChanges
      readonly id: string
    },
  ): Promise<MunicipalHoliday | null>
}
