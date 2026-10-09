/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  useOpenSubjectConversationMutation,
  useSubjectConversationsQuery,
} from '../queries/subjectConversation.query'
import {
  findSubjectConversation,
  resolveSubjectConversationAccess,
  resolveSubjectConversationErrorKey,
} from '../shared/subjectConversation.service'
import type { SubjectConversationType } from '../shared/subjectConversation.types'
import styles from '../styles/subjectConversation.module.css'
import { SubjectConversationDialog } from './SubjectConversationDialog.component'
import { SubjectConversationProtocol } from './SubjectConversationProtocol.component'

type SubjectConversationActionProps = Readonly<{
  /** `trip.manage`: abrir, enviar e encerrar. Sem ele só se vê a conversa que já existe. */
  canManage: boolean
  /** `fleet.read`: a lista da viagem. Sem ela a ação nem consulta a API. */
  canRead: boolean
  companyId?: string
  subjectId: string
  subjectType: SubjectConversationType
  tripId: string
  tripStatus: string
}>

/**
 * Spec 260 T3.1 (RF12): "Falar com o motorista" na nota e na viagem — a ação autocontida que o detalhe da
 * viagem encaixa (padrão `NfseEmissionAction`). Decide sozinha estado, permissão e abertura do diálogo;
 * abrir é idempotente e reabre a conversa que o escritório encerrou. Mostra o protocolo e as não lidas.
 */
export function SubjectConversationAction({
  canManage,
  canRead,
  companyId,
  subjectId,
  subjectType,
  tripId,
  tripStatus,
}: SubjectConversationActionProps) {
  const { t } = useTranslation('subjectConversation')
  const [isDialogOpen, setDialogOpen] = useState(false)
  const open = useOpenSubjectConversationMutation()
  const conversations = useSubjectConversationsQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canRead,
    poll: false,
    tripId,
  })
  const subject = { subjectId, subjectType, tripId } as const
  const summary = findSubjectConversation(conversations.data, subject)
  const access = resolveSubjectConversationAccess({ canManage, summary, tripStatus })
  if (!canRead || (!access.canView && !access.canOpen)) return null

  const unreadCount = summary?.status === 'open' ? summary.unreadCount : 0
  const label =
    summary === undefined ? t('action.talk') : access.canSend ? t('action.open') : t('action.view')

  function handleClick(): void {
    if (summary !== undefined) {
      setDialogOpen(true)
      return
    }
    open.mutate(subject, { onSuccess: () => setDialogOpen(true) })
  }

  return (
    <span className={styles.actionGroup}>
      <Button
        disabled={open.isPending}
        onClick={handleClick}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="message" />
        {open.isPending ? t('action.opening') : label}
        {unreadCount > 0 ? (
          <span className={styles.unread}>{t('action.unread', { count: unreadCount })}</span>
        ) : null}
      </Button>
      {summary === undefined ? null : <SubjectConversationProtocol protocol={summary.protocol} />}
      {open.isError ? (
        <p className={styles.actionError} role="alert">
          {t(`error.${resolveSubjectConversationErrorKey(open.error)}`)}
        </p>
      ) : null}
      {isDialogOpen ? (
        <SubjectConversationDialog
          canManage={canManage}
          {...(companyId === undefined ? {} : { companyId })}
          onClose={() => setDialogOpen(false)}
          subject={subject}
          tripStatus={tripStatus}
        />
      ) : null}
    </span>
  )
}
