/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'

import type { CargoPreviewTableController } from '../hooks/useCargoPreviewTable.hook'
import type { CargoContractor } from '../shared/cargoArrival.types'
import { CARGO_PREVIEW_STATUSES } from '../shared/cargoPreview.constant'
import type { CargoPreviewStatus } from '../shared/cargoPreview.types'
import { hasCargoPreviewTableCriteria } from '../shared/cargoPreviewTable.service'
import styles from '../styles/cargoReceiving.module.css'

type CargoPreviewFilterBarProps = Readonly<{
  contractors: readonly CargoContractor[]
  loadedCount: number
  shownCount: number
  table: CargoPreviewTableController
}>

function isStatus(value: string): value is CargoPreviewStatus {
  return CARGO_PREVIEW_STATUSES.some((status) => status === value)
}

/** Contratante e situação com seleção múltipla; "limpar filtros" só existe com critério aplicado. */
export function CargoPreviewFilterBar({
  contractors,
  loadedCount,
  shownCount,
  table,
}: CargoPreviewFilterBarProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
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
            options={CARGO_PREVIEW_STATUSES.map((status) => ({
              label: t(`preview.status.${status}`),
              value: status,
            }))}
            placeholder={t('filters.statusPlaceholder')}
            removeLabel={t('filters.statusRemove')}
            searchPlaceholder={t('filters.statusSearch')}
            summaryLabel={(count) => t('filters.statusSummary', { count })}
            values={table.state.statuses}
          />
        </div>

        {hasCargoPreviewTableCriteria(table.state) ? (
          <Button onClick={table.clearCriteria} type="button" variant="ghost">
            <Icon name="filter-clear" />
            {t('filters.clear')}
          </Button>
        ) : null}
      </section>
      {hasFilter ? (
        <p className={styles.resultCount}>
          {t('preview.list.count', { shown: shownCount, total: loadedCount })}
        </p>
      ) : null}
    </>
  )
}
