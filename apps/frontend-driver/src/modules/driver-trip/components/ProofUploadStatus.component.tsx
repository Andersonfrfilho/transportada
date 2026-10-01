/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { formatActivityTime } from '../shared/documentActivity.service'
import { PROOF_SENDING_BAR_HEIGHT, PROOF_SENDING_BAR_WIDTH } from '../shared/proofUpload.constant'
import type { ProofUploadView } from '../hooks/useProofUploadStatus.hook'
import styles from '../styles/driverTrip.module.css'

type ProofUploadStatusProps = Readonly<{
  upload: ProofUploadView
}>

/**
 * Os três estados da moldura do anexo: enviando (barra e a promessa de que segue sem sinal),
 * enviada (chip verde com a hora) e falhou (o indicador sai e a frase diz o que houve).
 */
export function ProofUploadStatus({ upload }: ProofUploadStatusProps) {
  const { t } = useTranslation('driverTrip')

  if (upload.status === 'uploading') {
    return (
      <div className={styles.proofUploadSending} role="status">
        <span className={styles.proofUploadSendingLine}>
          <Skeleton
            height={PROOF_SENDING_BAR_HEIGHT}
            variant="text"
            width={PROOF_SENDING_BAR_WIDTH}
          />
          {t('proofCapture.upload.sending')}
        </span>
        <span className={styles.stopMeta}>{t('proofCapture.upload.savedOnDevice')}</span>
      </div>
    )
  }

  if (upload.status === 'sent' && upload.sentAt !== undefined) {
    return (
      <span className={styles.proofUploadChip} role="status">
        <Icon aria-hidden="true" name="check" size="sm" />
        {t('proofCapture.upload.sent', { time: formatActivityTime(upload.sentAt) })}
      </span>
    )
  }

  if (upload.status === 'failed') {
    return (
      <span className={styles.proofFieldError} role="status">
        {t('proofCapture.upload.failed')}
      </span>
    )
  }

  return null
}
