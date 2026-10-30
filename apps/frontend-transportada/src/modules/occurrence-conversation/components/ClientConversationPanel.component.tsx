/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ConversationThread } from '@adatechnology/conversations-ui/participant'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { useContractorReplyWhatsAppOptionsQuery } from '../queries/contractorReplyWhatsApp.query'
import {
  CONVERSATION_STATUS_REFETCH_MS,
  fetchOccurrenceConversations,
  getOccurrenceConversationClient,
  OCCURRENCE_CONVERSATIONS_QUERY_KEY,
} from '../queries/occurrenceConversation.query'
import { useComposerQuickRepliesQuery } from '../queries/quickReplies.query'
import { createClientThreadApi } from '../shared/clientThreadApi.service'
import { listClientReplyTargets, resolveClientReplyFailure } from '../shared/clientReply.service'
import type { ConversationParticipant } from '../shared/conversationParticipant.constant'
import type { OccurrenceConversation } from '../shared/occurrenceConversation.types'
import { SUBJECT_AUDIO_RECORDING_OPTIONS } from '../shared/subjectAudioRecording.service'
import { toThreadQuickReplies } from '../shared/quickReplies.service'
import { createRefreshSubscription } from '../shared/subjectThreadApi.service'
import { buildSubjectThreadLabels } from '../shared/subjectThreadLabels.service'
import styles from '../styles/clientConversation.module.css'
import subjectStyles from '../styles/subjectConversation.module.css'
import threadStyles from '../styles/occurrenceThread.module.css'
import { ClientChannelsStrip } from './ClientChannelsStrip.component'
import { OccurrenceDetailsAction } from './OccurrenceDetailsAction.component'
import { ParticipantAvatar, participantToneClass } from './ParticipantBadge.component'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

/**
 * Spec 283 D2/D4 + o chat do cliente: a conversa do cliente na ocorrência é o mesmo `ConversationThread` do motorista
 * (balões, anexo, histórico, formatação e emojis), com os canais abertos no topo. A resposta sai só pelo WhatsApp, pelo
 * número de "Responder por"; o primeiro envio a um número pede a confirmação dele (D6). Nasce no primeiro envio (D3).
 */
export function ClientConversationPanel({
  canReply = false,
  companyId,
  conversation,
  hideChannels = false,
  occurrenceId,
}: Readonly<{
  /** Spec 283 T5: quem já pode enviar ao cliente (`occurrences.resolve`) escreve no chat. */
  canReply?: boolean
  companyId?: string
  conversation: OccurrenceConversation
  /** A faixa recolhida já mostra os canais no cabeçalho. */
  hideChannels?: boolean
  occurrenceId: string
}>) {
  const { i18n, t } = useTranslation('occurrenceConversation')
  const { t: tSubject } = useTranslation('subjectConversation')
  const queryClient = useQueryClient()
  const channels = conversation.client?.channels ?? []
  const targets = listClientReplyTargets(channels)
  const [pickedId, setPickedId] = useState('')
  const [isConfirmed, setConfirmed] = useState(false)
  const [sendError, setSendError] = useState<unknown>(null)
  const target = targets.find((item) => item.id === pickedId) ?? targets[0]
  const options = useContractorReplyWhatsAppOptionsQuery({
    enabled: targets.length > 0,
    occurrenceId,
  })
  const failure = sendError === null ? null : resolveClientReplyFailure(sendError)
  const isOff =
    options.data?.evolution.ready === false ||
    failure === 'whatsappOff' ||
    failure === 'unavailable'
  const quickReplies = useComposerQuickRepliesQuery('contractor')
  const threadQuickReplies = useMemo(
    () => toThreadQuickReplies(quickReplies.data ?? []),
    [quickReplies.data],
  )
  const threadSubject = useMemo(
    () => ({ subjectId: `${occurrenceId}:client`, subjectType: 'trip_occurrence' }),
    [occurrenceId],
  )
  /** O envio lê o número e a confirmação do momento, sem trocar o adaptador (o SDK pede um estável). */
  const replyTarget = useRef({ confirmed: isConfirmed, target })
  replyTarget.current = { confirmed: isConfirmed, target }
  const speakers = useRef(new Map<string, ConversationParticipant>())
  const api = useMemo(
    () =>
      createClientThreadApi({
        client: getOccurrenceConversationClient(),
        labels: {
          bySystem: t('client.bySystem'),
          channel: {
            app: t('thread.via', { channel: t('channel.app') }),
            email: t('thread.via', { channel: t('channel.email') }),
            portal: t('thread.via', { channel: t('channel.portal') }),
            whatsapp: t('thread.via', { channel: t('channel.whatsapp') }),
          },
          fromUs: t('client.fromUs'),
          sentDocument: (name) => t('client.sentDocument', { name }),
          sentNoText: t('client.sentNoText'),
        },
        occurrenceId,
        onChanged: () => {
          void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
          void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
        },
        onSendError: setSendError,
        onSpeaker: (authorName, speaker) => speakers.current.set(authorName, speaker),
        readConversations: () =>
          fetchOccurrenceConversations(queryClient, {
            ...(companyId === undefined ? {} : { companyId }),
            occurrenceId,
          }),
        readReplyTarget: () => replyTarget.current,
        subscribe: createRefreshSubscription(threadSubject, CONVERSATION_STATUS_REFETCH_MS),
      }),
    [companyId, occurrenceId, queryClient, t, threadSubject],
  )

  const closedNotice =
    targets.length === 0
      ? t('client.reply.noWhatsapp')
      : isOff
        ? t('client.reply.off')
        : t('client.reply.noPermission')
  const status = canReply && targets.length > 0 && !isOff ? 'open' : 'closed'
  const needsConfirmation = target !== undefined && !target.confirmed

  return (
    <div className={styles.panel}>
      {hideChannels ? null : <ClientChannelsStrip channels={channels} />}
      {targets.length > 1 && canReply ? (
        <div className={styles.field}>
          <span>{t('client.reply.replyBy')}</span>
          <Select
            ariaLabel={t('client.reply.replyBy')}
            onChange={(value) => {
              setPickedId(value)
              setConfirmed(false)
            }}
            options={targets.map((item) => ({
              label: `${t('channel.whatsapp')} · ${item.channel.maskedAddress}`,
              value: item.id,
            }))}
            value={target?.id ?? ''}
          />
        </div>
      ) : null}
      <div className={`${threadStyles.frame} ${participantToneClass('client')}`}>
        <ConversationThread
          api={api}
          audioRecording={SUBJECT_AUDIO_RECORDING_OPTIONS}
          channels={['whatsapp']}
          className={subjectStyles.conversationTheme ?? ''}
          counterpartLabel={
            target === undefined
              ? (conversation.client?.name ?? '')
              : t('client.reply.hint', { number: target.channel.maskedAddress })
          }
          headerActions={
            <OccurrenceDetailsAction
              {...(companyId === undefined ? {} : { companyId })}
              occurrenceId={occurrenceId}
            />
          }
          labels={buildSubjectThreadLabels((key) => tSubject(key), closedNotice)}
          locale={i18n.language}
          perspective="operator"
          quickReplies={threadQuickReplies}
          renderAuthorAvatar={(author) => (
            <ParticipantAvatar
              participant={
                (author.name == null ? undefined : speakers.current.get(author.name)) ?? 'client'
              }
            />
          )}
          status={status}
          subject={threadSubject}
          title={conversation.client?.name ?? t('client.title')}
        />
      </div>
      {status === 'open' && needsConfirmation ? (
        <div className={styles.notice}>
          <Checkbox
            checked={isConfirmed}
            label={
              <>
                <Icon name="alert" size="sm" />
                {t('client.reply.confirm', { number: target.channel.maskedAddress })}
              </>
            }
            onChange={setConfirmed}
          />
        </div>
      ) : null}
      {failure !== null && failure !== 'whatsappOff' && failure !== 'unavailable' ? (
        <p className={styles.error} role="alert">
          {failure === 'confirmation'
            ? t('client.reply.confirm', { number: target?.channel.maskedAddress ?? '' })
            : t(`client.reply.failure.${failure}`)}
        </p>
      ) : null}
    </div>
  )
}
