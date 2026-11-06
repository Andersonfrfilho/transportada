/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { AccessKeyImportSummary as AccessKeyImportSummaryModel } from '../shared/accessKeyImportSummary.service'
import styles from '../styles/accessKeyImport.module.css'

type AccessKeyImportSummaryProps = Readonly<{ summary: AccessKeyImportSummaryModel }>

function formatWindowTime(moment: string, language: string): string {
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(moment),
  )
}

export function AccessKeyImportSummary({ summary }: AccessKeyImportSummaryProps) {
  const { i18n, t } = useTranslation('nfeWorkspace')
  const reasonLines = Object.entries(summary.refusedByReason).map(([reason, count]) =>
    t('accessKeyImport.refusedReason', {
      count,
      reason: t(`accessKeyImport.reason.${reason}`),
    }),
  )
  const counters: readonly (readonly [string, number, string | undefined])[] = [
    ['scanned', summary.scanned, undefined],
    ['alreadyInSystem', summary.alreadyInSystem, undefined],
    ['imported', summary.imported, undefined],
    ['searching', summary.searching, undefined],
    [
      'waiting',
      summary.waiting,
      summary.nextWindowAt === null
        ? undefined
        : t('accessKeyImport.nextWindow', {
            time: formatWindowTime(summary.nextWindowAt, i18n.language),
          }),
    ],
    ['refused', summary.refused, reasonLines.join(' · ')],
    ['notObtained', summary.notObtained, undefined],
    ['unreadable', summary.unreadable, undefined],
  ]

  return (
    <dl aria-live="polite" className={styles.summary}>
      {counters.map(([key, value, detail]) => (
        <div className={styles.counter} key={key}>
          <dt>{t(`accessKeyImport.summary.${key}`)}</dt>
          <dd data-counter={key}>{value}</dd>
          {detail === undefined || detail === '' ? null : <p className={styles.detail}>{detail}</p>}
        </div>
      ))}
    </dl>
  )
}
