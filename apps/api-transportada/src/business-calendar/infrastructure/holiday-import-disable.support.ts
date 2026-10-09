/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §4): desligar um feriado importado. A linha da empresa é apagada, a supressão é
 * gravada (sem ela a data voltaria no ciclo seguinte da rotina) e a auditoria registra o ator, tudo na
 * transação de quem chama. Só vale de hoje em diante (D7): apagar a data passada mudaria o selo de prazo
 * de uma nota já entregue. É o que o `DELETE` da 238 faz numa linha importada, e o que a rota de gestão faz.
 */
import { and, eq, sql } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { holidayImportSuppressions } from '../../database/holiday-import.schema.js'
import { stateHolidays } from '../../database/state-holiday.schema.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../../shared/holiday-provider.constant.js'
import type { BusinessCalendarActor } from '../application/business-calendar-actor.types.js'
import { BUSINESS_CALENDAR_AUDIT_ACTION } from '../domain/business-calendar-audit.constant.js'
import { ImportedHolidayInThePastError } from '../domain/business-calendar-rule.error.js'
import { CITY_IBGE_CODE_PATTERN } from '../domain/business-calendar.constant.js'
import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'
import { toStateRecord } from './business-calendar-rule.mapper.js'
import { audit, regenerateRuleDate } from './municipal-holiday.support.js'
import { appendAudit } from './state-holiday.support.js'

export type SuppressionRow = typeof holidayImportSuppressions.$inferSelect
type MunicipalRow = typeof municipalHolidays.$inferSelect
type StateRow = typeof stateHolidays.$inferSelect

type InsertSuppressionParams = {
  readonly actor: BusinessCalendarActor
  readonly holidayOn: string
  readonly ibgeCode: string
  readonly scope: SuppressionRow['scope']
  readonly transaction: BusinessCalendarTransaction
}

/** Datas civis em texto `YYYY-MM-DD` ordenam como texto: hoje ainda desliga, ontem não. */
function assertNotInThePast(input: { readonly holidayOn: string; readonly today: string }): void {
  if (input.holidayOn < input.today) throw new ImportedHolidayInThePastError()
}

/** Desligar de novo o que já está desligado só renova quem e quando: a supressão é uma por data. */
async function upsertSuppression(input: InsertSuppressionParams): Promise<SuppressionRow> {
  const { actor } = input
  const [row] = await input.transaction
    .insert(holidayImportSuppressions)
    .values({
      companyId: actor.companyId,
      holidayOn: input.holidayOn,
      ibgeCode: input.ibgeCode,
      scope: input.scope,
      suppressedByUserId: actor.userId,
    })
    .onConflictDoUpdate({
      set: { suppressedAt: sql`now()`, suppressedByUserId: actor.userId },
      target: [
        holidayImportSuppressions.companyId,
        holidayImportSuppressions.scope,
        holidayImportSuppressions.ibgeCode,
        holidayImportSuppressions.holidayOn,
      ],
    })
    .returning()
  return requirePersistedRow(row)
}

type DisableMunicipalParams = {
  readonly actor: BusinessCalendarActor
  readonly currentYear: number
  readonly row: MunicipalRow
  readonly today: string
  readonly transaction: BusinessCalendarTransaction
}

/** Como o `DELETE` da digitada: a data da regra do mesmo dia é gerada de novo (ADR-0096 §6.6). */
export async function disableImportedMunicipalHoliday(
  input: DisableMunicipalParams,
): Promise<SuppressionRow> {
  const { actor, row, transaction } = input
  assertNotInThePast({ holidayOn: row.holidayOn, today: input.today })
  const suppression = await upsertSuppression({
    actor,
    holidayOn: row.holidayOn,
    ibgeCode: row.cityIbgeCode,
    scope: HOLIDAY_PROVIDER_SCOPE.CITY,
    transaction,
  })
  await transaction
    .delete(municipalHolidays)
    .where(and(eq(municipalHolidays.companyId, actor.companyId), eq(municipalHolidays.id, row.id)))
  const regeneratedFromRuleId = await regenerateRuleDate({
    companyId: actor.companyId,
    currentYear: input.currentYear,
    removed: row,
    transaction,
  })
  await audit({
    action: BUSINESS_CALENDAR_AUDIT_ACTION.HOLIDAY_IMPORT_DISABLED,
    actor,
    after: null,
    before: row,
    metadata: { regeneratedFromRuleId, scope: suppression.scope, suppressionId: suppression.id },
    transaction,
  })
  return suppression
}

type DisableStateParams = {
  readonly actor: BusinessCalendarActor
  readonly row: StateRow
  readonly today: string
  readonly transaction: BusinessCalendarTransaction
}

export async function disableImportedStateHoliday(
  input: DisableStateParams,
): Promise<SuppressionRow> {
  const { actor, row, transaction } = input
  const holidayOn = requirePersistedRow(row.holidayOn)
  assertNotInThePast({ holidayOn, today: input.today })
  const suppression = await upsertSuppression({
    actor,
    holidayOn,
    ibgeCode: row.stateIbgeCode,
    scope: HOLIDAY_PROVIDER_SCOPE.STATE,
    transaction,
  })
  await transaction
    .delete(stateHolidays)
    .where(and(eq(stateHolidays.companyId, actor.companyId), eq(stateHolidays.id, row.id)))
  await appendAudit({
    action: BUSINESS_CALENDAR_AUDIT_ACTION.HOLIDAY_IMPORT_DISABLED,
    actor,
    after: null,
    before: toStateRecord(row),
    metadata: { scope: suppression.scope, suppressionId: suppression.id },
    row,
    transaction,
  })
  return suppression
}

type DeletedHolidayParams<TRow> = {
  readonly actor: BusinessCalendarActor
  readonly row: TRow
  readonly today: string
  readonly transaction: BusinessCalendarTransaction
}

/**
 * Apagar a data digitada ou adotada, de hoje em diante, também a suprime: sem isso a importação a traria de
 * volta como "importada" no ciclo seguinte. Data passada não grava (D7). O código de cidade da linha antiga
 * (qualquer sete dígitos) pode não caber no padrão do cache; sem supressão possível, nada a manter fora.
 */
export async function suppressDeletedMunicipalHoliday(
  input: DeletedHolidayParams<MunicipalRow>,
): Promise<SuppressionRow | undefined> {
  const { actor, row, transaction } = input
  if (row.holidayOn < input.today || !CITY_IBGE_CODE_PATTERN.test(row.cityIbgeCode))
    return undefined
  return upsertSuppression({
    actor,
    holidayOn: row.holidayOn,
    ibgeCode: row.cityIbgeCode,
    scope: HOLIDAY_PROVIDER_SCOPE.CITY,
    transaction,
  })
}

/** O "todo ano" (`yearly`) não tem data fixa, e a importação só traz `once`: nada a suprimir. */
export async function suppressDeletedStateHoliday(
  input: DeletedHolidayParams<StateRow>,
): Promise<SuppressionRow | undefined> {
  const { actor, row, transaction } = input
  if (row.holidayOn === null || row.holidayOn < input.today) return undefined
  return upsertSuppression({
    actor,
    holidayOn: row.holidayOn,
    ibgeCode: row.stateIbgeCode,
    scope: HOLIDAY_PROVIDER_SCOPE.STATE,
    transaction,
  })
}
