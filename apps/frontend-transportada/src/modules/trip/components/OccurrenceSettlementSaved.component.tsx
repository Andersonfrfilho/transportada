/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { DriverOptionsController } from '@/modules/fleet/hooks/useDriverOptions.hook'

import { formatReimbursedDay } from '../shared/occurrenceSettlementDraft.service'
import { formatOccurrenceSettlementAmount } from '../shared/occurrenceSettlementMoney.service'
import type { OccurrenceSettlementView } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

export type OccurrenceSettlementSavedProps = Readonly<{
  driverOptions: DriverOptionsController
  isReimbursing: boolean
  onReimburse: (productCode: string) => void
  settlement: OccurrenceSettlementView
}>

/** O acerto gravado: total, itens e o ressarcimento. `payerKind: 'carrier'` não tem botão (o clique estouraria 422). */
export function OccurrenceSettlementSaved({
  driverOptions,
  isReimbursing,
  onReimburse,
  settlement,
}: OccurrenceSettlementSavedProps) {
  const { t } = useTranslation('trip')

  return (
    <div>
      <p className={styles.hint} role="status">
        {t('occurrenceSettlement.savedTotal')}:{' '}
        <strong>{formatOccurrenceSettlementAmount(settlement.total)}</strong>
      </p>
      <div className={styles.settlementGrid}>
        <div className={styles.settlementColumns}>
          <span>{t('occurrenceSettlement.productCode')}</span>
          <span>{t('occurrenceSettlement.amount')}</span>
          <span>{t('occurrenceSettlement.payerKind')}</span>
          <span>{t('occurrenceSettlement.payerId')}</span>
          <span />
        </div>
        {settlement.items.map((item) => (
          <div className={styles.settlementRow} key={item.productCode}>
            <span>{item.productCode}</span>
            <span>{formatOccurrenceSettlementAmount(item.amount)}</span>
            <span>{t(`occurrenceSettlement.payer.${item.payerKind}`)}</span>
            <span>
              {item.payerKind === 'driver'
                ? (driverOptions.nameOf(item.payerId ?? '') ?? item.payerId ?? '')
                : ''}
            </span>
            <div className={styles.settlementRemove}>
              {/* O botão sumia sem deixar nada: o item ressarcido carrega a data, e o clique tem prova. */}
              {item.reimbursedAt !== null ? (
                <span className={styles.settlementReimbursedBadge}>
                  <Icon name="check" />
                  {t('occurrenceSettlement.reimbursedOn', {
                    date: formatReimbursedDay(item.reimbursedAt),
                  })}
                </span>
              ) : item.payerKind === 'carrier' ? null : (
                <Button
                  disabled={isReimbursing}
                  onClick={() => onReimburse(item.productCode)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Icon name="check" />
                  {t('occurrenceSettlement.markReimbursed')}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
