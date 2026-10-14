/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { formatActivityTime } from '../shared/documentActivity.service'
import { PROOF_PHOTO_REDUCTION_TIMEOUT_MS } from '../shared/proofPhotoReduction.service'
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

  if (upload.status === 'reducing') return <ProofReducingCountdown />

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

/**
 * Pedido do usuário (14/10): "aguarde N segundos" com ícone animado. A contagem é o teto da redução
 * (`PROOF_PHOTO_REDUCTION_TIMEOUT_MS`): passou dela, o original sobe como está — o motorista vê
 * quanto, no máximo, falta, e pode seguir e confirmar enquanto isso.
 */
function ProofReducingCountdown() {
  const { t } = useTranslation('driverTrip')
  const [secondsLeft, setSecondsLeft] = useState(PROOF_PHOTO_REDUCTION_TIMEOUT_MS / 1000)

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.proofUploadSending} role="status">
      <span className={styles.proofUploadSendingLine}>
        <span aria-hidden="true" className={styles.syncStatusSpinner} />
        {secondsLeft > 0
          ? t('proofCapture.upload.reducingCountdown', { seconds: secondsLeft })
          : t('proofCapture.upload.reducingAlmost')}
      </span>
      <span className={styles.stopMeta}>{t('proofCapture.upload.reducingHint')}</span>
    </div>
  )
}
