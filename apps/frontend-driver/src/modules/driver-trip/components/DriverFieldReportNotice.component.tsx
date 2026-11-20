/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'
import type { FieldReportNotice } from '../shared/fieldReportNotice.service'
import { DriverNextStopCard } from './DriverNextStopCard.component'
import { DriverRecordedTogetherNotice } from './DriverRecordedTogetherNotice.component'

type DriverFieldReportNoticeProps = Readonly<{
  /** `false` quando o snapshot já mostra a próxima parada a caminho ou com chegada: a oferta ficou velha. */
  isNextStopPending: boolean
  notice: FieldReportNotice
  onDismiss: () => void
  onStartRoute: (stopId: string) => void
}>

/** Spec 294: tudo o que a API respondeu a um toque de campo — etapa junto, endereço corrigido e próxima parada. */
export function DriverFieldReportNotice({
  isNextStopPending,
  notice,
  onDismiss,
  onStartRoute,
}: DriverFieldReportNoticeProps) {
  const { t } = useTranslation('driverTrip')
  const { addressCorrection, alreadyOpen, nextStop } = notice

  return (
    <>
      {alreadyOpen === true ? (
        <div
          className={`${styles.proofPendingWarning} ${styles.occurrenceAlreadyOpenNotice}`}
          role="status"
        >
          <p className={styles.proofPendingWarningLead}>{t('occurrenceAlreadyOpen.notice')}</p>
          <Button type="button" variant="secondary" onClick={onDismiss}>
            <Icon name="check" />
            {t('occurrenceAlreadyOpen.dismiss')}
          </Button>
        </div>
      ) : null}
      <DriverRecordedTogetherNotice
        mode="done"
        onDismiss={onDismiss}
        steps={notice.recordedTogether}
      />
      {addressCorrection === undefined ? null : (
        <p role="status">{t(`addressCorrection.${addressCorrection}`)}</p>
      )}
      {nextStop === undefined || !isNextStopPending ? null : (
        <DriverNextStopCard
          nextStop={nextStop}
          onDismiss={onDismiss}
          onStartRoute={(stopId) => {
            onStartRoute(stopId)
            onDismiss()
          }}
        />
      )}
    </>
  )
}
