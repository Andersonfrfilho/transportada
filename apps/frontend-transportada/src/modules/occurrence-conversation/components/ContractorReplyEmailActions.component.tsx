/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  useContractorReplyEmailOptionsQuery,
  useForwardContractorReplyByEmailMutation,
} from '../queries/contractorReplyEmail.query'
import {
  createContractorReplyEmailIdempotencyKey,
  parseInformedAddress,
  resolveEmailFailureKey,
  resolveInformedEmailAction,
  resolveNoteEmailAction,
  type ContractorReplyEmailOutcome,
  type ContractorReplyEmailTarget,
} from '../shared/contractorReplyEmail.service'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import styles from '../styles/occurrenceConversation.module.css'

type ContractorReplyEmailActionsProps = Readonly<{
  attachmentId: string
  occurrenceId: string
}>

type Feedback = Readonly<{ isError: boolean; text: string }>

function newKey(): string {
  return createContractorReplyEmailIdempotencyKey(() => crypto.randomUUID())
}

/**
 * Spec 248 RF9–RF11 (T4.7): levar o boleto que a contratante mandou ao e-mail do cliente da nota, ou a um
 * endereço que o operador digita. O botão do cliente da nota fica à vista mesmo sem e-mail na nota, desligado e
 * com o motivo ao lado — nunca some calado, e o envio nunca cai noutro endereço. O endereço digitado é
 * conferido aqui com a regra da API (um só, sem vírgula nem quebra de linha), e a recusa dela volta no campo.
 */
export function ContractorReplyEmailActions({
  attachmentId,
  occurrenceId,
}: ContractorReplyEmailActionsProps) {
  const { t } = useTranslation('occurrenceConversation')
  const baseId = useId()
  const options = useContractorReplyEmailOptionsQuery({ enabled: true, occurrenceId }).data
  const forward = useForwardContractorReplyByEmailMutation(occurrenceId)
  const [isFormOpen, setFormOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [addressErrorKey, setAddressErrorKey] = useState<null | string>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [noteKey, setNoteKey] = useState(newKey)
  const [informedKey, setInformedKey] = useState(newKey)

  if (options === null || options === undefined) return null
  const note = resolveNoteEmailAction(options)
  const informed = resolveInformedEmailAction(options)
  if (note.kind === 'hidden' && informed.kind === 'hidden') return null

  function describe(outcome: ContractorReplyEmailOutcome): Feedback {
    if (outcome.kind === 'queued') {
      return {
        isError: false,
        text: t('replyEmail.outcome.queued', { address: outcome.addressMasked ?? '' }),
      }
    }
    if (outcome.kind === 'already_queued') {
      return { isError: false, text: t('replyEmail.outcome.alreadyQueued') }
    }
    const known = ['note_without_recipient_email', 'attachment_too_large_for_email']
    const reason = known.includes(outcome.reason) ? outcome.reason : 'send_failed'
    return { isError: true, text: t(`replyEmail.outcome.${reason}`) }
  }

  function send(target: ContractorReplyEmailTarget, typedAddress: string | undefined): void {
    const idempotencyKey = target === 'informed_email' ? informedKey : noteKey
    const renew = target === 'informed_email' ? setInformedKey : setNoteKey
    setFeedback(null)
    forward.mutate(
      {
        attachmentId,
        idempotencyKey,
        target,
        ...(typedAddress === undefined ? {} : { address: typedAddress }),
      },
      {
        onError: (failure) => {
          const code = failure instanceof OccurrenceConversationRequestError ? failure.code : ''
          const key = resolveEmailFailureKey(code)
          if (key === 'addressInvalid') setAddressErrorKey('addressInvalid')
          else setFeedback({ isError: true, text: t(`replyEmail.failure.${key}`) })
          renew(newKey())
        },
        onSuccess: (outcome) => {
          setFeedback(describe(outcome))
          renew(newKey())
          if (target === 'informed_email' && outcome.kind === 'queued') {
            setFormOpen(false)
            setAddress('')
          }
        },
      },
    )
  }

  function handleSubmitInformed(): void {
    const parsed = parseInformedAddress(address)
    if (parsed === null) {
      setAddressErrorKey('addressInvalid')
      return
    }
    setAddressErrorKey(null)
    send('informed_email', parsed)
  }

  const noteReasonId = `${baseId}-note-reason`
  const informedReasonId = `${baseId}-informed-reason`
  const addressErrorId = `${baseId}-address-error`
  return (
    <div className={styles.replyEmail}>
      <div className={styles.replyEmailButtons}>
        {note.kind === 'hidden' ? null : (
          <Button
            aria-describedby={note.kind === 'disabled' ? noteReasonId : undefined}
            disabled={note.kind === 'disabled' || forward.isPending}
            onClick={() => send('note_recipient_email', undefined)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="send" size="sm" />
            {t('replyEmail.sendToNote')}
          </Button>
        )}
        {informed.kind === 'hidden' ? null : (
          <Button
            aria-describedby={informed.kind === 'disabled' ? informedReasonId : undefined}
            aria-expanded={isFormOpen}
            disabled={informed.kind === 'disabled' || forward.isPending}
            onClick={() => setFormOpen((current) => !current)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="export" size="sm" />
            {t('replyEmail.forwardToAddress')}
          </Button>
        )}
      </div>
      {note.kind === 'disabled' ? (
        <span className={styles.hint} id={noteReasonId}>
          {t(`replyEmail.reason.${note.reason}`)}
        </span>
      ) : null}
      {informed.kind === 'disabled' && note.kind !== 'disabled' ? (
        <span className={styles.hint} id={informedReasonId}>
          {t(`replyEmail.reason.${informed.reason}`)}
        </span>
      ) : null}
      {isFormOpen ? (
        <form
          className={styles.replyEmailForm}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmitInformed()
          }}
        >
          <label className={styles.field}>
            <span>{t('replyEmail.addressLabel')}</span>
            <input
              aria-describedby={addressErrorKey === null ? undefined : addressErrorId}
              aria-invalid={addressErrorKey !== null}
              autoComplete="off"
              disabled={forward.isPending}
              inputMode="email"
              maxLength={254}
              onChange={(event) => {
                setAddress(event.target.value)
                setAddressErrorKey(null)
              }}
              type="text"
              value={address}
            />
            {addressErrorKey === null ? (
              <span className={styles.hint}>{t('replyEmail.addressHint')}</span>
            ) : (
              <span className={styles.error} id={addressErrorId} role="alert">
                {t(`replyEmail.failure.${addressErrorKey}`)}
              </span>
            )}
          </label>
          <div className={styles.footer}>
            <Button
              disabled={forward.isPending}
              onClick={() => {
                setFormOpen(false)
                setAddressErrorKey(null)
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('replyEmail.cancel')}
            </Button>
            <Button disabled={forward.isPending} size="sm" type="submit">
              {forward.isPending ? t('replyEmail.sending') : t('replyEmail.send')}
            </Button>
          </div>
        </form>
      ) : null}
      <p aria-live="polite" className={feedback?.isError === true ? styles.error : styles.hint}>
        {feedback?.text ?? ''}
      </p>
    </div>
  )
}
