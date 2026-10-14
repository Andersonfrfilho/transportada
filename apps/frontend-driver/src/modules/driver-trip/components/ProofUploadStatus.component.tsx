/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { ProofReducingMallet } from './ProofReducingMallet.component'
import { ProofSendingThrower } from './ProofSendingThrower.component'
import { formatActivityTime } from '../shared/documentActivity.service'
import {
  PROOF_PHOTO_REDUCTION_BUDGET_MS,
  resolveProofReductionPercent,
} from '../shared/proofPhotoReduction.service'
import type { ProofUploadView } from '../hooks/useProofUploadStatus.hook'
import type { ProofUploadFailure } from '../shared/proofUploadProgress.service'
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

  /** Spec 265 RF10: o servidor guardou o arquivo e o worker ainda o trata — o motorista segue, nada a esperar. */
  if (upload.processingState !== undefined) {
    return (
      <span className={styles.proofUploadChip} role="status">
        <Icon aria-hidden="true" name="clock" size="sm" />
        {t('proofCapture.upload.sentProcessing')}
      </span>
    )
  }

  /** Colhida antes da entrega, ou atrás dela na fila: nada sobe ainda, e a tela diz o que falta. */
  if (upload.status === 'waiting') {
    return (
      <div className={styles.proofQueueCard} role="status">
        <span className={styles.proofQueueTitle}>
          <Icon aria-hidden="true" name="clock" size="sm" />
          {t('proofCapture.upload.queuedTitle')}
        </span>
        <span>
          {t(
            upload.waitingFor === 'confirm'
              ? 'proofCapture.upload.waitingConfirm'
              : 'proofCapture.upload.waitingDelivery',
          )}
        </span>
      </div>
    )
  }

  if (upload.status === 'uploading') {
    return (
      <div className={styles.proofQueueCard} role="status">
        <span className={styles.proofQueueTitle}>
          {/* A nuvem só anima com bytes saindo de verdade (porcentagem real); parada na fila é relógio. */}
          {upload.uploadPercent === undefined ? (
            <span
              aria-label={t('proofCapture.upload.queuedIcon')}
              className={styles.proofQueuedIcon}
              role="img"
            >
              <Icon aria-hidden="true" name="clock" size="sm" />
            </span>
          ) : (
            <ProofSendingThrower />
          )}
          {t('proofCapture.upload.queuedTitle')}
        </span>
        {upload.uploadPercent === undefined ? (
          <span>{t('proofCapture.upload.queuedHint')}</span>
        ) : (
          <ProofUploadProgressBar percent={upload.uploadPercent} />
        )}
        {upload.failure === undefined ? null : (
          <span className={styles.proofFieldError}>
            {t('proofCapture.upload.lastTryFailed', {
              reason: t(describeFailureKey(upload.failure), { status: upload.failure.status }),
            })}
          </span>
        )}
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

/** O motivo da última tentativa, na língua do motorista — sem código nem texto do servidor. */
function describeFailureKey(failure: ProofUploadFailure): string {
  return `proofCapture.upload.failure.${failure.kind}`
}

/**
 * Spec 265 RF12: porcentagem REAL de subida (bytes enviados / total, do `XMLHttpRequest`) e a barra
 * proporcional a ela — diferente da redução abaixo, que é estimativa por tempo.
 */
function ProofUploadProgressBar({ percent }: Readonly<{ percent: number }>) {
  const { t } = useTranslation('driverTrip')
  return (
    <>
      <span className={styles.proofReducingPercent}>
        {t('proofCapture.upload.uploadingPercent', { percent })}
      </span>
      <span
        aria-label={t('proofCapture.upload.uploadingProgress')}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className={styles.proofReducingTrack}
        role="progressbar"
      >
        <span
          className={styles.proofUploadFill}
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </span>
    </>
  )
}

/**
 * Pedido do usuário (14/10): "aguarde N segundos" com ícone animado. A contagem é o orçamento da redução (8 s, spec 265)
 * (`PROOF_PHOTO_REDUCTION_BUDGET_MS`): passou dela, o original sobe como está — o motorista vê
 * quanto, no máximo, falta, e pode seguir e confirmar enquanto isso.
 */
function ProofReducingCountdown() {
  const { t } = useTranslation('driverTrip')
  const [secondsLeft, setSecondsLeft] = useState(PROOF_PHOTO_REDUCTION_BUDGET_MS / 1000)

  useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={styles.proofUploadSending} role="status">
      <span className={styles.proofUploadSendingLine}>
        <ProofReducingMallet />
        {secondsLeft > 0
          ? t('proofCapture.upload.reducingCountdown', { seconds: secondsLeft })
          : t('proofCapture.upload.reducingAlmost')}
        <span className={styles.proofReducingPercent}>
          {resolveProofReductionPercent({
            elapsedMs: PROOF_PHOTO_REDUCTION_BUDGET_MS - secondsLeft * 1000,
          })}
          %
        </span>
      </span>
      <span aria-hidden="true" className={styles.proofReducingTrack}>
        <span
          className={styles.proofReducingFill}
          style={{ animationDuration: `${PROOF_PHOTO_REDUCTION_BUDGET_MS}ms` }}
        />
      </span>
      <span className={styles.stopMeta}>{t('proofCapture.upload.reducingHint')}</span>
    </div>
  )
}
