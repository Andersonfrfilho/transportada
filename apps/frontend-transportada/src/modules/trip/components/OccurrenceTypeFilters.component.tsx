/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '@/modules/trip/styles/occurrenceTypeFilters.module.css'

import type { OccurrenceTypeFiltersController } from '../hooks/useOccurrenceTypeFilters.hook'
import {
  countActiveOccurrenceTypeFilters,
  isOccurrenceTypeFilterChipPressed,
  OCCURRENCE_TYPE_FILTER_CHIP_GROUPS,
} from '../shared/occurrenceTypeFilterChips.service'

const GROUP_LABEL_KEYS = ['moment', 'requirement', 'other'] as const

type OccurrenceTypeFiltersProps = Readonly<{
  /** Sem as exceções carregadas o filtro "Tem exceção" não tem o que medir: a pílula fica desligada com o motivo. */
  canFilterByException: boolean
  controller: OccurrenceTypeFiltersController
  shownCount: number
  totalCount: number
}>

export function OccurrenceTypeFilters({
  canFilterByException,
  controller,
  shownCount,
  totalCount,
}: OccurrenceTypeFiltersProps) {
  const { t } = useTranslation('companySettings')
  const reasonId = useId()
  const { clear, filters, setQuery, toggleChip } = controller
  const activeCount = countActiveOccurrenceTypeFilters(filters)

  return (
    <div className={styles.root}>
      <div className={styles.searchRow}>
        <input
          aria-label={t('occurrenceTypeCatalog.filters.searchLabel')}
          className={styles.search}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('occurrenceTypeCatalog.filters.searchPlaceholder')}
          type="search"
          value={filters.query}
        />
        <button className={styles.clear} disabled={activeCount === 0} onClick={clear} type="button">
          {t('occurrenceTypeCatalog.filters.clear')}
        </button>
      </div>

      <div
        className={styles.chips}
        role="group"
        aria-label={t('occurrenceTypeCatalog.filters.title')}
      >
        {OCCURRENCE_TYPE_FILTER_CHIP_GROUPS.map((chipIds, index) => (
          <div className={styles.group} key={GROUP_LABEL_KEYS[index]}>
            <span className={styles.groupLabel}>
              {t(`occurrenceTypeCatalog.filters.groups.${GROUP_LABEL_KEYS[index]}`)}
            </span>
            {chipIds.map((chipId) => {
              const [group = '', value = ''] = chipId.split(':')
              const isPressed = isOccurrenceTypeFilterChipPressed(filters, chipId)
              const isBlocked = chipId === 'exception:has' && !canFilterByException
              return (
                <button
                  aria-describedby={isBlocked ? reasonId : undefined}
                  aria-pressed={isPressed}
                  className={styles.chip}
                  disabled={isBlocked}
                  key={chipId}
                  onClick={() => toggleChip(chipId)}
                  type="button"
                >
                  <span aria-hidden="true" className={styles.mark}>
                    {isPressed ? '✓' : '+'}
                  </span>
                  {t(`occurrenceTypeCatalog.filters.chips.${group}.${value}`)}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {canFilterByException ? null : (
        <p className={styles.reason} id={reasonId}>
          {t('occurrenceTypeCatalog.filters.exceptionUnavailable')}
        </p>
      )}
      <p aria-live="polite" className={styles.counter}>
        {t('occurrenceTypeCatalog.filters.counter', { shown: shownCount, total: totalCount })}
      </p>
    </div>
  )
}
