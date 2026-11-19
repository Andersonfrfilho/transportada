/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { TRIP_FEEDBACK_KEY_BY_ERROR } from '../shared/trip.constant'
import { PROOF_REPLACE_REASONS, type ProofReplaceReason } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

const DEFAULT_REASON = PROOF_REPLACE_REASONS[0]

export type ProofReplaceSubmission = Readonly<{
  file: File
  receiverName: string
  reason: ProofReplaceReason
}>

type ProofReplaceDialogProps = Readonly<{
  /** O nome que o comprovante atual já tem — a troca regrava a linha, e empresa com assinatura exige o nome. */
  defaultReceiverName: string
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (submission: ProofReplaceSubmission) => void
  serverErrorCode?: string
}>

function isReplaceReason(value: string): value is ProofReplaceReason {
  return (PROOF_REPLACE_REASONS as readonly string[]).includes(value)
}

/**
 * O escritório passa por cima do comprovante que o motorista enviou: foto nova e motivo, nada mais.
 * Mesma moldura do diálogo de recusa do canhoto — o aviso diz que a troca fica na trilha.
 */
export function ProofReplaceDialog({
  defaultReceiverName,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  serverErrorCode,
}: ProofReplaceDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [file, setFile] = useState<File | undefined>()
  const [reason, setReason] = useState<ProofReplaceReason>(DEFAULT_REASON)
  const [isMissingFile, setIsMissingFile] = useState(false)
  const [receiverName, setReceiverName] = useState(defaultReceiverName)

  /** Nada sobrevive a um fechamento sem confirmar — cada abertura começa do padrão. */
  useEffect(() => {
    if (!isOpen) return
    setFile(undefined)
    setReason(DEFAULT_REASON)
    setIsMissingFile(false)
    setReceiverName(defaultReceiverName)
  }, [defaultReceiverName, isOpen])

  if (!isOpen) return null

  const feedbackKey =
    serverErrorCode === undefined ? undefined : TRIP_FEEDBACK_KEY_BY_ERROR[serverErrorCode]
  const errorMessage = isMissingFile
    ? t('deliveryProof.replaceDialog.error.fileRequired')
    : serverErrorCode === undefined
      ? undefined
      : feedbackKey === undefined
        ? t('deliveryProof.replaceDialog.error.requestFailed')
        : t(`feedback.${feedbackKey}`)

  function handleSubmit() {
    if (file === undefined) {
      setIsMissingFile(true)
      return
    }
    onSubmit({ file, receiverName: receiverName.trim(), reason })
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="proof-replace-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="proof-replace-dialog-title">{t('deliveryProof.replaceDialog.title')}</h2>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.hint}>{t('deliveryProof.replaceDialog.warning')}</p>

        <FileField
          accept="image/*"
          actionLabel={t('deliveryProof.replaceDialog.fileChoose')}
          capture="environment"
          disabled={isSubmitting}
          isInvalid={isMissingFile}
          label={t('deliveryProof.replaceDialog.fileLabel')}
          onSelect={(selected) => {
            setFile(selected)
            setIsMissingFile(false)
          }}
          placeholder={t('deliveryProof.replaceDialog.fileEmpty')}
          {...(file === undefined ? {} : { fileName: file.name })}
        />

        <label>
          {t('deliveryProof.replaceDialog.reasonLabel')}
          <Select
            ariaLabel={t('deliveryProof.replaceDialog.reasonLabel')}
            onChange={(value) => {
              if (isReplaceReason(value)) setReason(value)
            }}
            options={PROOF_REPLACE_REASONS.map((option) => ({
              label: t(`deliveryProof.replaceDialog.reason.${option}`),
              value: option,
            }))}
            value={reason}
          />
        </label>

        <label>
          {t('fieldDelivery.receiverNameLabel')}
          <input
            autoComplete="off"
            onChange={(event) => setReceiverName(event.target.value)}
            value={receiverName}
          />
        </label>

        {errorMessage === undefined ? null : (
          <p className={styles.alert} role="alert">
            {errorMessage}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('deliveryProof.replaceDialog.cancel')}
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit} size="sm" type="button">
            <Icon name="check" />
            {t('deliveryProof.replaceDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
