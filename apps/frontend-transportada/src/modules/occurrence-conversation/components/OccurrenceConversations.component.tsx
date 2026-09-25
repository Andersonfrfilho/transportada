/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DateDivider } from '@adatechnology/conversations-ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
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
  groupConversationByDay,
  OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH,
  validateDriverMessageDraft,
} from '../shared/occurrenceConversation.service'
import { insertQuickReply } from '../shared/quickReplies.service'
import type {
  ContractorSenderSuggestion,
  OccurrenceConversation,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import { AddContractorContactDialog } from './AddContractorContactDialog.component'
import { QuickReplyPicker } from './QuickReplyPicker.component'
import { ConversationMessage } from './ConversationMessage.component'
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

/** O fio da conversa por dia, nas duas abas. */
function ConversationThread({
  canManageContacts,
  messages,
  onAddContact,
}: Readonly<{
  canManageContacts: boolean
  messages: OccurrenceConversation['messages']
  onAddContact: (suggestion: ContractorSenderSuggestion) => void
}>) {
  return (
    <div className={styles.thread}>
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
}: Readonly<{
  canSend: boolean
  conversation: OccurrenceConversation | undefined
  driverName: string
  occurrenceId: string
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const send = useSendDriverAppMessageMutation(occurrenceId)
  const [draft, setDraft] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createDriverMessageIdempotencyKey(() => crypto.randomUUID()),
  )
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)
  useMarkReadOnOpen(conversation)
  const messages = conversation?.messages ?? []

  function submit(): void {
    const validated = validateDriverMessageDraft(draft)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    send.mutate(
      { body: validated.body, idempotencyKey },
      {
        onSuccess: () => {
          setDraft('')
          setIdempotencyKey(createDriverMessageIdempotencyKey(() => crypto.randomUUID()))
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
        />
      )}
      {canSend ? (
        <form
          className={styles.panel}
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
              maxLength={OCCURRENCE_CONVERSATION_BODY_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              value={draft}
            />
            {error === null ? null : (
              <span className={styles.error}>{t(`driver.error.${error}`)}</span>
            )}
          </label>
          {send.isError ? (
            <p className={styles.error} role="alert">
              {t('driver.error.send')}
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
}>

/**
 * Spec 183 T654 (RF21, D9): a mensagem à contratante pelo portal. Só o texto; quem tem conta no
 * portal recebe o aviso por e-mail sem o corpo. Uma chave por mensagem escrita, como no app.
 */
function ContractorPortalComposer({ occurrenceId }: Readonly<{ occurrenceId: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const send = useSendContractorPortalMessageMutation(occurrenceId)
  const [draft, setDraft] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    createPortalMessageIdempotencyKey(() => crypto.randomUUID()),
  )
  const [error, setError] = useState<'required' | 'tooLong' | null>(null)

  function submit(): void {
    const validated = validateDriverMessageDraft(draft)
    if ('error' in validated) {
      setError(validated.error)
      return
    }
    setError(null)
    send.mutate(
      { body: validated.body, idempotencyKey },
      {
        onSuccess: () => {
          setDraft('')
          setIdempotencyKey(createPortalMessageIdempotencyKey(() => crypto.randomUUID()))
        },
      },
    )
  }

  return (
    <form
      className={styles.panel}
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
      {send.isError ? (
        <p className={styles.error} role="alert">
          {t('contractor.portal.error.send')}
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
  useMarkReadOnOpen(conversation)

  const messages = conversation?.messages ?? []
  const canWrite = canSend && hasDocument && contractorId !== null

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
        />
      )}

      {canWrite && portalAvailable ? (
        <ContractorPortalComposer occurrenceId={occurrenceId} />
      ) : null}

      {isSending ? (
        <SendToContractorDialog onClose={() => setSending(false)} occurrenceId={occurrenceId} />
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

  return (
    <Tabs
      ariaLabel={t('tabs.ariaLabel')}
      items={[
        {
          ...(unread > 0 ? { badge: t('contractor.unread', { count: unread }) } : {}),
          id: 'contractor',
          label: t('tabs.contractor'),
          panel: (
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
          ),
        },
        ...(driverName === null
          ? []
          : [
              {
                ...(driverUnread > 0
                  ? { badge: t('contractor.unread', { count: driverUnread }) }
                  : {}),
                id: 'driver',
                label: t('tabs.driver'),
                panel: (
                  <DriverConversationPanel
                    canSend={canSend}
                    conversation={driverConversation}
                    driverName={driverName}
                    occurrenceId={occurrenceId}
                  />
                ),
              },
            ]),
      ]}
      onChange={setTab}
      value={tab}
    />
  )
}
