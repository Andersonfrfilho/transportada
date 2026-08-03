/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { CteItemTableController } from '../hooks/useCteItemTable.hook'
import styles from '../styles/cteBatch.module.css'

type CteItemPaginationProps = Readonly<{ table: CteItemTableController }>

export function CteItemPagination({ table }: CteItemPaginationProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <div className={styles.pagination}>
      <p className={styles.counter}>
        {t('cteItems.pageCounter', {
          shown: table.visibleItems.length,
          size: table.pageSize,
        })}
      </p>
      <div className={styles.bulkActions}>
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
