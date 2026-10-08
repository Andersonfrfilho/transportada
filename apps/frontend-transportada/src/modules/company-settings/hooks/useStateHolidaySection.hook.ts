/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useStateHolidaysQuery } from '../queries/useBusinessCalendar.query'
import { useDeleteStateHolidayMutation } from '../mutations/useStateHolidays.mutation'
import { BRAZILIAN_STATES } from '../shared/businessCalendar.constant'
import { buildStateRows } from '../shared/businessCalendarRows.service'
import { applyHolidayTable } from '../shared/businessCalendarTable.service'

import { useHolidayDelete } from './useHolidayDelete.hook'
import { useHolidayFeedback } from './useHolidayFeedback.hook'
import { useHolidayTable } from './useHolidayTable.hook'
import { useStateHolidayForm } from './useStateHolidayForm.hook'

type SectionInput = Readonly<{ companyId: string | undefined; enabled: boolean }>

function acronymOf(code: string): string {
  return BRAZILIAN_STATES.find((state) => state.code === code)?.acronym ?? code
}

/** Tudo que o bloco "Feriados estaduais" decide: as linhas (uma por feriado), o formulário e a exclusão. */
export function useStateHolidaySection(input: SectionInput) {
  const { companyId } = input
  const table = useHolidayTable('state')
  const query = useStateHolidaysQuery(input)
  const rows = buildStateRows({ holidays: query.data ?? [], labelOf: acronymOf })
  const feedback = useHolidayFeedback()
  const form = useStateHolidayForm({ companyId, feedback, rows })
  const deleteHoliday = useDeleteStateHolidayMutation({ companyId })
  const remover = useHolidayDelete({
    remove: (row) => deleteHoliday.mutateAsync(row.id),
    rows,
  })

  return {
    feedback,
    form,
    query,
    remover,
    rows,
    table,
    view: applyHolidayTable({ rows, state: table.state }),
  }
}

export type StateHolidaySectionController = ReturnType<typeof useStateHolidaySection>
