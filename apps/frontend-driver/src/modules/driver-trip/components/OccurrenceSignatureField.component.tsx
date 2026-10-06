/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { SignaturePad } from './SignaturePad.component'
import styles from '../styles/driverTrip.module.css'

type OccurrenceSignatureFieldProps = Readonly<{
  hasSignature: boolean
  isOpen: boolean
  isRequired: boolean
  onCancel: () => void
  onConfirm: (blob: Blob) => void
  onOpen: () => void
  previewUrl: string | undefined
}>

/**
 * Spec 246 (RF7, RF9): a assinatura **da ocorrência** — o mesmo `SignaturePad` do comprovante, mas
 * quem o recebe é o item da fila da ocorrência, nunca o canhoto. O pad só monta quando o motorista
 * abre; antes disso, nem o `<canvas>` existe.
 */
export function OccurrenceSignatureField({
  hasSignature,
  isOpen,
  isRequired,
  onCancel,
  onConfirm,
  onOpen,
  previewUrl,
}: OccurrenceSignatureFieldProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <div className={styles.proofCapture}>
      <p className={styles.proofCaptureTitle}>
        {t(
          isRequired
            ? 'occurrenceRegistration.signature.titleRequired'
            : 'occurrenceRegistration.signature.title',
        )}
      </p>
      {hasSignature && previewUrl !== undefined ? (
        <div className={styles.proofCaptureAttached} role="status">
          <img
            alt={t('signature.thumbnail')}
            className={styles.proofCaptureThumbnail}
            src={previewUrl}
          />
          <span className={styles.proofCaptureAttachedText}>
            <Icon name="check" />
            {t('signature.attached')}
          </span>
        </div>
      ) : null}
      <Button
        className={`${styles.proofCaptureAction} ${styles.proofCaptureWide}`}
        onClick={onOpen}
        type="button"
        variant="ghost"
      >
        <Icon name="pen" />
        {hasSignature ? t('occurrenceRegistration.signature.redo') : t('signature.open')}
      </Button>
      {isOpen ? <SignaturePad onCancel={onCancel} onConfirm={onConfirm} /> : null}
    </div>
  )
}
