/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  useMunicipalHolidaysQuery,
  useMunicipalityNames,
  useMunicipalRulesQuery,
} from '../queries/useBusinessCalendar.query'
import { STATE_CODE_LENGTH } from '../shared/businessCalendar.constant'
import { buildMunicipalRows } from '../shared/businessCalendarRows.service'
import { applyHolidayTable } from '../shared/businessCalendarTable.service'

import type { HolidayTableController } from './useHolidayTable.hook'

type RowsInput = Readonly<{
  companyId: string | undefined
  enabled: boolean
  table: HolidayTableController
}>

/**
 * As linhas do município: as regras mais as datas digitadas (as geradas pelas regras não são linhas). O nome de cada
 * cidade vem do IBGE, uma consulta por UF presente; sem ele a tabela mostra o código, nunca uma célula vazia.
 */
export function useMunicipalHolidayRows(input: RowsInput) {
  const query = { companyId: input.companyId, enabled: input.enabled }
  const rulesQuery = useMunicipalRulesQuery(query)
  const holidaysQuery = useMunicipalHolidaysQuery(query)
  const rules = rulesQuery.data ?? []
  const holidays = holidaysQuery.data ?? []
  const names = useMunicipalityNames(
    [...rules, ...holidays].map((entry) => entry.cityIbgeCode.slice(0, STATE_CODE_LENGTH)),
  )
  const rows = buildMunicipalRows({
    holidays,
    labelOf: (code) => names.get(code) ?? code,
    rules,
  })

  return {
    error: rulesQuery.error ?? holidaysQuery.error,
    isError: rulesQuery.isError || holidaysQuery.isError,
    isLoading: rulesQuery.isPending || holidaysQuery.isPending,
    refetch: () => Promise.all([rulesQuery.refetch(), holidaysQuery.refetch()]),
    rows,
    rules,
    view: applyHolidayTable({ rows, state: input.table.state }),
  }
}
