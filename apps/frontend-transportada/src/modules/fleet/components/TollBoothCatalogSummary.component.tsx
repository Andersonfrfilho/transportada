/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 RF2/RF6/D5: o cabeçalho (total, data e estado do catálogo, pendência de tarifa por
 * eixo) e a paginação da lista — os dois blocos que a aba de pedágio soma ao catálogo.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useDayFormatter } from '../hooks/useDayFormatter.hook'
import type { TollBoothCatalogPage } from '../shared/tollBoothCatalog.validation'
import styles from '../styles/fleet.module.css'

/** Total, data e estado do catálogo (RF2/D5) — a pendência de tarifa por eixo fecha o quarteto. */
export function TollBoothCatalogHeader(
  props: Readonly<{ summary: TollBoothCatalogPage['summary'] }>,
) {
  const { t } = useTranslation('fleet')
  const formatDay = useDayFormatter()
  const { summary } = props

  return (
    <dl className={styles.catalogHeader}>
      <p className={styles.counter}>
        {t('tollBoothCharges.catalog.summaryTotal', { count: summary.boothCount })}
      </p>
      <p className={styles.counter}>
        {summary.observedOn === null
          ? t('tollBoothCharges.catalog.status.empty')
          : t('tollBoothCharges.catalog.summaryObservedOn', {
              date: formatDay(summary.observedOn),
            })}
      </p>
      {summary.observedOn === null ? null : (
        <p className={styles.counter}>{t(`tollBoothCharges.catalog.status.${summary.status}`)}</p>
      )}
      <p className={styles.counter}>
        {t('tollBoothCharges.catalog.pendingCount', {
          count: summary.boothsWithoutAxleChargeCount,
        })}
      </p>
    </dl>
  )
}

export function TollBoothCatalogPagination(
  props: Readonly<{
    onPageChange: (page: number) => void
    pagination: TollBoothCatalogPage['pagination']
  }>,
) {
  const { t } = useTranslation('fleet')
  const { pagination } = props
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.perPage))

  return (
    <div className={styles.catalogPagination}>
      <Button
        disabled={pagination.page <= 1}
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => props.onPageChange(pagination.page - 1)}
      >
        <Icon name="chevron-left" />
        {t('tollBoothCharges.catalog.previousPage')}
      </Button>
      <p className={styles.catalogPageLabel}>
        {t('tollBoothCharges.catalog.pageOfTotal', { page: pagination.page, pageCount })}
      </p>
      <Button
        disabled={pagination.page >= pageCount}
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => props.onPageChange(pagination.page + 1)}
      >
        {t('tollBoothCharges.catalog.nextPage')}
        <Icon name="chevron-right" />
      </Button>
    </div>
  )
}
