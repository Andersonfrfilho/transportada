/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { useClientBoletoEmails } from '../hooks/useClientBoletoEmails.hook'
import styles from '../styles/clientEmail.module.css'
import { ClientEmailSendSheet } from './ClientEmailSendSheet.component'

type ClientEmailSendButtonProps = Readonly<{
  /** O boleto já chegou ao motorista (RF6): sem isso nada é pedido à API nem desenhado. */
  hasBoleto: boolean
  occurrenceId: string
  /** O que identifica a ocorrência para leitor de tela (o nome do tipo). */
  contextLabel: string
}>

/**
 * Spec 279 T6 (RF6/RF9/RF11): "Enviar ao cliente", na conversa e no cartão da ocorrência. O tipo decide: a
 * API recusa com `409` quando o tipo é `off` ou o encaminhamento está desligado, e o botão some.
 */
export function ClientEmailSendButton({ hasBoleto, ...props }: ClientEmailSendButtonProps) {
  // Sem boleto nenhum hook roda: a lista da rota desenha este botão em toda linha, e só a que tem boleto pede à API.
  return hasBoleto ? <ClientEmailSendAction {...props} /> : null
}

function ClientEmailSendAction({
  contextLabel,
  occurrenceId,
}: Omit<ClientEmailSendButtonProps, 'hasBoleto'>) {
  const { t } = useTranslation('clientEmail')
  const [isOpen, setOpen] = useState(false)
  const emails = useClientBoletoEmails({ isEnabled: true, occurrenceId })
  if (emails.isHidden) return null

  return (
    <>
      <button
        aria-label={t('button.ariaLabel', { context: contextLabel })}
        className={styles.openButton}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Icon aria-hidden="true" name="send" size="sm" />
        <span>{t('button.label')}</span>
      </button>
      {/* No `body`: o cartão da lista tem `opacity` quando resolvida, e isso prende o `fixed` da folha dentro dele. */}
      {isOpen
        ? createPortal(
            <ClientEmailSendSheet
              occurrenceId={occurrenceId}
              onClose={() => setOpen(false)}
              options={emails.options}
            />,
            document.body,
          )
        : null}
    </>
  )
}
