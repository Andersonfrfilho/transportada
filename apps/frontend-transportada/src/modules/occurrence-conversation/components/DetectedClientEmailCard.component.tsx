/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  useDetectedClientEmailQuery,
  useSendDetectedClientEmailMutation,
} from '../queries/detectedClientEmail.query'
import {
  type ClientEmailSendOutcome,
  createClientEmailIdempotencyKey,
  resolveEmailFailureKey,
} from '../shared/contractorReplyEmail.service'
import {
  DETECTED_CLIENT_EMAIL_NOT_FOUND,
  isDetectedEmailSent,
} from '../shared/detectedClientEmail.service'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import styles from '../styles/occurrenceThread.module.css'

type DetectedClientEmailCardProps = Readonly<{
  /** Sem permissão de resolver a ocorrência, o cartão nem consulta a API. */
  isEnabled: boolean
  occurrenceId: string
}>

type Sent = Readonly<{ addressMasked: string; outcome: ClientEmailSendOutcome }>

function newKey(): string {
  return createClientEmailIdempotencyKey(() => crypto.randomUUID())
}

function failureMessageKey(error: unknown): string {
  const code = error instanceof OccurrenceConversationRequestError ? error.code : ''
  if (code === DETECTED_CLIENT_EMAIL_NOT_FOUND) return 'detectedEmail.failure.notFound'
  return `replyEmail.failure.${resolveEmailFailureKey(code)}`
}

/**
 * Spec 279 T4b (RF8): o cartão "Enviar o boleto para a***@…?" na aba do motorista, quando ele escreveu um e-mail na
 * conversa depois do boleto aceito. Reconhecer não é enviar: nada sai sem o toque do operador (ou do motorista no
 * app). "Enviar e guardar" leva o endereço ao cadastro do cliente. O endereço só aparece mascarado.
 */
export function DetectedClientEmailCard({ isEnabled, occurrenceId }: DetectedClientEmailCardProps) {
  const { t } = useTranslation('occurrenceConversation')
  const titleId = useId()
  const pending = useDetectedClientEmailQuery({ enabled: isEnabled, occurrenceId }).data
  const send = useSendDetectedClientEmailMutation(occurrenceId)
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const [sent, setSent] = useState<null | Sent>(null)

  if (sent !== null) {
    const isOk = isDetectedEmailSent(sent.outcome)
    return (
      <section
        aria-labelledby={titleId}
        className={`${styles.notice} ${isOk ? styles.noticeInfo : styles.noticeAlert}`}
      >
        <h4 className={styles.noticeTitle} id={titleId}>
          <Icon name="message" size="sm" />
          {t('detectedEmail.title')}
        </h4>
        <p className={styles.noticeBody} role="status">
          {t(isOk ? 'detectedEmail.sent' : 'detectedEmail.notSent', {
            address: sent.addressMasked,
          })}
          {isOk && sent.outcome.savedEmailId !== null ? ` ${t('detectedEmail.savedNow')}` : ''}
        </p>
        <div className={styles.noticeActions}>
          <Button onClick={() => setSent(null)} size="sm" type="button" variant="ghost">
            {t('detectedEmail.dismiss')}
          </Button>
        </div>
      </section>
    )
  }
  if (!isEnabled || pending === null || pending === undefined) return null

  function submit(save: boolean): void {
    if (pending === null || pending === undefined) return
    const { addressMasked, messageId } = pending
    send.mutate(
      { idempotencyKey, messageId, save },
      {
        onError: () => setIdempotencyKey(newKey()),
        onSuccess: (outcome) => {
          setSent({ addressMasked, outcome })
          setIdempotencyKey(newKey())
        },
      },
    )
  }

  return (
    <section aria-labelledby={titleId} className={`${styles.notice} ${styles.noticeInfo}`}>
      <h4 className={styles.noticeTitle} id={titleId}>
        <Icon name="message" size="sm" />
        {t('detectedEmail.title')}
      </h4>
      <p className={styles.noticeBody}>
        <strong>{t('detectedEmail.question', { address: pending.addressMasked })}</strong>
      </p>
      <p className={styles.hint}>{t('detectedEmail.hint')}</p>
      {send.isError ? (
        <p className={styles.error} role="alert">
          {t(failureMessageKey(send.error))}
        </p>
      ) : null}
      <div className={styles.noticeActions}>
        <Button disabled={send.isPending} onClick={() => submit(false)} size="sm" type="button">
          <Icon name="send" size="sm" />
          {send.isPending ? t('detectedEmail.sending') : t('detectedEmail.send')}
        </Button>
        <Button
          disabled={send.isPending}
          onClick={() => submit(true)}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t('detectedEmail.sendAndSave')}
        </Button>
      </div>
    </section>
  )
}
