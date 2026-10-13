/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  useSendContractorPortalMessageMutation,
  useSendDriverAppMessageMutation,
} from '../queries/occurrenceConversation.query'
import { isForwardAlreadyDone } from '../shared/conversationAttachment.service'
import { resendChannelFor } from '../shared/messageStatus.service'
import {
  createDriverMessageIdempotencyKey,
  createPortalMessageIdempotencyKey,
} from '../shared/occurrenceConversation.service'
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationMessage,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceThread.module.css'

type ResendTarget = Readonly<{
  /** Reenvio por e-mail abre o diálogo com o texto; os outros canais saem direto. Sem isto, e-mail não é oferecido. */
  onOpenMail?: (message: OccurrenceConversationMessage) => void
  occurrenceId: string
}>

type ResendActionProps = ResendTarget &
  Readonly<{
    channel: OccurrenceConversationChannel
    message: OccurrenceConversationMessage
  }>

/**
 * A chave é da mensagem que falhou: o segundo clique é o mesmo reenvio ("já reenviada"), nunca outra mensagem.
 * O texto vai como estava; o aviso diz por onde.
 */
function ResendDirectAction({ channel, message, occurrenceId }: ResendActionProps) {
  const { t } = useTranslation('occurrenceConversation')
  const portal = useSendContractorPortalMessageMutation(occurrenceId)
  const driver = useSendDriverAppMessageMutation(occurrenceId)
  const send = channel === 'app' ? driver : portal
  const createKey =
    channel === 'app' ? createDriverMessageIdempotencyKey : createPortalMessageIdempotencyKey
  const channelLabel = t(`channel.${channel}`)
  if (send.isSuccess || isForwardAlreadyDone(send.error)) {
    return (
      <span className={styles.hint}>{t('thread.failures.resent', { channel: channelLabel })}</span>
    )
  }
  return (
    <>
      <Button
        disabled={send.isPending}
        onClick={() =>
          send.mutate({
            body: message.bodyText,
            files: [],
            idempotencyKey: createKey(() => `resend-${message.id}`),
            uploaded: new Map(),
          })
        }
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="send" size="sm" />
        {t('failure.resend', { channel: channelLabel })}
      </Button>
      {send.isError ? (
        <span className={styles.error} role="alert">
          {t('thread.failures.resendError')}
        </span>
      ) : null}
    </>
  )
}

function ResendAction(props: ResendActionProps) {
  const { t } = useTranslation('occurrenceConversation')
  const { onOpenMail } = props
  if (props.channel !== 'email') return <ResendDirectAction {...props} />
  if (onOpenMail === undefined) return null
  return (
    <Button onClick={() => onOpenMail(props.message)} size="sm" type="button" variant="secondary">
      <Icon name="send" size="sm" />
      {t('failure.resend', { channel: t('channel.email') })}
    </Button>
  )
}

type OccurrenceThreadFailuresProps = ResendTarget &
  Readonly<{
    messages: readonly OccurrenceConversationMessage[]
    participant: 'contractor' | 'driver'
    portalAvailable: boolean
    /** Sem permissão de escrita não há reenvio; a falha continua dita. */
    canResend: boolean
  }>

/**
 * A mensagem nossa que falhou ou voltou: ícone + palavra + cor, o motivo por canal e, quando existe outro canal
 * da mesma parte, "Reenviar por …". O SDK mostra o ✕ no balão; o reenvio por outro canal ele não conhece.
 */
export function OccurrenceThreadFailures({
  canResend,
  messages,
  occurrenceId,
  onOpenMail,
  participant,
  portalAvailable,
}: OccurrenceThreadFailuresProps) {
  const { t } = useTranslation('occurrenceConversation')
  const titleId = useId()
  const failed = messages.filter(
    (message) =>
      message.direction === 'outbound' &&
      (message.status === 'failed' || message.status === 'bounced'),
  )
  if (failed.length === 0) return null

  return (
    <section
      aria-labelledby={titleId}
      className={`${styles.notice} ${styles.noticeAlert}`}
      role="status"
    >
      <h4 className={styles.noticeTitle} id={titleId}>
        <Icon name="alert" size="sm" />
        {t('thread.failures.title')}
      </h4>
      <ul className={styles.attachmentList}>
        {failed.map((message) => {
          const channel = canResend
            ? resendChannelFor(message, { participant, portalAvailable })
            : null
          return (
            <li className={styles.notice} key={message.id}>
              <p className={styles.noticeBody}>
                <span className={styles.tag}>{t(`status.${message.status ?? 'failed'}`)}</span>{' '}
                {t(
                  `failure.${message.status === 'bounced' ? 'bounced' : 'failed'}.${message.channel}`,
                )}
              </p>
              <p className={styles.hint}>{message.bodyText}</p>
              {channel === null ? null : (
                <div className={styles.noticeActions}>
                  <ResendAction
                    channel={channel}
                    message={message}
                    occurrenceId={occurrenceId}
                    {...(onOpenMail === undefined ? {} : { onOpenMail })}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
