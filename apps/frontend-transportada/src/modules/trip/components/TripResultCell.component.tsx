/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { resolveResultView } from '../shared/tripListCells.service'
import type { TripAmounts } from '../shared/trip.types'
import styles from '../styles/tripListCells.module.css'

type TripResultCellProps = Readonly<{
  amounts: TripAmounts | null | undefined
}>

export function TripResultCell({ amounts }: TripResultCellProps) {
  const { t } = useTranslation('trip')
  const view = resolveResultView(amounts)

  if (view.kind === 'unknown') return <span className={styles.unknown}>{t('table.noAmount')}</span>

  const marginClassName = view.isLoss ? styles.loss : styles.profit
  const marginLabel = view.isLoss ? 'listCells.result.loss' : 'listCells.result.profit'

  return (
    <div className={styles.result}>
      {view.cost === null ? null : (
        <span className={styles.resultLine}>
          {t('listCells.result.cost', { amount: formatAmount(view.cost) })}
        </span>
      )}
      {view.margin === null ? null : (
        <span className={`${styles.resultLine} ${marginClassName}`}>
          {t(marginLabel, { amount: formatAmount(view.margin) })}
          {view.marginPercentage === null
            ? null
            : ` · ${t('listCells.result.margin', { percent: view.marginPercentage })}`}
        </span>
      )}
      {view.marks.length === 0 ? null : (
        <span className={styles.marks}>
          {view.marks.map((mark) => (
            <span className={styles.mark} key={mark}>
              {t(`listCells.result.mark.${mark}`)}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}
