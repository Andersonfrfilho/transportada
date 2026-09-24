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
} from '../queries/occurrenceConversation.query'
import { groupConversationByDay } from '../shared/occurrenceConversation.service'
import type {
  ContractorSenderSuggestion,
  OccurrenceConversation,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import { AddContractorContactDialog } from './AddContractorContactDialog.component'
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

type OccurrenceConversationsProps = Readonly<{
  canManageContacts: boolean
  canSend: boolean
  companyId?: string
  /** `null` na ocorrência sem contratante casada pela nota (T203). */
  contractorId: null | string
  contractorName: string
  hasDocument: boolean
  occurrenceId: string
}>

function ContractorConversationPanel({
  canManageContacts,
  canSend,
  contractorId,
  contractorName,
  conversation,
  hasDocument,
  occurrenceId,
}: Readonly<{
  canManageContacts: boolean
  canSend: boolean
  contractorId: null | string
  contractorName: string
  conversation: OccurrenceConversation | undefined
  hasDocument: boolean
  occurrenceId: string
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const [isSending, setSending] = useState(false)
  const [suggestion, setSuggestion] = useState<ContractorSenderSuggestion | null>(null)
  const markRead = useMarkConversationReadMutation()
  const conversationId = conversation?.id
  const unreadCount = conversation?.unreadCount ?? 0
  const { mutate: markConversationRead } = markRead

  /** RF15: abrir a aba com mensagem nova marca como lida — para quem abriu, não para os outros. */
  useEffect(() => {
    if (conversationId !== undefined && unreadCount > 0) markConversationRead(conversationId)
  }, [conversationId, markConversationRead, unreadCount])

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
        <div className={styles.thread}>
          {groupConversationByDay(messages, dayKey).map((group) => (
            <section aria-label={group.day} className={styles.daySection} key={group.day}>
              <DateDivider
                classNames={{ label: styles.dayLabel ?? '', root: styles.dayDivider ?? '' }}
                iso={group.messages[0]?.createdAt ?? group.day}
              />
              {group.messages.map((message) => (
                <ConversationMessage
                  canManageContacts={canManageContacts && contractorId !== null}
                  key={message.id}
                  message={message}
                  onAddContact={setSuggestion}
                />
              ))}
            </section>
          ))}
        </div>
      )}

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
  const contractorConversation = query.data?.find(
    (conversation) => conversation.participant === 'contractor',
  )
  const unread = contractorConversation?.unreadCount ?? 0

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
            />
          ),
        },
      ]}
      onChange={setTab}
      value={tab}
    />
  )
}
