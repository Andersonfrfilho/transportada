/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import type { NfseInvoiceTableController } from '../hooks/useNfseInvoiceTable.hook'
import { NFSE_INVOICE_PAGE_SIZES } from '../shared/nfseInvoice.constant'
import styles from '../styles/nfseInvoice.module.css'

const PAGE_SIZE_OPTIONS: readonly SelectOption[] = NFSE_INVOICE_PAGE_SIZES.map((size) => ({
  label: String(size),
  value: String(size),
}))

type NfseInvoicePaginationProps = Readonly<{
  table: NfseInvoiceTableController
}>

export function NfseInvoicePagination({ table }: NfseInvoicePaginationProps): JSX.Element {
  const { t } = useTranslation('nfseInvoice')

  return (
    <div className={styles.pagination}>
      <p className={styles.counter}>{t('table.pageSize')}</p>
      <div className={styles.bulkActions}>
        <Select
          ariaLabel={t('table.pageSize')}
          clearable={false}
          compact
          onChange={(value) => {
            const size = NFSE_INVOICE_PAGE_SIZES.find((option) => String(option) === value)
            if (size !== undefined) table.setPageSize(size)
          }}
          options={PAGE_SIZE_OPTIONS}
          placeholder={t('table.pageSize')}
          value={String(table.pageSize)}
        />
        <button
          aria-label={t('table.previousPage')}
          className={styles.iconAction}
          disabled={!table.canGoToPreviousPage}
          onClick={table.goToPreviousPage}
          title={t('table.previousPage')}
          type="button"
        >
          <Icon name="page-previous" />
        </button>
        <button
          aria-label={t('table.nextPage')}
          className={styles.iconAction}
          disabled={!table.hasNextPage}
          onClick={table.goToNextPage}
          title={t('table.nextPage')}
          type="button"
        >
          <Icon name="page-next" />
        </button>
      </div>
    </div>
  )
}
