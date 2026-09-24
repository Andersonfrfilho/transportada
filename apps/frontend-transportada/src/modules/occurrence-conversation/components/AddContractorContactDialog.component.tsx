/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { ContactForm } from '@/modules/delivery-clients/components/ContractorContactsPanel.component'
import { useContractorContacts } from '@/modules/delivery-clients/hooks/useContractorContacts.hook'
import { contractorContactDraftFromSenderSuggestion } from '@/modules/delivery-clients/shared/contractorContacts.validation'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useQueryClient } from '@tanstack/react-query'

import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from '../queries/occurrenceConversation.query'
import type { ContractorSenderSuggestion } from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'

type AddContractorContactDialogProps = Readonly<{
  contractorId: string
  onClose: () => void
  suggestion: ContractorSenderSuggestion
}>

/**
 * Spec 183 T406/T407 (RF16): "Adicionar aos contatos" abre o cadastro da T303 já preenchido com o
 * que a mensagem trouxe. O contato nunca é criado sozinho — é o operador quem confirma —, e a
 * conversa volta a ser lida: o remetente passa a casar com o contato novo, mensagens antigas também.
 */
export function AddContractorContactDialog({
  contractorId,
  onClose,
  suggestion,
}: AddContractorContactDialogProps) {
  const { t } = useTranslation('occurrenceConversation')
  const queryClient = useQueryClient()
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const { createMutation } = useContractorContacts({ contractorId, enabled: false })

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="add-contractor-contact-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id="add-contractor-contact-title">{t('addContact.title')}</h2>
          <button
            aria-label={t('addContact.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <ContactForm
          error={createMutation.error ?? null}
          initialDraft={contractorContactDraftFromSenderSuggestion(suggestion)}
          isBusy={createMutation.isPending}
          mode="create"
          onCancel={onClose}
          onSubmit={(payload) =>
            createMutation.mutate(payload, {
              onSuccess: () => {
                void queryClient.invalidateQueries({
                  queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY],
                })
                onClose()
              },
            })
          }
        />
      </div>
    </div>,
    document.body,
  )
}
