/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { CteItemTableController } from '../hooks/useCteItemTable.hook'
import styles from '../styles/cteBatch.module.css'

type CteItemFilterSummaryProps = Readonly<{ table: CteItemTableController }>

/**
 * A página mostra 25 linhas de um recorte que pode ter 167: sem o total somado no banco o operador
 * não sabe o que está prestes a transmitir. Transmitir é por lote, então o botão age sobre os lotes
 * que o filtro toca — não sobre as linhas visíveis.
 */
export function CteItemFilterSummary({ table }: CteItemFilterSummaryProps) {
  const { t } = useTranslation('cteBatch')

  if (!table.canReadItems) return null

  if (table.filterSummaryQuery.isPending) {
    return (
      <SkeletonGroup className={styles.filterSummary} label={t('cteItems.filterSummary.loading')}>
        <Skeleton height="var(--space-4)" width="14ch" />
        <Skeleton height="var(--space-4)" width="14ch" />
        <Skeleton height="var(--space-4)" width="14ch" />
      </SkeletonGroup>
    )
  }

  const summary = table.filterSummary
  if (summary === undefined) return null

  return (
    <div className={styles.filterSummary}>
      <dl className={styles.selectionTotals}>
        <div>
          <dt>{t('cteItems.filterSummary.count')}</dt>
          <dd>{summary.count}</dd>
        </div>
        <div>
          <dt>{t('cteItems.filterSummary.base')}</dt>
          <dd>{formatAmount(summary.baseAmount)}</dd>
        </div>
        <div>
          <dt>{t('cteItems.filterSummary.total')}</dt>
          <dd>{formatAmount(summary.totalAmount)}</dd>
        </div>
      </dl>
      <Button
        disabled={!table.canTransmitFilter || table.isTransmitting}
        onClick={table.transmitFilter}
        size="sm"
        type="button"
      >
        <Icon name="upload" />
        {t('cteItems.filterSummary.transmit', { count: table.filterTransmitGroups.length })}
      </Button>
      {summary.batchIdsTruncated ? (
        <p className={styles.hint}>{t('cteItems.filterSummary.truncated')}</p>
      ) : null}
    </div>
  )
}
