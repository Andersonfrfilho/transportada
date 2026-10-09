/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatInstantDateTime } from '../shared/holidayImportFormat.service'
import type { HolidayImportStatus } from '../shared/holidayImport.types'
import { resolveImportStatusView } from '../shared/holidayImportStatus.service'
import businessCalendarStyles from '../styles/businessCalendar.module.css'
import styles from '../styles/holidayImport.module.css'

const PROGRESS_LABEL_ID = 'holiday-import-progress-label'
const PAIR_KEYS = ['pending', 'failed', 'notCovered', 'quotaExhausted'] as const

type PairFact = (typeof PAIR_KEYS)[number]

type HolidayImportStatusBodyProps = Readonly<{ status: HolidayImportStatus }>

/**
 * O estado que a rotina deixou: uma manchete (a primeira coisa que o operador precisa saber), a barra de progresso, os
 * números, e cada falha por extenso. Os contadores zerados não aparecem — só o que pede atenção.
 */
export function HolidayImportStatusBody({ status }: HolidayImportStatusBodyProps) {
  const { i18n, t } = useTranslation('businessCalendar')
  const view = resolveImportStatusView(status)
  const progressText = t('import.status.progress', {
    done: view.progress.done,
    total: view.progress.total,
  })
  const pairFacts: Readonly<Record<PairFact, number>> = {
    failed: view.failedPairs,
    notCovered: status.pairs.notCovered,
    pending: status.pairs.pending,
    quotaExhausted: status.pairs.quotaExhausted,
  }
  const hasPlanWarning = status.isEnabled && view.planRestrictedPairs > 0

  return (
    <div aria-label={t('import.status.title')} className={styles.statusCard} role="group">
      <p className={styles.headline} data-headline={view.headline}>
        {t(`import.status.headline.${view.headline}`)}
      </p>
      <p className={businessCalendarStyles.hint}>{t(`import.status.explain.${view.headline}`)}</p>
      {hasPlanWarning ? (
        <div className={styles.warning} data-warning="plan-restricted">
          <p>{t('import.status.planRestricted', { count: view.planRestrictedPairs })}</p>
          <p className={businessCalendarStyles.hint}>{t('import.status.planRestrictedHint')}</p>
        </div>
      ) : null}
      <p className={businessCalendarStyles.hint} id={PROGRESS_LABEL_ID}>
        {progressText}
      </p>
      <progress
        aria-labelledby={PROGRESS_LABEL_ID}
        className={styles.progress}
        max={Math.max(view.progress.total, 1)}
        value={view.progress.done}
      />
      <ul className={styles.facts}>
        <li>
          {status.lastFetchedAt === null
            ? t('import.status.neverFetched')
            : t('import.status.lastFetched', {
                date: formatInstantDateTime({
                  language: i18n.language,
                  value: status.lastFetchedAt,
                }),
              })}
        </li>
        {view.lastRunFinishedAt === null ? null : (
          <li>
            {t('import.status.lastRun', {
              date: formatInstantDateTime({
                language: i18n.language,
                value: view.lastRunFinishedAt,
              }),
            })}
          </li>
        )}
        <li>{t('import.status.cities', { count: status.totalCities })}</li>
        <li>{t('import.status.monthlyRequests', { count: status.monthlyRequests })}</li>
        {PAIR_KEYS.filter((key) => pairFacts[key] > 0).map((key) => (
          <li key={key}>
            {t(`import.status.pairs.${key}`)}: {pairFacts[key]}
          </li>
        ))}
      </ul>
      {view.failures.length === 0 ? null : (
        <div className={styles.failures}>
          <p className={styles.subtitle}>{t('import.status.failuresTitle')}</p>
          <ul className={styles.failureList}>
            {view.failures.map((failure) => (
              <li key={failure.code}>
                <span>{t(failure.messageKey)}</span>
                <span className={styles.failureCount}>
                  {t('import.status.failureCount', { count: failure.pairs })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
