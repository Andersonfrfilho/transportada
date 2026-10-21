/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { useTripOccurrenceResolutionSummaryQuery } from '../queries/tripOccurrenceFeed.query'
import { formatResolutionDuration } from '../shared/tripOccurrenceResolutionSummary.service'
import styles from '../styles/trip.module.css'

/**
 * Spec 277 RF5: quanto cada tipo de ocorrência leva para ser resolvido. O número vem da API (o dado
 * da 276 somado por tipo), nunca da lista carregada, que é paginada e filtrada. Sem nada resolvido,
 * ou com a leitura falhando, o painel não aparece: é apoio, não pode virar erro de página.
 */
export function TripOccurrenceResolutionSummary({
  companyId,
  enabled,
}: Readonly<{ companyId?: string; enabled: boolean }>) {
  const { t } = useTranslation('trip')
  const query = useTripOccurrenceResolutionSummaryQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled,
  })
  const items = query.data ?? []
  if (items.length === 0) return null

  return (
    <section aria-labelledby="trip-occurrence-resolution-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="trip-occurrence-resolution-title">{t('occurrenceFeed.resolutionSummary.title')}</h2>
        <p className={styles.hint}>{t('occurrenceFeed.resolutionSummary.hint')}</p>
      </div>
      <ul
        aria-label={t('occurrenceFeed.resolutionSummary.label')}
        className={styles.occurrenceAverages}
      >
        {items.map((item) => (
          <li className={styles.occurrenceAverage} key={item.typeName}>
            <span>{item.typeName}</span>
            <strong>
              {formatResolutionDuration(item.averageSeconds, {
                lessThanMinute: t('occurrenceFeed.resolutionSummary.lessThanMinute'),
              })}
            </strong>
            <small>
              {t('occurrenceFeed.resolutionSummary.count', { count: item.resolvedCount })}
            </small>
          </li>
        ))}
      </ul>
    </section>
  )
}
