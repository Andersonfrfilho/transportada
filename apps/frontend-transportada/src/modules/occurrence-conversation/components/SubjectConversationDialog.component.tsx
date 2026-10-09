/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { SubjectConversationRef } from '../shared/subjectConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
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
  const titleId = `subject-conversation-title-${subject.subjectType}-${subject.subjectId}`

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id={titleId}>{t('dialog.title')}</h2>
          <button
            aria-label={t('dialog.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <SubjectConversationPanel
          canManage={canManage}
          {...(companyId === undefined ? {} : { companyId })}
          subject={subject}
          tripStatus={tripStatus}
        />
      </div>
    </div>,
    document.body,
  )
}
