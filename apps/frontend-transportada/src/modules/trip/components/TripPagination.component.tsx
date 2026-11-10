/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import type { TripTableController } from '../hooks/useTripTable.hook'
import { TRIP_PAGE_SIZES } from '../shared/trip.constant'
import styles from '../styles/trip.module.css'

const PAGE_SIZE_OPTIONS: readonly SelectOption[] = TRIP_PAGE_SIZES.map((size) => ({
  label: String(size),
  value: String(size),
}))

type TripPaginationProps = Readonly<{ table: TripTableController }>

/** Mesmo desenho da paginação da lista de NFS-e: tamanho da página e página anterior/próxima. */
export function TripPagination({ table }: TripPaginationProps): JSX.Element {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.tripPagination}>
      <p aria-live="polite" className={styles.counter}>
        {table.pageCount === null
          ? t('pagination.pageSize')
          : t('pagination.position', { count: table.pageCount, current: table.pageNumber })}
      </p>
      <div className={styles.tripPaginationActions}>
        <Select
          ariaLabel={t('pagination.pageSize')}
          clearable={false}
          compact
          onChange={(value) => {
            const size = TRIP_PAGE_SIZES.find((option) => String(option) === value)
            if (size !== undefined) table.setPageSize(size)
          }}
          options={PAGE_SIZE_OPTIONS}
          placeholder={t('pagination.pageSize')}
          value={String(table.pageSize)}
        />
        <button
          aria-label={t('pagination.first')}
          className={styles.iconAction}
          disabled={!table.canGoToFirstPage}
          onClick={table.goToFirstPage}
          title={t('pagination.first')}
          type="button"
        >
          <Icon name="page-first" />
        </button>
        <button
          aria-label={t('pagination.previous')}
          className={styles.iconAction}
          disabled={!table.canGoToPreviousPage}
          onClick={table.goToPreviousPage}
          title={t('pagination.previous')}
          type="button"
        >
          <Icon name="page-previous" />
        </button>
        {table.pageNumbers.map((item, index) =>
          item === 'gap' ? (
            <span aria-hidden="true" className={styles.counter} key={`gap-${String(index)}`}>
              …
            </span>
          ) : (
            <button
              aria-current={item === table.pageNumber ? 'page' : undefined}
              aria-label={t('pagination.goTo', { page: item })}
              className={item === table.pageNumber ? styles.iconActionActive : styles.iconAction}
              disabled={item === table.pageNumber}
              key={item}
              onClick={() => table.goToPage(item)}
              type="button"
            >
              {item}
            </button>
          ),
        )}
        <button
          aria-label={t('pagination.next')}
          className={styles.iconAction}
          disabled={!table.hasNextPage}
          onClick={table.goToNextPage}
          title={t('pagination.next')}
          type="button"
        >
          <Icon name="page-next" />
        </button>
        <button
          aria-label={t('pagination.last')}
          className={styles.iconAction}
          disabled={!table.canGoToLastPage}
          onClick={table.goToLastPage}
          title={t('pagination.last')}
          type="button"
        >
          <Icon name="page-last" />
        </button>
      </div>
    </div>
  )
}
