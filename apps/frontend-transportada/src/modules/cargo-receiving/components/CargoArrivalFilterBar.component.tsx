/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'

import type { CargoArrivalTableController } from '../hooks/useCargoArrivalTable.hook'
import type { CargoArrivalStatus, CargoContractor } from '../shared/cargoArrival.types'
import { hasCargoArrivalTableCriteria } from '../shared/cargoArrivalTable.service'
import { CARGO_ARRIVAL_STATUSES } from '../shared/cargoReceiving.constant'
import styles from '../styles/cargoReceiving.module.css'

type CargoArrivalFilterBarProps = Readonly<{
  contractors: readonly CargoContractor[]
  loadedCount: number
  table: CargoArrivalTableController
}>

function isStatus(value: string): value is CargoArrivalStatus {
  return CARGO_ARRIVAL_STATUSES.some((status) => status === value)
}

/** Contratante e situação com seleção múltipla; "limpar filtros" só existe com critério aplicado. */
export function CargoArrivalFilterBar({
  contractors,
  loadedCount,
  table,
}: CargoArrivalFilterBarProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const hasCriteria = hasCargoArrivalTableCriteria(table.state)
  const hasFilter = table.state.contractorIds.length > 0 || table.state.statuses.length > 0

  return (
    <>
      <section className={styles.toolbar}>
        <div className={styles.field}>
          <MultiSelect
            ariaLabel={t('filters.contractor')}
            clearAllLabel={t('filters.clearAll')}
            emptyLabel={t('filters.contractorEmpty')}
            onChange={table.setContractors}
            options={contractors.map((contractor) => ({
              label: contractor.displayName,
              value: contractor.id,
            }))}
            placeholder={t('filters.contractorPlaceholder')}
            removeLabel={t('filters.contractorRemove')}
            searchPlaceholder={t('filters.contractorSearch')}
            summaryLabel={(count) => t('filters.contractorSummary', { count })}
            values={table.state.contractorIds}
          />
        </div>

        <div className={styles.field}>
          <MultiSelect
            ariaLabel={t('filters.status')}
            clearAllLabel={t('filters.clearAll')}
            emptyLabel={t('filters.statusEmpty')}
            onChange={(values) => table.setStatuses(values.filter(isStatus))}
            options={CARGO_ARRIVAL_STATUSES.map((status) => ({
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
        <p className={styles.resultCount}>{t('list.count', { count: loadedCount })}</p>
      ) : null}
    </>
  )
}
