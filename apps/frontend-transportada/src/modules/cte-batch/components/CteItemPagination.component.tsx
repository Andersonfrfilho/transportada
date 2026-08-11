/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import type { CteItemTableController } from '../hooks/useCteItemTable.hook'
import { CTE_ITEM_PAGE_SIZES, parseCteItemPageSize } from '../shared/cteBatchItemTable.service'
import styles from '../styles/cteBatch.module.css'

type CteItemPaginationProps = Readonly<{ table: CteItemTableController }>

const PAGE_SIZE_OPTIONS = CTE_ITEM_PAGE_SIZES.map((size) => ({
  label: String(size),
  value: String(size),
}))

export function CteItemPagination({ table }: CteItemPaginationProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <div className={styles.pagination}>
      <p className={styles.counter}>
        {table.filterSummary === undefined
          ? t('cteItems.pageCounter', { shown: table.visibleItems.length, size: table.pageSize })
          : t('cteItems.pageCounterOfTotal', {
              shown: table.visibleItems.length,
              total: table.filterSummary.count,
            })}
      </p>
      <div className={styles.bulkActions}>
        <Select
          ariaLabel={t('cteItems.pageSize')}
          compact
          onChange={(value) => table.setPageSize(parseCteItemPageSize(value))}
          options={PAGE_SIZE_OPTIONS}
          value={String(table.pageSize)}
        />
        <button
          aria-label={t('cteItems.previousPage')}
          className={styles.iconAction}
          disabled={!table.canGoToPreviousPage}
          onClick={table.goToPreviousPage}
          title={t('cteItems.previousPage')}
          type="button"
        >
          <Icon name="page-previous" />
        </button>
        <button
          aria-label={t('cteItems.nextPage')}
          className={styles.iconAction}
          disabled={!table.hasNextPage}
          onClick={table.goToNextPage}
          title={t('cteItems.nextPage')}
          type="button"
        >
          <Icon name="page-next" />
        </button>
      </div>
    </div>
  )
}
