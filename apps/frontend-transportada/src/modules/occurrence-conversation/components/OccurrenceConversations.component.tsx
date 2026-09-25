/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DateDivider } from '@adatechnology/conversations-ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'

import {
  useMarkConversationReadMutation,
  useOccurrenceConversationsQuery,
  useSendContractorPortalMessageMutation,
  useSendDriverAppMessageMutation,
} from '../queries/occurrenceConversation.query'
import {
  createDriverMessageIdempotencyKey,
  createPortalMessageIdempotencyKey,
  countNewIncomingMessages,
  groupConversationByDay,
  OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH,
  validateDriverMessageDraft,
} from '../shared/occurrenceConversation.service'
import { insertQuickReply } from '../shared/quickReplies.service'
import type {
  OccurrenceConversationAttachment,
  OccurrenceConversationMessage,
  ContractorSenderSuggestion,
  OccurrenceConversation,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import { AddContractorContactDialog } from './AddContractorContactDialog.component'
import { ConversationAttachmentPicker } from './ConversationAttachmentPicker.component'
import { QuickReplyPicker } from './QuickReplyPicker.component'
import { ConversationMessage } from './ConversationMessage.component'
import {
  recoverFromSendFailure,
  type SendFailureRecovery,
} from '../shared/conversationAttachment.service'
import { resendChannelFor } from '../shared/messageStatus.service'
import { SendToContractorDialog } from './SendToContractorDialog.component'

/** A chave do dia no fuso de quem vê: `en-CA` escreve `AAAA-MM-DD`. */
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function dayKey(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso.slice(0, 10) : dayKeyFormatter.format(moment)
}

/** Spec 183 T702d: a ação sobre um anexo, montada por quem sabe fazê-la. */
export type RenderAttachmentActions = (
  attachment: OccurrenceConversationAttachment,
  message: OccurrenceConversationMessage,
) => ReactNode

/**
 * Spec 183 T702d (P7): encaminhar à contratante o anexo que o motorista mandou — uma mensagem pelo
 * portal com o mesmo objeto. A chave vem do anexo: o segundo clique é o mesmo envio, nunca outro.
 */
function ForwardToContractorAction({
  attachmentId,
  occurrenceId,
}: Readonly<{ attachmentId: string; occurrenceId: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const send = useSendContractorPortalMessageMutation(occurrenceId)
  if (send.isSuccess) return <span className={styles.hint}>{t('attachment.forwarded')}</span>
  return (
    <>
      <Button
        disabled={send.isPending}
        onClick={() =>
          send.mutate({
            body: '',
            files: [],
            forwardAttachmentIds: [attachmentId],
            idempotencyKey: `portal-forward:${attachmentId}`,
            uploaded: new Map(),
          })
        }
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="send" size="sm" />
        {send.isPending ? t('attachment.forwarding') : t('attachment.forward')}
      </Button>
      {send.isError ? (
        <span className={styles.error} role="alert">
          {t('attachment.forwardError')}
        </span>
      ) : null}
    </>
  )
}

/** O fio da conversa por dia, nas duas abas. */
type ConversationResend = NonNullable<Parameters<typeof ConversationMessage>[0]['resend']>

function ConversationThread({
  canManageContacts,
  messages,
  onAddContact,
  renderAttachmentActions,
  resend,
}: Readonly<{
  canManageContacts: boolean
  messages: OccurrenceConversation['messages']
  onAddContact: (suggestion: ContractorSenderSuggestion) => void
  renderAttachmentActions?: RenderAttachmentActions
  resend?: ConversationResend
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const [announcement, setAnnouncement] = useState('')
  const previousIds = useRef<null | readonly string[]>(null)
  /** Spec 183 T902 (D2): a leitura que traz mensagem nova a anuncia; a primeira, não. */
  useEffect(() => {
    const count = countNewIncomingMessages(previousIds.current, messages)
    previousIds.current = messages.map((message) => message.id)
    if (count > 0) setAnnouncement(t('thread.newMessages', { count }))
  }, [messages, t])

  return (
    <div className={styles.thread}>
      <p aria-live="polite" className={styles.srOnly}>
        {announcement}
      </p>
      {groupConversationByDay(messages, dayKey).map((group) => (
        <section aria-label={group.day} className={styles.daySection} key={group.day}>
          <DateDivider
            classNames={{ label: styles.dayLabel ?? '', root: styles.dayDivider ?? '' }}
            iso={group.messages[0]?.createdAt ?? group.day}
          />
          {group.messages.map((message) => (
            <ConversationMessage
              canManageContacts={canManageContacts}
              key={message.id}
              message={message}
              onAddContact={onAddContact}
              {...(renderAttachmentActions === undefined ? {} : { renderAttachmentActions })}
              {...(resend === undefined ? {} : { resend })}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

/** RF15: abrir a aba com mensagem nova marca como lida — para quem abriu, não para os outros. */
function useMarkReadOnOpen(conversation: OccurrenceConversation | undefined): void {
  const { mutate: markConversationRead } = useMarkConversationReadMutation()
  const conversationId = conversation?.id
  const unreadCount = conversation?.unreadCount ?? 0
  useEffect(() => {
    if (conversationId !== undefined && unreadCount > 0) markConversationRead(conversationId)
  }, [conversationId, markConversationRead, unreadCount])
}

/**
 * Spec 183 T603 (P7): a conversa com o motorista pelo app. A mensagem vira aviso na caixa dele e
 * aparece na tela da conversa no PWA (T604). Uma chave por mensagem escrita: reenviar depois de uma
 * queda de rede não duplica.
 */
function DriverConversationPanel({
  canSend,
  conversation,
  driverName,
  occurrenceId,
  portalAvailable,
  renderAttachmentActions,
}: Readonly<{
  canSend: boolean
  conversation: OccurrenceConversation | undefined
  driverName: string
  occurrenceId: string
  /** Spec 183 T702d: sem o canal Portal aberto, não há como encaminhar (e-mail com anexo é a T702e). */
  portalAvailable: boolean
  renderAttachmentActions?: RenderAttachmentActions
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const send = useSendDriverAppMessageMutation(occurrenceId)
  const [draft, setDraft] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createDriverMessageIdempotencyKey(() => crypto.randomUUID()),
  )
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)
  /** Spec 183 T702b: os anexos do rascunho e o que já subiu dele. */
  const [files, setFiles] = useState<readonly File[]>([])
  const uploaded = useRef(new Map<File, string>())
  const [failureReason, setFailureReason] = useState<SendFailureRecovery['reason']>('generic')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  useMarkReadOnOpen(conversation)
  const messages = conversation?.messages ?? []
  /** Spec 183 T703: o WhatsApp que falhou volta ao compositor do app, com o mesmo texto. */
  const resend: ConversationResend = {
    channelFor: (message) =>
      resendChannelFor(message, { participant: 'driver', portalAvailable: false }),
    onResend: (message) => {
      setDraft(message.bodyText)
      composerRef.current?.focus()
    },
  }

  function submit(): void {
    const validated = validateDriverMessageDraft(draft, files.length)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    send.mutate(
      { body: validated.body, files, idempotencyKey, uploaded: uploaded.current },
      {
        onSuccess: () => {
          setDraft('')
          setFiles([])
          uploaded.current = new Map()
          setIdempotencyKey(createDriverMessageIdempotencyKey(() => crypto.randomUUID()))
        },
        /** Spec 183 T903 (F2/F3): upload vencido sobe de novo; chave já usada ganha outra. */
        onError: (failure) => {
          const recovery = recoverFromSendFailure(failure)
          if (recovery.clearUploads) uploaded.current = new Map()
          if (recovery.renewKey)
            setIdempotencyKey(createDriverMessageIdempotencyKey(() => crypto.randomUUID()))
          setFailureReason(recovery.reason)
        },
      },
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h3>
          {driverName === '' ? t('driver.title') : t('driver.withName', { name: driverName })}
        </h3>
      </div>
      {messages.length === 0 ? (
        <p className={styles.hint}>{t('driver.empty')}</p>
      ) : (
        <ConversationThread
          canManageContacts={false}
          messages={messages}
          onAddContact={() => undefined}
          {...(canSend ? { resend } : {})}
          /** Spec 183 T702d: as ações só na mensagem que o motorista mandou. */
          renderAttachmentActions={(attachment, message) =>
            message.direction === 'inbound' ? (
              <>
                {canSend && portalAvailable ? (
                  <ForwardToContractorAction
                    attachmentId={attachment.id}
                    occurrenceId={occurrenceId}
                  />
                ) : null}
                {renderAttachmentActions?.(attachment, message)}
              </>
            ) : null
          }
        />
      )}
      {canSend ? (
        <form
          className={`${styles.panel} ${styles.composer}`}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <QuickReplyPicker
            audience="driver"
            disabled={send.isPending}
            onPick={(text) => setDraft((current) => insertQuickReply(current, text))}
          />
          <label className={styles.field}>
            <span>{t('driver.message')}</span>
            <textarea
              disabled={send.isPending}
              ref={composerRef}
              maxLength={OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              value={draft}
            />
            {error === null ? null : (
              <span className={styles.error}>{t(`driver.error.${error}`)}</span>
            )}
          </label>
          <ConversationAttachmentPicker
            allowRecording
            channel="app"
            disabled={send.isPending}
            files={files}
            onChange={setFiles}
          />
          {send.isError ? (
            <p className={styles.error} role="alert">
              {failureReason === 'generic'
                ? t('driver.error.send')
                : t(`sendRecovery.${failureReason}`)}
            </p>
          ) : null}
          <div className={styles.footer}>
            <Button disabled={send.isPending} type="submit">
              {send.isPending ? t('driver.sending') : t('driver.send')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

type OccurrenceConversationsProps = Readonly<{
  canManageContacts: boolean
  canSend: boolean
  companyId?: string
  /** `null` na ocorrência sem contratante casada pela nota (T203). */
  contractorId: null | string
  contractorName: string
  /** Spec 183 T603 (P7): sem motorista na viagem, a aba Motorista não aparece. */
  driverName: null | string
  hasDocument: boolean
  occurrenceId: string
  /**
   * Spec 183 T702d: a ação que o dono da ocorrência monta sobre a foto do motorista ("Anexar à
   * ocorrência", do módulo `trip`) — a conversa só decide onde ela aparece.
   */
  renderAttachmentActions?: RenderAttachmentActions
  /**
   * Spec 183 T801: no celular, a aba de cima (Contratante ou Motorista) já escolheu a parte — mostra
   * só aquela conversa, sem as abas internas.
   */
  participant?: 'contractor' | 'driver'
}>

/**
 * Spec 183 T654 (RF21, D9): a mensagem à contratante pelo portal. Só o texto; quem tem conta no
 * portal recebe o aviso por e-mail sem o corpo. Uma chave por mensagem escrita, como no app.
 */
function ContractorPortalComposer({
  occurrenceId,
  prefill,
}: Readonly<{
  occurrenceId: string
  /** Spec 183 T703: o texto de uma mensagem que falhou em outro canal, a reenviar por aqui. */
  prefill: null | Readonly<{ nonce: number; text: string }>
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const send = useSendContractorPortalMessageMutation(occurrenceId)
  const [draft, setDraft] = useState('')
  const composerRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (prefill === null) return
    setDraft(prefill.text)
    composerRef.current?.focus()
  }, [prefill])
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createPortalMessageIdempotencyKey(() => crypto.randomUUID()),
  )
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)
  /** Spec 183 T702b: os anexos do rascunho e o que já subiu dele. */
  const [files, setFiles] = useState<readonly File[]>([])
  const uploaded = useRef(new Map<File, string>())
  const [failureReason, setFailureReason] = useState<SendFailureRecovery['reason']>('generic')

  function submit(): void {
    const validated = validateDriverMessageDraft(draft, files.length)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    send.mutate(
      { body: validated.body, files, idempotencyKey, uploaded: uploaded.current },
      {
        onSuccess: () => {
          setDraft('')
          setFiles([])
          uploaded.current = new Map()
          setIdempotencyKey(createPortalMessageIdempotencyKey(() => crypto.randomUUID()))
        },
        /** Spec 183 T903 (F2/F3): upload vencido sobe de novo; chave já usada ganha outra. */
        onError: (failure) => {
          const recovery = recoverFromSendFailure(failure)
          if (recovery.clearUploads) uploaded.current = new Map()
          if (recovery.renewKey)
            setIdempotencyKey(createPortalMessageIdempotencyKey(() => crypto.randomUUID()))
          setFailureReason(recovery.reason)
        },
      },
    )
  }

  return (
    <form
      className={`${styles.panel} ${styles.composer}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <QuickReplyPicker
        audience="contractor"
        disabled={send.isPending}
        onPick={(text) => setDraft((current) => insertQuickReply(current, text))}
      />
      <label className={styles.field}>
        <span>{t('contractor.portal.message')}</span>
        <textarea
          disabled={send.isPending}
          ref={composerRef}
          maxLength={OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          value={draft}
        />
        {error === null ? (
          <span className={styles.hint}>{t('contractor.portal.hint')}</span>
        ) : (
          <span className={styles.error}>{t(`contractor.portal.error.${error}`)}</span>
        )}
      </label>
      <ConversationAttachmentPicker
        allowRecording
        channel="portal"
        disabled={send.isPending}
        files={files}
        onChange={setFiles}
      />
      {send.isError ? (
        <p className={styles.error} role="alert">
          {failureReason === 'generic'
            ? t('contractor.portal.error.send')
            : t(`sendRecovery.${failureReason}`)}
        </p>
      ) : null}
      <div className={styles.footer}>
        <Button disabled={send.isPending} type="submit">
          {send.isPending ? t('contractor.portal.sending') : t('contractor.portal.send')}
        </Button>
      </div>
    </form>
  )
}

function ContractorConversationPanel({
  canManageContacts,
  canSend,
  contractorId,
  contractorName,
  conversation,
  hasDocument,
  occurrenceId,
  portalAvailable,
}: Readonly<{
  canManageContacts: boolean
  canSend: boolean
  contractorId: null | string
  contractorName: string
  conversation: OccurrenceConversation | undefined
  hasDocument: boolean
  occurrenceId: string
  /** Spec 183 T654: o portal mostra a ocorrência e alguém da contratante tem conta. */
  portalAvailable: boolean
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const [isSending, setSending] = useState(false)
  const [suggestion, setSuggestion] = useState<ContractorSenderSuggestion | null>(null)
  /** Spec 183 T703: o reenvio leva o texto ao compositor do portal ou ao diálogo do e-mail. */
  const [portalPrefill, setPortalPrefill] = useState<null | { nonce: number; text: string }>(null)
  const [mailBody, setMailBody] = useState<string | undefined>(undefined)
  useMarkReadOnOpen(conversation)

  const messages = conversation?.messages ?? []
  const canWrite = canSend && hasDocument && contractorId !== null
  const resend: ConversationResend = {
    channelFor: (message) =>
      resendChannelFor(message, { participant: 'contractor', portalAvailable }),
    onResend: (message, channel) => {
      if (channel === 'portal') {
        setPortalPrefill({ nonce: Date.now(), text: message.bodyText })
        return
      }
      setMailBody(message.bodyText)
      setSending(true)
    },
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h3>
          {contractorName === ''
            ? t('contractor.title')
            : t('contractor.withName', { name: contractorName })}
        </h3>
        {canWrite ? (
          <Button onClick={() => setSending(true)} size="sm" type="button">
            {t('contractor.send')}
          </Button>
        ) : null}
      </div>

      {!hasDocument ? <p className={styles.hint}>{t('contractor.noDocument')}</p> : null}
      {hasDocument && contractorId === null ? (
        <p className={styles.hint}>{t('contractor.noContractor')}</p>
      ) : null}

      {messages.length === 0 ? (
        hasDocument && contractorId !== null ? (
          <p className={styles.hint}>{t('contractor.empty')}</p>
        ) : null
      ) : (
        <ConversationThread
          canManageContacts={canManageContacts && contractorId !== null}
          messages={messages}
          onAddContact={setSuggestion}
          {...(canWrite ? { resend } : {})}
        />
      )}

      {canWrite && portalAvailable ? (
        <ContractorPortalComposer occurrenceId={occurrenceId} prefill={portalPrefill} />
      ) : null}

      {isSending ? (
        <SendToContractorDialog
          {...(mailBody === undefined ? {} : { initialBody: mailBody })}
          onClose={() => {
            setSending(false)
            setMailBody(undefined)
          }}
          occurrenceId={occurrenceId}
        />
      ) : null}
      {suggestion !== null && contractorId !== null ? (
        <AddContractorContactDialog
          contractorId={contractorId}
          onClose={() => setSuggestion(null)}
          suggestion={suggestion}
        />
      ) : null}
    </div>
  )
}

/**
 * Spec 183 T407 (P4): as conversas da ocorrência, em abas por participante montadas do nosso lado
 * (o pacote não tem abas — T101). Hoje só a Contratante por e-mail; a do Motorista chega na T603.
 */
export function OccurrenceConversations({
  canManageContacts,
  canSend,
  companyId,
  contractorId,
  contractorName,
  driverName,
  hasDocument,
  occurrenceId,
  participant,
  renderAttachmentActions,
}: OccurrenceConversationsProps) {
  const { t } = useTranslation('occurrenceConversation')
  const [tab, setTab] = useState('contractor')
  const query = useOccurrenceConversationsQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: true,
    occurrenceId,
  })
  const contractorConversation = query.data?.conversations.find(
    (conversation) => conversation.participant === 'contractor',
  )
  const unread = contractorConversation?.unreadCount ?? 0
  const driverConversation = query.data?.conversations.find(
    (conversation) => conversation.participant === 'driver',
  )
  const driverUnread = driverConversation?.unreadCount ?? 0

  if (query.isLoading) {
    return (
      <SkeletonGroup label={t('contractor.loading')}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="10rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (query.isError) {
    return (
      <p className={styles.hint} role="alert">
        {t('contractor.error')}
      </p>
    )
  }

  const contractorPanel = (
    <ContractorConversationPanel
      canManageContacts={canManageContacts}
      canSend={canSend}
      contractorId={contractorId}
      contractorName={contractorName}
      conversation={contractorConversation}
      hasDocument={hasDocument}
      occurrenceId={occurrenceId}
      portalAvailable={query.data?.contractorPortal.available ?? false}
    />
  )
  const driverPanel =
    driverName === null ? null : (
      <DriverConversationPanel
        canSend={canSend}
        conversation={driverConversation}
        driverName={driverName}
        occurrenceId={occurrenceId}
        portalAvailable={query.data?.contractorPortal.available ?? false}
        {...(renderAttachmentActions === undefined ? {} : { renderAttachmentActions })}
      />
    )

  /** Spec 183 T801: a aba de cima do celular já escolheu a parte. */
  if (participant === 'contractor') return contractorPanel
  if (participant === 'driver') {
    return driverPanel ?? <p className={styles.hint}>{t('driver.noDriver')}</p>
  }

  return (
    <Tabs
      ariaLabel={t('tabs.ariaLabel')}
      items={[
        {
          ...(unread > 0 ? { badge: t('contractor.unread', { count: unread }) } : {}),
          id: 'contractor',
          label: t('tabs.contractor'),
          panel: contractorPanel,
        },
        ...(driverPanel === null
          ? []
          : [
              {
                ...(driverUnread > 0
                  ? { badge: t('contractor.unread', { count: driverUnread }) }
                  : {}),
                id: 'driver',
                label: t('tabs.driver'),
                panel: driverPanel,
              },
            ]),
      ]}
      onChange={setTab}
      value={tab}
    />
  )
}
