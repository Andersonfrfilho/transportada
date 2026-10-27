/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  useDriverDetectedClientEmailQuery,
  useSendDriverDetectedClientEmailMutation,
} from '../shared/driverDetectedClientEmail.query'
import {
  type DriverDetectedEmailOutcome,
  isDriverDetectedEmailSent,
} from '../shared/driverDetectedClientEmail.service'
import styles from '../styles/detectedClientEmail.module.css'

type DetectedClientEmailCardProps = Readonly<{ canSync: boolean; occurrenceId: string }>

type Sent = Readonly<{ addressMasked: string; outcome: DriverDetectedEmailOutcome }>

const newKey = (): string => `detected-email:${crypto.randomUUID()}`

/**
 * Spec 279 T4b (RF8): o motorista escreveu um e-mail na conversa depois do boleto aceito, e a API reconheceu. O
 * cartão pergunta "Enviar o boleto para a***@…?" com Enviar e Enviar e guardar para o cliente; nada sai sem o toque.
 * Vai no cartão do assunto da conversa, o espaço que o pacote dá à app (o mesmo do "Ver detalhes" da T6c).
 */
export function DetectedClientEmailCard({ canSync, occurrenceId }: DetectedClientEmailCardProps) {
  const { t } = useTranslation('conversation')
  const titleId = useId()
  const pending = useDriverDetectedClientEmailQuery({ canSync, id: occurrenceId }).data
  const send = useSendDriverDetectedClientEmailMutation(occurrenceId)
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const [sent, setSent] = useState<null | Sent>(null)

  if (sent !== null) {
    const isOk = isDriverDetectedEmailSent(sent.outcome)
    return (
      <section
        aria-labelledby={titleId}
        className={`${styles.card} ${isOk ? '' : styles.cardAlert}`}
      >
        <p className={styles.title} id={titleId}>
          <Icon name={isOk ? 'check' : 'alert'} size="sm" />
          {t(isOk ? 'detectedEmail.sent' : 'detectedEmail.notSent', {
            address: sent.addressMasked,
          })}
        </p>
        {isOk && sent.outcome.savedEmailId !== null ? (
          <p className={styles.hint} role="status">
            {t('detectedEmail.savedNow')}
          </p>
        ) : null}
        <div className={styles.actions}>
          <Button onClick={() => setSent(null)} type="button" variant="ghost">
            {t('detectedEmail.dismiss')}
          </Button>
        </div>
      </section>
    )
  }
  if (pending === null || pending === undefined) return null

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
    <section aria-labelledby={titleId} className={styles.card}>
      <p className={styles.title} id={titleId}>
        <Icon name="message" size="sm" />
        {t('detectedEmail.question', { address: pending.addressMasked })}
      </p>
      <p className={styles.hint}>{t('detectedEmail.hint')}</p>
      {send.isError ? (
        <p className={styles.error} role="alert">
          {t(canSync ? 'detectedEmail.failure' : 'detectedEmail.offline')}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button disabled={send.isPending || !canSync} onClick={() => submit(false)} type="button">
          <Icon name="send" size="sm" />
          {send.isPending ? t('detectedEmail.sending') : t('detectedEmail.send')}
        </Button>
        <Button
          disabled={send.isPending || !canSync}
          onClick={() => submit(true)}
          type="button"
          variant="secondary"
        >
          {t('detectedEmail.sendAndSave')}
        </Button>
      </div>
    </section>
  )
}
