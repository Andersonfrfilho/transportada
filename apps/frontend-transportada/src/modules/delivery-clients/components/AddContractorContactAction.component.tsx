/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useContractorContacts } from '../hooks/useContractorContacts.hook'
import {
  contractorContactDraftFromSenderSuggestion,
  type ContractorSenderSuggestion,
} from '../shared/contractorContacts.validation'
import styles from '../styles/contractorContactDialog.module.css'
import { ContactForm } from './ContractorContactsPanel.component'

type AddContractorContactActionProps = Readonly<{
  contractorId: string
  /** Depois de gravar: quem oferece a ação relê o que depende do contato (a conversa, por ex.). */
  onCreated?: () => void
  suggestion: ContractorSenderSuggestion
}>

/**
 * Spec 183 T406/T407 (RF16), movida para cá na T903 (F5): "Adicionar aos contatos" abre o cadastro
 * da T303 já preenchido com o que a mensagem trouxe. O contato nunca é criado sozinho — é o operador
 * quem confirma. É a ação autocontida que `delivery-clients` oferece (padrão `NfseEmissionAction`):
 * botão, diálogo e hook moram aqui; quem importa só decide quando oferecê-la.
 */
export function AddContractorContactAction({
  contractorId,
  onCreated,
  suggestion,
}: AddContractorContactActionProps) {
  const { t } = useTranslation('deliveryClients')
  const [isOpen, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="secondary">
        {t('addContactAction.open')}
      </Button>
      {isOpen ? (
        <AddContractorContactDialog
          contractorId={contractorId}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false)
            onCreated?.()
          }}
          suggestion={suggestion}
        />
      ) : null}
    </>
  )
}

function AddContractorContactDialog({
  contractorId,
  onClose,
  onCreated,
  suggestion,
}: Readonly<{
  contractorId: string
  onClose: () => void
  onCreated: () => void
  suggestion: ContractorSenderSuggestion
}>) {
  const { t } = useTranslation('deliveryClients')
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
          <h2 id="add-contractor-contact-title">{t('addContactAction.title')}</h2>
          <button
            aria-label={t('addContactAction.close')}
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
          onSubmit={(payload) => createMutation.mutate(payload, { onSuccess: onCreated })}
        />
      </div>
    </div>,
    document.body,
  )
}
