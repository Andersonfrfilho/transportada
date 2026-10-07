/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'

import type { ContractorTableController } from '../hooks/useContractorTable.hook'
import { CONTRACTOR_STATUSES, type ContractorStatus } from '../shared/contractorDirectory.types'
import { hasContractorTableCriteria } from '../shared/contractorTable.service'
import styles from '../styles/contractorDirectory.module.css'

type ContractorFilterBarProps = Readonly<{
  shownCount: number
  table: ContractorTableController
  totalCount: number
}>

function isStatus(value: string): value is ContractorStatus {
  return CONTRACTOR_STATUSES.some((status) => status === value)
}

/** Busca por nome ou CNPJ, situação com seleção múltipla e "limpar filtros" só com critério aplicado. */
export function ContractorFilterBar({
  shownCount,
  table,
  totalCount,
}: ContractorFilterBarProps): JSX.Element {
  const { t } = useTranslation('contractorDirectory')
  const hasCriteria = hasContractorTableCriteria(table.state)
  const hasFilter = table.state.query.trim() !== '' || table.state.statuses.length > 0

  return (
    <>
      <section className={styles.toolbar}>
        <label className={styles.field}>
          {t('filters.search')}
          <input
            onChange={(event) => table.setQuery(event.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            type="search"
            value={table.state.query}
          />
        </label>

        <div className={styles.field}>
          <MultiSelect
            ariaLabel={t('filters.status')}
            clearAllLabel={t('filters.clearAll')}
            emptyLabel={t('filters.statusEmpty')}
            onChange={(values) => table.setStatuses(values.filter(isStatus))}
            options={CONTRACTOR_STATUSES.map((status) => ({
              label: t(`status.${status}`),
              value: status,
            }))}
            placeholder={t('filters.statusPlaceholder')}
            removeLabel={t('filters.statusRemove')}
            searchPlaceholder={t('filters.statusSearch')}
            summaryLabel={(count) => t('filters.statusSummary', { count })}
            values={table.state.statuses}
          />
        </div>

        {hasCriteria ? (
          <Button onClick={table.clearCriteria} type="button" variant="ghost">
            <Icon name="filter-clear" />
            {t('filters.clear')}
          </Button>
        ) : null}
      </section>
      {hasFilter ? (
        <p className={styles.resultCount}>
          {t('filters.count', { shown: shownCount, total: totalCount })}
        </p>
      ) : null}
    </>
  )
}
