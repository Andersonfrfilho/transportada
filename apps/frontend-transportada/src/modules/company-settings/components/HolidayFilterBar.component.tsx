/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'

import type { HolidayTableController } from '../hooks/useHolidayTable.hook'
import {
  HOLIDAY_KINDS,
  HOLIDAY_RECURRENCES,
  STATE_CHOICES,
} from '../shared/businessCalendar.constant'
import {
  hasHolidayTableCriteria,
  isHolidayKind,
  isHolidayRecurrence,
} from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

type HolidayFilterBarProps = Readonly<{
  /** O feriado estadual não tem tipo: o filtro de tipo é só do município. */
  hasKindFilter: boolean
  shown: number
  table: HolidayTableController
  total: number
}>

/** Filtros de seleção MÚLTIPLA; "limpar filtros" só existe com critério aplicado (`web.md` §7). */
export function HolidayFilterBar({ hasKindFilter, shown, table, total }: HolidayFilterBarProps) {
  const { t } = useTranslation('businessCalendar')
  const hasCriteria = hasHolidayTableCriteria(table.state)
  const common = {
    clearAllLabel: t('filters.clearAll'),
    emptyLabel: t('filters.empty'),
    searchPlaceholder: t('filters.search'),
  }

  return (
    <>
      <div className={styles.filters}>
        {hasKindFilter ? (
          <MultiSelect
            {...common}
            ariaLabel={t('filters.kindAria')}
            onChange={(values) => table.setKinds(values.filter(isHolidayKind))}
            options={HOLIDAY_KINDS.map((value) => ({ label: t(`kinds.${value}`), value }))}
            placeholder={t('filters.kindPlaceholder')}
            removeLabel={t('filters.kindRemove')}
            summaryLabel={(count) => t('filters.kindSummary', { count })}
            values={table.state.kinds}
          />
        ) : null}
        <MultiSelect
          {...common}
          ariaLabel={t('filters.recurrenceAria')}
          onChange={(values) => table.setRecurrences(values.filter(isHolidayRecurrence))}
          options={HOLIDAY_RECURRENCES.map((value) => ({
            label: t(`recurrences.${value}`),
            value,
          }))}
          placeholder={t('filters.recurrencePlaceholder')}
          removeLabel={t('filters.recurrenceRemove')}
          summaryLabel={(count) => t('filters.recurrenceSummary', { count })}
          values={table.state.recurrences}
        />
        <MultiSelect
          {...common}
          ariaLabel={t('filters.stateAria')}
          onChange={table.setStates}
          options={STATE_CHOICES}
          placeholder={t('filters.statePlaceholder')}
          removeLabel={t('filters.stateRemove')}
          summaryLabel={(count) => t('filters.stateSummary', { count })}
          values={table.state.states}
        />
      </div>
      {hasCriteria ? (
        <div className={styles.actions}>
          <Button onClick={table.clearCriteria} type="button" variant="ghost">
            <Icon name="filter-clear" />
            {t('filters.clear')}
          </Button>
          <p className={styles.resultCount}>{t('list.count', { shown, total })}</p>
        </div>
      ) : null}
    </>
  )
}
