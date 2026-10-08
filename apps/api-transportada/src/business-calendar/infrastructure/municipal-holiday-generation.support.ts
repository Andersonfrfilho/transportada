/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { listMaterializationDates } from '../application/municipal-holiday-materialization.service.js'
import type { MunicipalHolidayKind } from '../domain/business-calendar.types.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'

/** Bem abaixo do teto de parâmetros do Postgres (65 535) com seis colunas por linha. */
const INSERT_CHUNK_SIZE = 1000

export type GenerationRule = {
  readonly cityIbgeCode: string
  readonly companyId: string
  readonly day: number
  readonly id: string
  readonly kind: MunicipalHolidayKind
  readonly month: number
  readonly name: string
}

type GenerateParams = {
  readonly fromYear: number
  readonly rules: readonly GenerationRule[]
  readonly toYear: number
  readonly transaction: BusinessCalendarTransaction
}

/**
 * `DO NOTHING`, nunca `DO UPDATE`: a data que o operador já digitou naquele dia vence a da regra, e
 * rodar de novo devolve o mesmo conjunto. Devolve quantas linhas nasceram de fato.
 */
export async function insertGeneratedHolidays({
  fromYear,
  rules,
  toYear,
  transaction,
}: GenerateParams): Promise<number> {
  const rows = rules.flatMap((rule) =>
    listMaterializationDates({ day: rule.day, fromYear, month: rule.month, toYear }).map(
      (holidayOn) => ({
        cityIbgeCode: rule.cityIbgeCode,
        companyId: rule.companyId,
        holidayOn,
        kind: rule.kind,
        name: rule.name,
        sourceRuleId: rule.id,
      }),
    ),
  )
  let created = 0
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_SIZE) {
    const inserted = await transaction
      .insert(municipalHolidays)
      .values(rows.slice(start, start + INSERT_CHUNK_SIZE))
      .onConflictDoNothing({
        target: [
          municipalHolidays.companyId,
          municipalHolidays.cityIbgeCode,
          municipalHolidays.holidayOn,
        ],
      })
      .returning({ id: municipalHolidays.id })
    created += inserted.length
  }
  return created
}
