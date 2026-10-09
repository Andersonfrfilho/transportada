/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useDisableImportedHolidayMutation } from '../mutations/useHolidayImport.mutation'
import { useDeleteMunicipalHolidayMutation } from '../mutations/useMunicipalHolidays.mutation'
import { useDeleteRuleMutation } from '../mutations/useMunicipalRules.mutation'
import {
  hasShortMaterializationHorizon,
  readCalendarYear,
  resolveCoveredThroughYear,
} from '../shared/businessCalendarHorizon.service'

import { useHolidayDelete } from './useHolidayDelete.hook'
import { useHolidayFeedback } from './useHolidayFeedback.hook'
import { useHolidayTable } from './useHolidayTable.hook'
import { useMaterialization } from './useMaterialization.hook'
import { useMunicipalHolidayForm } from './useMunicipalHolidayForm.hook'
import { useMunicipalHolidayRows } from './useMunicipalHolidayRows.hook'

type SectionInput = Readonly<{ companyId: string | undefined; enabled: boolean }>

/** Tudo que o bloco "Feriados municipais" decide: as linhas, o formulário, a exclusão e o horizonte de geração. */
export function useMunicipalHolidaySection(input: SectionInput) {
  const { companyId } = input
  const table = useHolidayTable('municipal')
  const data = useMunicipalHolidayRows({ ...input, table })
  const feedback = useHolidayFeedback()
  const form = useMunicipalHolidayForm({ companyId, feedback, rows: data.rows })
  const deleteRule = useDeleteRuleMutation({ companyId })
  const deleteHoliday = useDeleteMunicipalHolidayMutation({ companyId })
  const disableImported = useDisableImportedHolidayMutation({ companyId })
  const remover = useHolidayDelete({
    remove: async (row) => {
      if (row.provenance === 'imported') {
        await disableImported.mutateAsync({ holidayId: row.id, scope: 'city' })
        return
      }
      await (row.origin === 'rule'
        ? deleteRule.mutateAsync(row.id)
        : deleteHoliday.mutateAsync(row.id))
    },
    rows: data.rows,
  })
  const materialization = useMaterialization({ companyId })
  const currentYear = readCalendarYear(new Date())

  return {
    coveredThroughYear: resolveCoveredThroughYear({ currentYear, rules: data.rules }),
    data,
    feedback,
    form,
    hasShortHorizon: hasShortMaterializationHorizon({ currentYear, rules: data.rules }),
    materialization,
    remover,
    table,
  }
}

export type MunicipalHolidaySectionController = ReturnType<typeof useMunicipalHolidaySection>
