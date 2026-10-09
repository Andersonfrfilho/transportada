/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (ADR-0100 §3, "A exceção do companyId"): a lista do que o fornecedor deixou de listar. Parte
 * sempre das linhas da própria empresa (`municipal_holidays`/`state_holidays`) e só olha o cache para saber se
 * a entrada apontada perdeu a data (`removed_at`); nenhum id do cache sai. Junto de
 * `holiday-import-status.query.ts` e `holiday-import-usage.query.ts`, é um dos arquivos que a API deixa tocar o cache.
 */
import { and, asc, eq, isNotNull } from 'drizzle-orm'

import { municipalHolidays } from '../../database/delivery-client.schema.js'
import { holidayProviderEntries } from '../../database/holiday-provider.schema.js'
import { stateHolidays } from '../../database/state-holiday.schema.js'
import { HOLIDAY_PROVIDER_SCOPE } from '../../shared/holiday-provider.constant.js'
import type {
  HolidayImportRemovedHoliday,
  HolidayImportRemovedList,
} from '../application/holiday-import.port.js'
import type { BusinessCalendarDatabase } from './business-calendar-database.types.js'
import { requirePersistedRow } from './business-calendar-persistence.support.js'

type Executor = Pick<BusinessCalendarDatabase, 'select'>

const REMOVED_LIST_LIMIT = 200

/** Os dois pedidos pedem um a mais que o teto: sobrar é o que diz que a lista foi cortada. */
const REMOVED_QUERY_LIMIT = REMOVED_LIST_LIMIT + 1

function listRemovedCityHolidays(executor: Executor, companyId: string) {
  return executor
    .select({
      holidayId: municipalHolidays.id,
      holidayOn: municipalHolidays.holidayOn,
      ibgeCode: municipalHolidays.cityIbgeCode,
      name: municipalHolidays.name,
    })
    .from(municipalHolidays)
    .innerJoin(
      holidayProviderEntries,
      eq(holidayProviderEntries.id, municipalHolidays.providerEntryId),
    )
    .where(
      and(eq(municipalHolidays.companyId, companyId), isNotNull(holidayProviderEntries.removedAt)),
    )
    .orderBy(asc(municipalHolidays.holidayOn), asc(municipalHolidays.cityIbgeCode))
    .limit(REMOVED_QUERY_LIMIT)
}

function listRemovedStateHolidays(executor: Executor, companyId: string) {
  return executor
    .select({
      holidayId: stateHolidays.id,
      holidayOn: stateHolidays.holidayOn,
      ibgeCode: stateHolidays.stateIbgeCode,
      name: stateHolidays.name,
    })
    .from(stateHolidays)
    .innerJoin(holidayProviderEntries, eq(holidayProviderEntries.id, stateHolidays.providerEntryId))
    .where(and(eq(stateHolidays.companyId, companyId), isNotNull(holidayProviderEntries.removedAt)))
    .orderBy(asc(stateHolidays.holidayOn), asc(stateHolidays.stateIbgeCode))
    .limit(REMOVED_QUERY_LIMIT)
}

/** A data que o fornecedor deixou de listar, nas linhas da própria empresa: elas ficam, sinalizadas. */
export async function listRemovedByProvider(
  executor: Executor,
  companyId: string,
): Promise<HolidayImportRemovedList> {
  const cityRows = await listRemovedCityHolidays(executor, companyId)
  const stateRows = await listRemovedStateHolidays(executor, companyId)
  const merged: HolidayImportRemovedHoliday[] = [
    ...cityRows.map((row) => ({ ...row, scope: HOLIDAY_PROVIDER_SCOPE.CITY })),
    ...stateRows.map((row) => ({
      ...row,
      holidayOn: requirePersistedRow(row.holidayOn),
      scope: HOLIDAY_PROVIDER_SCOPE.STATE,
    })),
  ].sort((first, second) => first.holidayOn.localeCompare(second.holidayOn))

  return {
    items: merged.slice(0, REMOVED_LIST_LIMIT),
    truncated: merged.length > REMOVED_LIST_LIMIT,
  }
}
