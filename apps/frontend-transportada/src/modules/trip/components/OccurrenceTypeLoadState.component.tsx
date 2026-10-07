/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import styles from '@/modules/trip/styles/occurrenceTypeLoad.module.css'
import tripStyles from '@/modules/trip/styles/trip.module.css'

type OccurrenceTypeLoadStateProps = Readonly<{
  onRetry: () => void
  status: 'error' | 'loading'
}>

/** A altura mínima reserva o lugar da lista: o painel não pula quando os tipos chegam. */
export function OccurrenceTypeLoadState({ onRetry, status }: OccurrenceTypeLoadStateProps) {
  const { t } = useTranslation('companySettings')

  if (status === 'loading') {
    return (
      <p className={`${tripStyles.hint} ${styles.loadState}`} role="status">
        {t('occurrenceTypeCatalog.loading')}
      </p>
    )
  }

  return (
    <div className={styles.loadState}>
      <p className={tripStyles.alert} role="alert">
        {t('occurrenceTypeCatalog.loadError')}
      </p>
      <button className={styles.retry} onClick={onRetry} type="button">
        {t('occurrenceTypeCatalog.retry')}
      </button>
    </div>
  )
}
