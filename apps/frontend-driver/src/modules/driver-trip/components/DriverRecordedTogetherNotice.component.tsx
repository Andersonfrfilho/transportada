/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { toRecordedTogetherTextKey } from '../shared/recordedTogether.service'
import type { StopEventStep } from '../shared/fieldReportResponse.service'
import styles from '../styles/driverTrip.module.css'

type DriverRecordedTogetherNoticeProps = Readonly<{
  /** `confirm`: antes do toque ("Vamos marcar..."); `done`: depois da resposta da API ("Marcamos..."). */
  mode: 'confirm' | 'done'
  onDismiss?: () => void
  steps: readonly StopEventStep[]
}>

/** Spec 294 RF5: avisa que a chegada (e a saída, se faltar) é marcada junto da baixa. */
export function DriverRecordedTogetherNotice({
  mode,
  onDismiss,
  steps,
}: DriverRecordedTogetherNoticeProps) {
  const { t } = useTranslation('driverTrip')
  const textKey = toRecordedTogetherTextKey(steps)
  if (textKey === undefined) return null

  return (
    <div className={styles.proofPendingWarning} role="status">
      <p className={styles.proofPendingWarningLead}>{t(`recordedTogether.${mode}.${textKey}`)}</p>
      {onDismiss === undefined ? null : (
        <Button type="button" variant="secondary" onClick={onDismiss}>
          <Icon name="check" />
          {t('recordedTogether.dismiss')}
        </Button>
      )}
    </div>
  )
}
