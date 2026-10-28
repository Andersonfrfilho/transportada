/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { useContractorReplyWhatsAppOptionsQuery } from '../queries/contractorReplyWhatsApp.query'
import { useSendClientReplyMutation } from '../queries/occurrenceConversation.query'
import {
  CLIENT_REPLY_BODY_MAX_LENGTH,
  createClientReplyIdempotencyKey,
  listClientReplyTargets,
  resolveClientReplyFailure,
  validateClientReplyDraft,
} from '../shared/clientReply.service'
import type { OccurrenceClientChannel } from '../shared/occurrenceConversation.types'
import styles from '../styles/clientConversation.module.css'

/**
 * Spec 283 T5 (D6, RF7): responder ao cliente pelo painel — só por WhatsApp, pelo número escolhido em "Responder por".
 * O primeiro envio a um número pede confirmação do número mascarado; WhatsApp desligado desliga o campo e manda para
 * o envio por e-mail que já existe. A chave de idempotência é uma por mensagem escrita, mantida ao confirmar o número.
 */
export function ClientReplyComposer({
  channels,
  occurrenceId,
}: Readonly<{ channels: readonly OccurrenceClientChannel[]; occurrenceId: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const targets = listClientReplyTargets(channels)
  const mutation = useSendClientReplyMutation(occurrenceId)
  const options = useContractorReplyWhatsAppOptionsQuery({
    enabled: targets.length > 0,
    occurrenceId,
  })
  const [draft, setDraft] = useState('')
  const [pickedId, setPickedId] = useState('')
  const [draftError, setDraftError] = useState<'required' | 'tooLong' | null>(null)
  const [isConfirming, setConfirming] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createClientReplyIdempotencyKey(() => crypto.randomUUID()),
  )

  if (targets.length === 0) {
    return <p className={styles.hint}>{t('client.reply.noWhatsapp')}</p>
  }
  const target = targets.find((item) => item.id === pickedId) ?? targets[0]
  if (target === undefined) return null

  const failure = mutation.isError ? resolveClientReplyFailure(mutation.error) : null
  const isOff =
    options.data?.evolution.ready === false ||
    failure === 'whatsappOff' ||
    failure === 'unavailable'

  function send(confirmNumber: boolean): void {
    if (target === undefined) return
    const validated = validateClientReplyDraft(draft)
    if ('error' in validated) {
      setDraftError(validated.error)
      return
    }
    setDraftError(null)
    mutation.mutate(
      {
        body: validated.body,
        ...(confirmNumber ? { confirmNumber: true as const } : {}),
        idempotencyKey,
        replyTargetId: target.id,
      },
      {
        onError: (error) => {
          if (resolveClientReplyFailure(error) === 'confirmation') setConfirming(true)
        },
        onSuccess: () => {
          setDraft('')
          setConfirming(false)
          setIdempotencyKey(createClientReplyIdempotencyKey(() => crypto.randomUUID()))
        },
      },
    )
  }

  function handleSubmit(): void {
    if (target === undefined) return
    const validated = validateClientReplyDraft(draft)
    if ('error' in validated) {
      setDraftError(validated.error)
      return
    }
    setDraftError(null)
    if (!target.confirmed && !isConfirming) {
      setConfirming(true)
      return
    }
    send(!target.confirmed)
  }

  if (isOff) {
    return (
      <p className={styles.notice} role="status">
        <Icon name="alert" size="sm" />
        {t('client.reply.off')}
      </p>
    )
  }

  return (
    <form
      className={styles.composer}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        handleSubmit()
      }}
    >
      <div className={styles.field}>
        <span>{t('client.reply.replyBy')}</span>
        <Select
          ariaLabel={t('client.reply.replyBy')}
          disabled={mutation.isPending || targets.length === 1}
          onChange={(value) => {
            setPickedId(value)
            setConfirming(false)
          }}
          options={targets.map((item) => ({
            label: `${t('channel.whatsapp')} · ${item.channel.maskedAddress}`,
            value: item.id,
          }))}
          value={target.id}
        />
      </div>
      <label className={styles.field}>
        <span>{t('client.reply.message')}</span>
        <textarea
          aria-describedby="client-reply-hint"
          aria-invalid={draftError !== null}
          disabled={mutation.isPending}
          maxLength={CLIENT_REPLY_BODY_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          value={draft}
        />
        <span className={draftError === null ? styles.hint : styles.error} id="client-reply-hint">
          {draftError === null
            ? t('client.reply.hint', { number: target.channel.maskedAddress })
            : t(`client.reply.error.${draftError}`, { max: CLIENT_REPLY_BODY_MAX_LENGTH })}
        </span>
      </label>
      {isConfirming && !target.confirmed ? (
        <p className={styles.notice} role="alert">
          <Icon name="alert" size="sm" />
          {t('client.reply.confirm', { number: target.channel.maskedAddress })}
        </p>
      ) : null}
      {failure !== null && failure !== 'confirmation' ? (
        <p className={styles.error} role="alert">
          {t(`client.reply.failure.${failure}`)}
        </p>
      ) : null}
      <div className={styles.actions}>
        {isConfirming && !target.confirmed ? (
          <Button
            disabled={mutation.isPending}
            onClick={() => setConfirming(false)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t('client.reply.cancel')}
          </Button>
        ) : null}
        <Button disabled={mutation.isPending} size="sm" type="submit">
          <Icon name="send" size="sm" />
          {mutation.isPending
            ? t('client.reply.sending')
            : isConfirming && !target.confirmed
              ? t('client.reply.confirmAndSend')
              : t('client.reply.send')}
        </Button>
      </div>
    </form>
  )
}
