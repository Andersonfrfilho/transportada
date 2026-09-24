/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  useContractorMailPreviewMutation,
  useSendContractorMailMutation,
} from '../queries/occurrenceConversation.query'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import {
  buildContractorMailRequest,
  createOccurrenceMailIdempotencyKey,
  initialRecipientIds,
  validateContractorMailDraft,
} from '../shared/occurrenceConversation.service'
import styles from '../styles/occurrenceConversation.module.css'

const KNOWN_ERRORS = new Set([
  'CONTRACTOR_MAIL_NOT_CONFIGURED',
  'CONTRACTOR_MAIL_SENDING_NOT_VERIFIED',
  'OCCURRENCE_CONVERSATION_CONTRACTOR_UNKNOWN',
  'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
  'OCCURRENCE_CONVERSATION_MAIL_INVALID',
  'OCCURRENCE_CONVERSATION_NO_RECIPIENT',
])

function errorKey(error: unknown): string {
  if (error instanceof OccurrenceConversationRequestError && KNOWN_ERRORS.has(error.code)) {
    return `dialog.error.${error.code}`
  }
  return 'dialog.error.generic'
}

type SendToContractorDialogProps = Readonly<{
  onClose: () => void
  occurrenceId: string
}>

/**
 * Spec 183 T407 (P4, RF7): o diálogo abre com o texto do tipo da ocorrência (079) e os contatos do
 * grupo marcados; "Ver prévia" mostra o e-mail que sai, com a assinatura — a mesma função do envio.
 * Uma chave de idempotência por abertura: reenviar depois de uma queda de rede não duplica.
 */
export function SendToContractorDialog({ onClose, occurrenceId }: SendToContractorDialogProps) {
  const { t } = useTranslation('occurrenceConversation')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const initialPreview = useContractorMailPreviewMutation(occurrenceId)
  const livePreview = useContractorMailPreviewMutation(occurrenceId)
  const send = useSendContractorMailMutation(occurrenceId)
  const [idempotencyKey] = useState(() =>
    createOccurrenceMailIdempotencyKey(() => crypto.randomUUID()),
  )
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [contactIds, setContactIds] = useState<readonly string[]>([])
  const [isSubmitted, setSubmitted] = useState(false)

  const { mutate: loadInitialPreview } = initialPreview
  useEffect(() => {
    loadInitialPreview(
      {},
      {
        onSuccess: (preview) => {
          setSubject(preview.subject)
          setBody(preview.bodyText)
          setContactIds(initialRecipientIds(preview.recipients))
        },
      },
    )
  }, [loadInitialPreview])

  const preview = initialPreview.data
  const draft = { body, contactIds, subject }
  const errors = isSubmitted ? validateContractorMailDraft(draft) : {}
  const isBusy = send.isPending

  function submit(): void {
    setSubmitted(true)
    if (Object.keys(validateContractorMailDraft(draft)).length > 0) return
    send.mutate(
      { idempotencyKey, request: buildContractorMailRequest(draft) },
      { onSuccess: onClose },
    )
  }

  // Fora de `document.body` o overlay herdaria o `transform` da transição de página.
  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="send-to-contractor-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="send-to-contractor-title">{t('dialog.title')}</h2>
            {preview === undefined || preview.contractorName === '' ? null : (
              <p className={styles.hint}>{preview.contractorName}</p>
            )}
          </div>
          <button
            aria-label={t('dialog.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {preview === undefined ? (
          initialPreview.isError ? (
            <p className={styles.error} role="alert">
              {t(errorKey(initialPreview.error))}
            </p>
          ) : (
            <SkeletonGroup label={t('dialog.loading')}>
              <Skeleton height="2.5rem" width="100%" />
              <Skeleton height="8rem" width="100%" />
            </SkeletonGroup>
          )
        ) : (
          <form
            className={styles.panel}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <fieldset className={styles.fieldset} disabled={isBusy}>
              <legend>{t('dialog.recipients')}</legend>
              {preview.recipients.length === 0 ? (
                <p className={styles.hint}>{t('dialog.recipientsEmpty')}</p>
              ) : (
                preview.recipients.map((recipient) => (
                  <div className={styles.recipient} key={recipient.contactId}>
                    <Checkbox
                      checked={contactIds.includes(recipient.contactId)}
                      label={
                        recipient.name === ''
                          ? recipient.email
                          : `${recipient.name} · ${recipient.email}`
                      }
                      onChange={(checked) =>
                        setContactIds((current) =>
                          checked
                            ? [...current, recipient.contactId]
                            : current.filter((id) => id !== recipient.contactId),
                        )
                      }
                    />
                    {recipient.roleLabel === '' ? null : (
                      <span className={styles.hint}>{recipient.roleLabel}</span>
                    )}
                    {recipient.approvesCharges ? (
                      <span className={styles.tag}>{t('author.approvesCharges')}</span>
                    ) : null}
                  </div>
                ))
              )}
              {errors.recipients === undefined ? null : (
                <p className={styles.error}>{t('dialog.recipientsRequired')}</p>
              )}
            </fieldset>

            <label className={styles.field}>
              <span>{t('dialog.subject')}</span>
              <input
                disabled={isBusy}
                maxLength={200}
                onChange={(event) => setSubject(event.target.value)}
                value={subject}
              />
              {errors.subject === undefined ? null : (
                <span className={styles.error}>{t('dialog.subjectRequired')}</span>
              )}
            </label>

            <label className={styles.field}>
              <span>{t('dialog.body')}</span>
              <textarea
                disabled={isBusy}
                maxLength={8000}
                onChange={(event) => setBody(event.target.value)}
                rows={8}
                value={body}
              />
              {preview.suggested && body === preview.bodyText ? (
                <span className={styles.hint}>{t('dialog.suggested')}</span>
              ) : null}
              {errors.body === undefined ? null : (
                <span className={styles.error}>{t('dialog.bodyRequired')}</span>
              )}
            </label>

            {livePreview.data === undefined ? null : (
              <section aria-labelledby="send-to-contractor-preview" className={styles.panel}>
                <h3 className={styles.hint} id="send-to-contractor-preview">
                  {t('dialog.previewTitle')}
                </h3>
                <pre className={styles.preview}>{livePreview.data.text}</pre>
              </section>
            )}

            {send.isError ? (
              <p className={styles.error} role="alert">
                {t(errorKey(send.error))}
              </p>
            ) : null}

            <div className={styles.footer}>
              <Button onClick={onClose} type="button" variant="ghost">
                {t('dialog.cancel')}
              </Button>
              <Button
                disabled={isBusy || livePreview.isPending}
                onClick={() => livePreview.mutate({ body, subject })}
                type="button"
                variant="secondary"
              >
                {t('dialog.preview')}
              </Button>
              <Button disabled={isBusy} type="submit">
                {isBusy ? t('dialog.sending') : t('dialog.send')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
