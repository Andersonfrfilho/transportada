/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TripReportExportButton } from '@/modules/trip/components/TripReportExportButton.component'
import type { TripReportScope } from '@/modules/trip/shared/tripReport.service'
import type { TripReportResult } from '@/modules/trip/shared/tripReport.types'

import type { UseNfeDocumentTableResult } from '../hooks/useNfeDocumentTable.hook'
import { translateNfeFiltersToTripReport } from '../shared/nfeTripReportFilters.service'
import { buildExcludedWithoutTripNotice } from '../shared/nfeTripReportNotice.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeTripReportExportActionProps = Readonly<{
  table: UseNfeDocumentTableResult
}>

function resolveScope(table: UseNfeDocumentTableResult): TripReportScope | undefined {
  if (table.selectedCount > 0) return { documentIds: [...table.selectedIds] }
  const translation = translateNfeFiltersToTripReport({
    filters: table.filters,
    isAdvancedActive:
      table.mode === 'advanced' ? table.activeConditionCount > 0 : table.savedConditionCount > 0,
    searchTerm: table.searchTerm,
  })
  if (translation.unsupported.length === 0) return { filters: translation.filters }
  // Filtro sem parâmetro equivalente no endpoint: o que a tela mostra viaja como ids para não exportar a mais.
  if (table.filteredDocuments.length === 0) return undefined
  return { documentIds: table.filteredDocuments.map((document) => document.id) }
}

/** Seleção manda; sem ela, o filtro atual da aba. */
export function NfeTripReportExportAction({ table }: NfeTripReportExportActionProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [excludedWithoutTrip, setExcludedWithoutTrip] = useState(0)
  const scope = resolveScope(table)
  const notice = buildExcludedWithoutTripNotice({
    count: excludedWithoutTrip,
    translate: (key, options) => t(key, options),
  })

  function handleExported(result: TripReportResult): void {
    setExcludedWithoutTrip(result.excludedWithoutTrip)
  }

  if (scope === undefined) return null
  return (
    <>
      <TripReportExportButton onExported={handleExported} scope={scope} />
      {notice === undefined ? null : (
        <p className={styles.reportNotice} role="status">
          {notice}
        </p>
      )}
    </>
  )
}
