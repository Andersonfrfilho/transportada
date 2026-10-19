/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { AddContractorContactAction } from '@/modules/delivery-clients/components/AddContractorContactAction.component'

import {
  OCCURRENCE_CONVERSATIONS_QUERY_KEY,
  useDeliverContractorReplyToDriverMutation,
  useOccurrenceConversationsQuery,
  useSendContractorPortalMessageMutation,
} from '../queries/occurrenceConversation.query'
import {
  resolveContractorChatError,
  resolveContractorComposer,
} from '../shared/contractorChat.service'
import { isForwardAlreadyDone } from '../shared/conversationAttachment.service'
import type { OccurrenceThreadSendError } from '../shared/occurrenceThreadApi.service'
import type {
  ContractorSenderSuggestion,
  OccurrenceConversation,
  OccurrenceConversationAttachment,
  OccurrenceConversationMessage,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import threadStyles from '../styles/occurrenceThread.module.css'
import { useMinWidth } from '@/modules/shared/useMinWidth.hook'

import {
  conversationLayoutStorageKey,
  readConversationLayout,
  resolveConversationLayout,
  writeConversationLayout,
  type ConversationLayoutMode,
} from '../shared/occurrenceConversationLayout.service'
import { ContractorReplyEmailActions } from './ContractorReplyEmailActions.component'
import { ConversationColumn, ConversationLayoutSwitch } from './ConversationLayoutSwitch.component'
import { OccurrenceConversationLegend } from './OccurrenceConversationLegend.component'
import { ContractorReplyEmailHistory } from './ContractorReplyEmailHistory.component'
import { OccurrenceThread } from './OccurrenceThread.component'
import {
  OccurrenceThreadAttachments,
  type RenderAttachmentActions,
} from './OccurrenceThreadAttachments.component'
import { OccurrenceThreadFailures } from './OccurrenceThreadFailures.component'
import { OccurrenceThreadSenders } from './OccurrenceThreadSenders.component'
import { SendToContractorDialog } from './SendToContractorDialog.component'

/** `localStorage` pode não existir ou lançar (janela privada, bloqueio): a preferência é conveniência. */
function getLayoutStorage(): null | Storage {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export type { RenderAttachmentActions } from './OccurrenceThreadAttachments.component'

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
  /** Spec 183 T903 (F4): a chave é do anexo — já usada é "já encaminhada", não erro. */
  if (send.isSuccess || isForwardAlreadyDone(send.error)) {
    return <span className={styles.hint}>{t('attachment.forwarded')}</span>
  }
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

/**
 * Spec 248 T4.6 (RF7/RF9): leva o anexo que a contratante mandou (o boleto) ao motorista, pelo chat do app. O
 * servidor guarda uma entrega por anexo: repetir é "já enviado", nunca outra mensagem.
 */
export function SendToDriverAction({
  attachmentId,
  occurrenceId,
}: Readonly<{ attachmentId: string; occurrenceId: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const deliver = useDeliverContractorReplyToDriverMutation(occurrenceId)
  if (deliver.isSuccess && deliver.data !== 'skipped') {
    return (
      <span className={styles.hint}>
        {deliver.data === 'delivered'
          ? t('attachment.sentToDriver')
          : t('attachment.alreadySentToDriver')}
      </span>
    )
  }
  return (
    <>
      <Button
        disabled={deliver.isPending}
        onClick={() => deliver.mutate(attachmentId)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="send" size="sm" />
        {deliver.isPending ? t('attachment.sendingToDriver') : t('attachment.sendToDriver')}
      </Button>
      {deliver.isError || deliver.data === 'skipped' ? (
        <span className={styles.error} role="alert">
          {deliver.data === 'skipped'
            ? t('attachment.sendToDriverSkipped')
            : t('attachment.sendToDriverError')}
        </span>
      ) : null}
    </>
  )
}

/**
 * Spec 183 T603 (P7): a conversa com o motorista pelo app. A mensagem vira aviso na caixa dele e
 * aparece na tela da conversa no PWA (T604). O fio e a caixa de envio são do `ConversationThread`
 * do SDK; as ações por anexo e o reenvio de mensagem que falhou ficam nas faixas ao lado.
 */
function DriverConversationPanel({
  canSend,
  companyId,
  conversation,
  driverName,
  occurrenceId,
  portalAvailable,
  renderAttachmentActions,
}: Readonly<{
  canSend: boolean
  companyId?: string
  conversation: OccurrenceConversation | undefined
  driverName: string
  occurrenceId: string
  /** Spec 183 T702d: sem o canal Portal aberto, não há como encaminhar (e-mail com anexo é a T702e). */
  portalAvailable: boolean
  renderAttachmentActions?: RenderAttachmentActions
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const messages = conversation?.messages ?? []
  /** Spec 183 T702d: as ações só no arquivo que o motorista mandou. */
  const attachmentActions: RenderAttachmentActions = (attachment, message) => {
    if (message.direction !== 'inbound') return null
    const attachToOccurrence = renderAttachmentActions?.(attachment, message)
    const canForward = canSend && portalAvailable
    if (!canForward && (attachToOccurrence === null || attachToOccurrence === undefined)) {
      return null
    }
    return (
      <>
        {canForward ? (
          <ForwardToContractorAction attachmentId={attachment.id} occurrenceId={occurrenceId} />
        ) : null}
        {attachToOccurrence}
      </>
    )
  }

  return (
    <div className={threadStyles.panel}>
      {messages.length === 0 ? <p className={threadStyles.hint}>{t('driver.empty')}</p> : null}
      <OccurrenceThreadFailures
        canResend={canSend}
        messages={messages}
        occurrenceId={occurrenceId}
        participant="driver"
        portalAvailable={false}
      />
      <OccurrenceThreadAttachments
        messages={messages}
        renderAttachmentActions={attachmentActions}
      />
      <OccurrenceThread
        closedNotice={t('thread.closed.readOnly')}
        {...(companyId === undefined ? {} : { companyId })}
        counterpartLabel={t('thread.driver.counterpart')}
        occurrenceId={occurrenceId}
        participant="driver"
        status={canSend ? 'open' : 'closed'}
        title={driverName === '' ? t('driver.title') : t('driver.withName', { name: driverName })}
      />
    </div>
  )
}

type ContractorConversationPanelProps = Readonly<{
  canManageContacts: boolean
  canSend: boolean
  companyId?: string
  contractorId: null | string
  contractorName: string
  conversation: OccurrenceConversation | undefined
  hasDocument: boolean
  /** Spec 248 T4.6: a viagem tem motorista para receber o boleto. */
  hasDriver: boolean
  occurrenceId: string
  /** Spec 183 T654: o portal mostra a ocorrência e alguém da contratante tem conta. */
  portalAvailable: boolean
}>

function resolveContractorClosedNotice(input: {
  canSend: boolean
  t: (key: string) => string
}): string {
  if (!input.canSend) return input.t('thread.closed.readOnly')
  return input.t('thread.closed.noRecipient')
}

function ContractorConversationPanel({
  canManageContacts,
  canSend,
  companyId,
  contractorId,
  contractorName,
  conversation,
  hasDocument,
  hasDriver,
  occurrenceId,
  portalAvailable,
}: ContractorConversationPanelProps) {
  const { t } = useTranslation('occurrenceConversation')
  const [isSending, setSending] = useState(false)
  const queryClient = useQueryClient()
  /** Spec 183 T703: o reenvio por e-mail leva o texto da mensagem que falhou ao diálogo. */
  const [mailBody, setMailBody] = useState<string | undefined>(undefined)
  const messages = conversation?.messages ?? []
  const { canWrite, status } = resolveContractorComposer({ canSend, contractorId, hasDocument })
  /** Spec 274 D10: a última falha do envio do chat — o motivo e, sem destinatário, a saída pelo diálogo. */
  const [sendError, setSendError] = useState<null | OccurrenceThreadSendError>(null)

  /**
   * Spec 248 T4.6/T4.7: o boleto que a contratante mandou segue ao motorista (quando há motorista) e, por
   * e-mail, ao cliente da nota ou a um endereço informado — as duas ações no mesmo arquivo.
   */
  const attachmentActions: RenderAttachmentActions = (
    attachment: OccurrenceConversationAttachment,
    message: OccurrenceConversationMessage,
  ) =>
    canSend && message.direction === 'inbound' ? (
      <>
        {hasDriver ? (
          <SendToDriverAction attachmentId={attachment.id} occurrenceId={occurrenceId} />
        ) : null}
        <ContractorReplyEmailActions attachmentId={attachment.id} occurrenceId={occurrenceId} />
      </>
    ) : null

  /** Spec 183 T903 (F5): a ação de `delivery-clients`; gravado, a conversa relê. */
  const renderAddContact = (suggestion: ContractorSenderSuggestion) =>
    contractorId === null ? null : (
      <AddContractorContactAction
        contractorId={contractorId}
        onCreated={() =>
          void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
        }
        suggestion={suggestion}
      />
    )

  return (
    <div className={threadStyles.panel}>
      {!hasDocument ? <p className={threadStyles.hint}>{t('contractor.noDocument')}</p> : null}
      {hasDocument && contractorId === null ? (
        <p className={threadStyles.hint}>{t('contractor.noContractor')}</p>
      ) : null}
      {messages.length === 0 && canWrite ? (
        <p className={threadStyles.hint}>{t('contractor.empty')}</p>
      ) : null}

      <OccurrenceThreadFailures
        canResend={canWrite}
        messages={messages}
        occurrenceId={occurrenceId}
        onOpenMail={(message) => {
          setMailBody(message.bodyText)
          setSending(true)
        }}
        participant="contractor"
        portalAvailable={portalAvailable}
      />
      <OccurrenceThreadSenders
        canManageContacts={canManageContacts && contractorId !== null}
        messages={messages}
        renderAddContact={renderAddContact}
      />
      {canSend ? (
        <OccurrenceThreadAttachments
          messages={messages}
          renderAttachmentActions={attachmentActions}
        />
      ) : null}

      {canWrite || messages.length > 0 ? (
        <OccurrenceThread
          closedNotice={resolveContractorClosedNotice({
            canSend,
            t: (key) => t(key),
          })}
          {...(companyId === undefined ? {} : { companyId })}
          counterpartLabel={t('thread.contractor.counterpart')}
          {...(canWrite
            ? {
                headerActions: (
                  <Button onClick={() => setSending(true)} size="sm" type="button">
                    <Icon name="send" size="sm" />
                    {t('contractor.send')}
                  </Button>
                ),
              }
            : {})}
          occurrenceId={occurrenceId}
          onSendError={setSendError}
          participant="contractor"
          status={status}
          title={
            contractorName === ''
              ? t('contractor.title')
              : t('contractor.withName', { name: contractorName })
          }
        />
      ) : null}

      {sendError === null ? null : (
        <p className={threadStyles.error} role="alert">
          {t(`thread.sendError.${resolveContractorChatError(sendError.code)}`)}{' '}
          {resolveContractorChatError(sendError.code) === 'noRecipients' ? (
            <Button
              onClick={() => {
                setMailBody(sendError.text)
                setSending(true)
                setSendError(null)
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="send" size="sm" />
              {t('thread.sendError.openMail')}
            </Button>
          ) : null}
        </p>
      )}

      {canSend ? <ContractorReplyEmailHistory occurrenceId={occurrenceId} /> : null}

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
 * Spec 183 T407 (P4): as conversas da ocorrência, em abas por participante montadas do nosso lado
 * (o pacote não tem abas — T101). Cada aba é um `ConversationThread` do SDK, o mesmo desenho do app do motorista.
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
  const layoutStorageKey = conversationLayoutStorageKey(companyId)
  const [storedLayout, setStoredLayout] = useState(() =>
    readConversationLayout(getLayoutStorage(), layoutStorageKey),
  )
  const layout = resolveConversationLayout({
    isWide: useMinWidth('64rem'),
    stored: storedLayout,
  })
  function handleLayoutChange(mode: ConversationLayoutMode): void {
    setStoredLayout(mode)
    writeConversationLayout(getLayoutStorage(), layoutStorageKey, mode)
  }
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

  const portalAvailable = query.data?.contractorPortal.available ?? false
  const contractorPanel = (
    <ContractorConversationPanel
      canManageContacts={canManageContacts}
      canSend={canSend}
      {...(companyId === undefined ? {} : { companyId })}
      contractorId={contractorId}
      contractorName={contractorName}
      conversation={contractorConversation}
      hasDocument={hasDocument}
      hasDriver={driverName !== null}
      occurrenceId={occurrenceId}
      portalAvailable={portalAvailable}
    />
  )
  const driverPanel =
    driverName === null ? null : (
      <DriverConversationPanel
        canSend={canSend}
        {...(companyId === undefined ? {} : { companyId })}
        conversation={driverConversation}
        driverName={driverName}
        occurrenceId={occurrenceId}
        portalAvailable={portalAvailable}
        {...(renderAttachmentActions === undefined ? {} : { renderAttachmentActions })}
      />
    )

  /** Spec 183 T801: a aba de cima do celular já escolheu a parte. */
  if (participant === 'contractor') return contractorPanel
  if (participant === 'driver') {
    return driverPanel ?? <p className={styles.hint}>{t('driver.noDriver')}</p>
  }

  const tabs = (
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
  /** Duas conversas ao mesmo tempo: o item enviado de uma coluna aparece na outra sem trocar de aba. */
  const columns = (
    <div className={threadStyles.columns}>
      <ConversationColumn participant="contractor" unreadCount={unread}>
        {contractorPanel}
      </ConversationColumn>
      {driverPanel === null ? null : (
        <ConversationColumn participant="driver" unreadCount={driverUnread}>
          {driverPanel}
        </ConversationColumn>
      )}
    </div>
  )

  return (
    <div className={threadStyles.panel}>
      <ConversationLayoutSwitch layout={layout} onChange={handleLayoutChange} />
      <OccurrenceConversationLegend />
      {layout === 'side-by-side' ? columns : tabs}
    </div>
  )
}
