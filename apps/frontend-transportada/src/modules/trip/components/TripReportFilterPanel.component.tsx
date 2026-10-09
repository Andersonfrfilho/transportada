import { useTranslation } from 'react-i18next'

import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { NfeDocumentFilterPanel } from '@/modules/shared/nfe-filter/NfeDocumentFilterPanel.component'

import type { TripReportFiltersController } from '../hooks/useTripReportFilters.hook'
import type { ContractorSummary } from '../shared/contractorSummary.service'
import {
  TRIP_REPORT_DOCUMENT_STATUSES,
  TRIP_REPORT_NO_CONTRACTOR_MARKER,
} from '../shared/tripReportFilterState.service'
import styles from '../styles/trip.module.css'

type TripReportFilterPanelProps = Readonly<{
  contractors: readonly ContractorSummary[]
  filters: TripReportFiltersController
}>

/** Estes filtros só definem o escopo do relatório exportado; a lista de viagens não os usa. */
export function TripReportFilterPanel({ contractors, filters }: TripReportFilterPanelProps) {
  const { t } = useTranslation('trip')
  const { setField, state } = filters

  const contractorOptions: readonly MultiSelectOption[] = [
    { label: t('filters.report.noContractor'), value: TRIP_REPORT_NO_CONTRACTOR_MARKER },
    ...contractors.map((contractor) => ({ label: contractor.displayName, value: contractor.id })),
  ]
  const documentStatusOptions: readonly MultiSelectOption[] = TRIP_REPORT_DOCUMENT_STATUSES.map(
    (status) => ({ label: t(`filters.report.documentStatuses.${status}`), value: status }),
  )

  return (
    <fieldset className={styles.reportFilters}>
      <legend>{t('filters.report.title')}</legend>
      <p className={styles.counter}>{t('filters.report.hint')}</p>
      <NfeDocumentFilterPanel controller={filters} />
      <div className={styles.fieldGrid}>
        <label>
          {t('filters.report.search')}
          <input
            aria-label={t('filters.report.search')}
            className={styles.compactInput}
            onChange={(event) => setField('search', event.target.value)}
            placeholder={t('filters.report.searchPlaceholder')}
            value={state.search}
          />
        </label>
        <label>
          {t('filters.report.contractor')}
          <MultiSelect
            ariaLabel={t('filters.report.contractor')}
            clearAllLabel={t('filters.report.clearSelection')}
            compact
            emptyLabel={t('filters.report.searchEmpty')}
            onChange={(values) => setField('contractorIds', values)}
            options={contractorOptions}
            placeholder={t('filters.allMasculine')}
            removeLabel={t('filters.report.removeSelection')}
            searchPlaceholder={t('filters.report.searchPlaceholder')}
            summaryLabel={(count) => t('filters.report.selectedSummary', { count })}
            values={state.contractorIds}
          />
        </label>
        <label>
          {t('filters.report.documentStatus')}
          <MultiSelect
            ariaLabel={t('filters.report.documentStatus')}
            clearAllLabel={t('filters.report.clearSelection')}
            compact
            emptyLabel={t('filters.report.searchEmpty')}
            onChange={(values) =>
              setField(
                'documentStatuses',
                TRIP_REPORT_DOCUMENT_STATUSES.filter((status) => values.includes(status)),
              )
            }
            options={documentStatusOptions}
            placeholder={t('filters.all')}
            removeLabel={t('filters.report.removeSelection')}
            searchPlaceholder={t('filters.report.searchPlaceholder')}
            summaryLabel={(count) => t('filters.report.selectedSummary', { count })}
            values={state.documentStatuses}
          />
        </label>
      </div>
    </fieldset>
  )
}
