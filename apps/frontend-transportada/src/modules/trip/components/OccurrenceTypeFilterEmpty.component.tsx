/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import styles from '@/modules/trip/styles/occurrenceTypeFilters.module.css'

type OccurrenceTypeFilterEmptyProps = Readonly<{
  activeCount: number
  onClear: () => void
  query: string
}>

/** Nenhum tipo passa: a tela diz por quê (a busca, as pílulas ou as duas) e oferece o caminho de volta. */
export function OccurrenceTypeFilterEmpty({
  activeCount,
  onClear,
  query,
}: OccurrenceTypeFilterEmptyProps) {
  const { t } = useTranslation('companySettings')
  const trimmedQuery = query.trim()
  const pillCount = activeCount - (trimmedQuery === '' ? 0 : 1)
  const reason = [
    trimmedQuery === ''
      ? ''
      : t('occurrenceTypeCatalog.filters.emptyReasonQuery', { query: trimmedQuery }),
    pillCount > 0 ? t('occurrenceTypeCatalog.filters.emptyReasonPills', { count: pillCount }) : '',
  ]
    .filter((part) => part !== '')
    .join(' ')

  return (
    <div className={styles.empty} role="status">
      <p className={styles.emptyTitle}>{t('occurrenceTypeCatalog.filters.emptyTitle')}</p>
      <p className={styles.reason}>{reason}</p>
      <button className={styles.clear} onClick={onClear} type="button">
        {t('occurrenceTypeCatalog.filters.clearAll')}
      </button>
    </div>
  )
}
