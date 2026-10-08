import { useTranslation } from 'react-i18next'

import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Select, type SelectOption } from '@/components/ui/select'

import type { TripReportFiltersController } from '../hooks/useTripReportFilters.hook'
import type { ContractorSummary } from '../shared/contractorSummary.service'
import {
  TRIP_REPORT_DOCUMENT_STATUSES,
  TRIP_REPORT_NO_CONTRACTOR_MARKER,
  TRIP_REPORT_STATE_ACRONYMS,
  TRIP_REPORT_VALUE_OPERATORS,
  TRIP_REPORT_VALUE_OPERATOR_SYMBOL,
} from '../shared/tripReportFilterState.service'
import type { TripReportValueOperator } from '../shared/tripReport.types'
import styles from '../styles/trip.module.css'

type TripReportFilterPanelProps = Readonly<{
  contractors: readonly ContractorSummary[]
  filters: TripReportFiltersController
}>

const OPERATOR_OPTIONS: readonly SelectOption[] = TRIP_REPORT_VALUE_OPERATORS.map((operator) => ({
  label: TRIP_REPORT_VALUE_OPERATOR_SYMBOL[operator],
  value: operator,
}))

function isValueOperator(value: string): value is TripReportValueOperator {
  return TRIP_REPORT_VALUE_OPERATORS.some((operator) => operator === value)
}

/** Estes filtros só definem o escopo do relatório exportado; a lista de viagens não os usa. */
export function TripReportFilterPanel({ contractors, filters }: TripReportFilterPanelProps) {
  const { t } = useTranslation('trip')
  const { setField, state } = filters

  const contractorOptions: readonly MultiSelectOption[] = [
    { label: t('filters.report.noContractor'), value: TRIP_REPORT_NO_CONTRACTOR_MARKER },
    ...contractors.map((contractor) => ({ label: contractor.displayName, value: contractor.id })),
  ]
  const stateOptions: readonly MultiSelectOption[] = TRIP_REPORT_STATE_ACRONYMS.map((acronym) => ({
    label: acronym,
    value: acronym,
  }))
  const documentStatusOptions: readonly MultiSelectOption[] = TRIP_REPORT_DOCUMENT_STATUSES.map(
    (status) => ({ label: t(`filters.report.documentStatuses.${status}`), value: status }),
  )
  const cityOptions = [{ label: t('filters.all'), value: '' }]

  return (
    <fieldset className={styles.reportFilters}>
      <legend>{t('filters.report.title')}</legend>
      <p className={styles.counter}>{t('filters.report.hint')}</p>
      <div className={styles.fieldGrid}>
        <label>
          {t('filters.report.search')}
          <input
            aria-label={t('filters.report.search')}
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
          {t('filters.report.recipientCity')}
          <SearchableSelect
            ariaLabel={t('filters.report.recipientCity')}
            emptyLabel={t('filters.report.searchEmpty')}
            onChange={(value) => setField('recipientCity', value)}
            options={cityOptions}
            placeholder={t('filters.all')}
            resolveCustomOption={(query) => ({ label: query, value: query })}
            searchPlaceholder={t('filters.report.searchPlaceholder')}
            value={state.recipientCity}
          />
        </label>
        <label>
          {t('filters.report.recipientState')}
          <MultiSelect
            ariaLabel={t('filters.report.recipientState')}
            clearAllLabel={t('filters.report.clearSelection')}
            compact
            emptyLabel={t('filters.report.searchEmpty')}
            onChange={(values) => setField('recipientStates', values)}
            options={stateOptions}
            placeholder={t('filters.all')}
            removeLabel={t('filters.report.removeSelection')}
            searchPlaceholder={t('filters.report.searchPlaceholder')}
            summaryLabel={(count) => t('filters.report.selectedSummary', { count })}
            values={state.recipientStates}
          />
        </label>
        <div>
          <span>{t('filters.report.value')}</span>
          <div className={styles.reportAmountRow}>
            <Select
              ariaLabel={t('filters.report.operator')}
              clearable
              compact
              onChange={(value) => setField('valueOperator', isValueOperator(value) ? value : '')}
              options={OPERATOR_OPTIONS}
              placeholder={t('filters.report.operator')}
              value={state.valueOperator}
            />
            <input
              aria-label={t('filters.report.value')}
              inputMode="decimal"
              onChange={(event) => setField('valueAmount', event.target.value)}
              placeholder={t('filters.report.value')}
              value={state.valueAmount}
            />
          </div>
        </div>
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
