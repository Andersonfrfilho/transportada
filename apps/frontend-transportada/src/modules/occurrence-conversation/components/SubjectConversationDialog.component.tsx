/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { SubjectConversationRef } from '../shared/subjectConversation.types'
import styles from '../styles/subjectConversation.module.css'
import { SubjectConversationPanel } from './SubjectConversationPanel.component'

type SubjectConversationDialogProps = Readonly<{
  canManage: boolean
  companyId?: string
  onClose: () => void
  subject: SubjectConversationRef
  tripStatus: string
}>

/** Spec 260 T3.2: a conversa do assunto em diálogo — tela cheia no celular, caixa do tablet para cima. */
export function SubjectConversationDialog({
  canManage,
  companyId,
  onClose,
  subject,
  tripStatus,
}: SubjectConversationDialogProps) {
  const { t } = useTranslation('subjectConversation')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-label={t('dialog.title')}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <SubjectConversationPanel
          canManage={canManage}
          {...(companyId === undefined ? {} : { companyId })}
          onClose={onClose}
          subject={subject}
          tripStatus={tripStatus}
        />
      </div>
    </div>,
    document.body,
  )
}
