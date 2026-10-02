/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useDocumentCostLine } from '../hooks/useDocumentCostLine.hook'
import { describeRevenueLineCost } from '../shared/revenueLineCost.service'
import type { Translate } from '../shared/tripCostParcelDetail.service'
import styles from '../styles/tripFinancials.module.css'

type TripDocumentCostCriterionProps = Readonly<{ documentId: string }>

/**
 * Spec 232 RF4: o critério do rateio mora no detalhe da nota, ao lado do "rateio da viagem" que explica.
 * Só aparece quando esta nota mostra esse número — sem ele a frase explicaria o que não está na tela.
 */
export function TripDocumentCostCriterion({ documentId }: TripDocumentCostCriterionProps) {
  const { t } = useTranslation('tripFinancials')
  const line = useDocumentCostLine(documentId)
  const isShareShown =
    line !== undefined &&
    describeRevenueLineCost({ line, t: t as Translate })?.status === 'available'

  if (!isShareShown) return null

  return <p className={styles.documentCostNotice}>{t('documentCost.splitCriterion')}</p>
}
