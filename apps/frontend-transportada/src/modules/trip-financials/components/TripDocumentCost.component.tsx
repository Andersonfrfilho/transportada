/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useDocumentCostLine } from '../hooks/useDocumentCostLine.hook'
import {
  describeRevenueLineCost,
  type RevenueLineCostFigure,
} from '../shared/revenueLineCost.service'
import type { Translate } from '../shared/tripCostParcelDetail.service'
import styles from '../styles/tripFinancials.module.css'

type TripDocumentCostProps = Readonly<{ documentId: string }>

type CostGroupProps = Readonly<{
  figure: RevenueLineCostFigure
  isLoss?: boolean
}>

function CostGroup({ figure, isLoss = false }: CostGroupProps) {
  return (
    <div className={styles.documentCostGroup}>
      <dt className={styles.documentCostLabel}>{figure.label}</dt>
      <dd className={cn(styles.documentCostValue, isLoss && styles.negative)}>{figure.amount}</dd>
    </div>
  )
}

/**
 * Spec 225 RF4/RF6/RF9: quanto a nota gastou e lucrou, com o gasto em duas partes. Sem a linha de
 * avaliação — sem `trip.financials` ou prévia sem os campos — não renderiza nada, nem rótulo vazio.
 */
export function TripDocumentCost({ documentId }: TripDocumentCostProps) {
  const { t } = useTranslation('tripFinancials')
  const line = useDocumentCostLine(documentId)
  const view = line === undefined ? null : describeRevenueLineCost({ line, t: t as Translate })

  if (view === null) return null

  if (view.status === 'unavailable') {
    return (
      <div className={styles.documentCost}>
        <p className={styles.documentCostNotice}>{view.reason}</p>
        {view.tax === null ? null : (
          <dl className={styles.documentCostGrid}>
            <CostGroup figure={view.tax} />
          </dl>
        )}
      </div>
    )
  }

  const profitFigure = view.isLoss ? { ...view.profit, label: t('documentCost.loss') } : view.profit

  return (
    <div className={styles.documentCost}>
      <dl className={styles.documentCostGrid}>
        <div className={styles.documentCostGroup}>
          <dt className={styles.documentCostLabel}>{view.cost.label}</dt>
          <dd className={styles.documentCostValue}>
            {view.cost.amount}
            <ul className={styles.documentCostParts}>
              {view.parts.map((part) => (
                <li key={part.label}>
                  {part.label} {part.amount}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <CostGroup figure={profitFigure} isLoss={view.isLoss} />
        {view.margin === null ? null : <CostGroup figure={view.margin} isLoss={view.isLoss} />}
        {view.tax === null ? null : <CostGroup figure={view.tax} />}
      </dl>
      <p className={styles.documentCostNotice}>{t('documentCost.splitCriterion')}</p>
      {view.timeNotice === null ? null : (
        <p className={styles.documentCostNotice}>{view.timeNotice}</p>
      )}
    </div>
  )
}
