/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { FilePickerButton } from '@/components/ui/file-picker-button'
import { Icon } from '@/components/ui/icon'

import { useCameraCaptureFieldRef } from '../hooks/useCameraCaptureFieldRef.hook'
import { PROOF_CARGO_PHOTO_LIMIT } from '../shared/proofCargo.constant'
import styles from '../styles/driverTrip.module.css'

type ProofCargoFieldProps = Readonly<{
  attachedCount: number
  isRefused: boolean
  isRequired: boolean
  /** Quantas ainda faltam para o mínimo — só é mostrado quando o motorista já tentou confirmar. */
  missingCount: number
  onSelect: (file: File) => void
}>

export function ProofCargoField({
  attachedCount,
  isRefused,
  isRequired,
  missingCount,
  onSelect,
}: ProofCargoFieldProps) {
  const { t } = useTranslation('driverTrip')
  const cameraFieldRef = useCameraCaptureFieldRef()
  const galleryFieldRef = useCameraCaptureFieldRef()
  const canAttachMore = attachedCount < PROOF_CARGO_PHOTO_LIMIT

  return (
    <div className={styles.proofCapture}>
      <p className={styles.proofCaptureTitle}>{t('proofCapture.cargo.title')}</p>
      <p className={styles.stopMeta} role="status">
        {t('proofCapture.cargo.count', { count: attachedCount, limit: PROOF_CARGO_PHOTO_LIMIT })}
      </p>
      {canAttachMore ? (
        <div className={styles.proofCaptureGrid}>
          <FilePickerButton
            accept="image/*"
            capture="environment"
            className={styles.proofCaptureAction}
            inputRef={cameraFieldRef}
            onSelect={onSelect}
          >
            <Icon name="camera" />
            {t('proofCapture.cargo.take')}
            {isRequired && missingCount > 0 ? ' *' : ''}
          </FilePickerButton>
          <FilePickerButton
            accept="image/*"
            className={styles.proofCaptureAction}
            inputRef={galleryFieldRef}
            onSelect={onSelect}
          >
            <Icon name="upload" />
            {t('proofCapture.attach')}
          </FilePickerButton>
        </div>
      ) : (
        <p className={styles.stopMeta}>{t('proofCapture.cargo.limitReached')}</p>
      )}
      {missingCount > 0 ? (
        <span className={styles.proofFieldError} role="status">
          {t('proofCapture.cargo.pending', { count: missingCount })}
        </span>
      ) : null}
      {isRefused ? (
        <span className={styles.proofFieldError} role="status">
          {t('proofCapture.refused.cargo')}
        </span>
      ) : null}
    </div>
  )
}
