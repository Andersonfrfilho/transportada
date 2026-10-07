/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { isAmountInputAtLimit } from '../shared/occurrenceSettlementMoney.service'
import styles from '../styles/amountLimitNotice.module.css'

export type AmountLimitNoticeProps = Readonly<{
  /** O texto já mascarado do campo de valor. */
  value: string
}>

/** Spec 247 T7.2b (N5): a região viva existe sempre; só no teto ela ganha o texto, para o leitor de tela anunciar. */
export function AmountLimitNotice({ value }: AmountLimitNoticeProps) {
  const { t } = useTranslation('trip')

  return (
    <span aria-live="polite" className={styles.notice} role="status">
      {isAmountInputAtLimit(value) ? t('amountLimit') : ''}
    </span>
  )
}
