/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { DeliveryClientEmailsPanel } from './DeliveryClientEmailsPanel.component'
import { DeliveryClientWhatsAppPanel } from './DeliveryClientWhatsAppPanel.component'

/**
 * Spec 281 T8b: os contatos do cliente (e-mails e números de WhatsApp) como ação autocontida para a conversa da
 * ocorrência — a fronteira da 183 (F5) deixa a conversa importar só ações prontas de `delivery-clients`.
 */
export function ClientContactsAction(
  props: Readonly<{ isDisabled: boolean; taxId: string }>,
): JSX.Element {
  return (
    <>
      <DeliveryClientEmailsPanel
        isDisabled={props.isDisabled}
        key={`mail-${props.taxId}`}
        taxId={props.taxId}
      />
      <DeliveryClientWhatsAppPanel
        isDisabled={props.isDisabled}
        key={`wa-${props.taxId}`}
        taxId={props.taxId}
      />
    </>
  )
}
