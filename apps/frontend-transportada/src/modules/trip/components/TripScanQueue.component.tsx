/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { TripScanEntry } from '../shared/tripScanQueue.service'
import { isTripScanEntryPending } from '../shared/tripScanQueue.service'
import styles from '../styles/trip.module.css'

type TripScanQueueProps = Readonly<{
  entries: readonly TripScanEntry[]
  onClear: () => void
}>

type TripScanStatusProps = Readonly<{ entry: TripScanEntry }>

function TripScanStatus({ entry }: TripScanStatusProps) {
  const { t } = useTranslation('trip')

  if (isTripScanEntryPending(entry)) {
    const label = entry.status === 'linking' ? 'scanQueueLinking' : 'scanQueueResolving'

    return (
      <SkeletonGroup label={t(`detail.${label}`)}>
        <Skeleton variant="text" width="60%" />
      </SkeletonGroup>
    )
  }

  if (entry.issueKey === undefined) return <>{t('detail.scanQueueLinked')}</>

  return (
    <span className={styles.alert} role="alert">
      {t(`feedback.${entry.issueKey}`)}
    </span>
  )
}

/** Cada nota lida é uma linha, e a recusa mora nela: uma nota recusada não derruba as vizinhas. */
export function TripScanQueue({ entries, onClear }: TripScanQueueProps) {
  const { t } = useTranslation('trip')

  if (entries.length === 0) return null

  return (
    <div className={styles.scanQueue}>
      <div className={styles.panelHead}>
        <h4>{t('detail.scanQueueTitle')}</h4>
        <Button onClick={onClear} size="sm" type="button" variant="ghost">
          <Icon name="refresh" />
          {t('detail.scanQueueClear')}
        </Button>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">{t('detail.scanQueueKeyColumn')}</th>
              <th scope="col">{t('detail.scanQueueStatusColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.accessKey}>
                <td className={styles.scanQueueKey}>{entry.accessKey}</td>
                <td>
                  <TripScanStatus entry={entry} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
