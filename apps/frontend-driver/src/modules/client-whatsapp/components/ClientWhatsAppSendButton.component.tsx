/* Copyright (c) 2026 Ada Technology. MIT License. */
import { QueryClientContext, skipToken, useQuery } from '@tanstack/react-query'
import { useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import {
  collectBoletoAcceptedIds,
  hasBoletoArrived,
} from '@/modules/client-email/shared/clientBoletoEmailVisibility.service'
import emailStyles from '@/modules/client-email/styles/clientEmail.module.css'
import { Icon } from '@/components/ui/icon'
import { CURRENT_TRIP_QUERY_KEY } from '@/modules/driver-trip/hooks/useDriverTrip.hook'
import type { RouteOccurrencePhraseKey } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import type { DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'

import { useClientBoletoWhatsApp } from '../hooks/useClientBoletoWhatsApp.hook'
import { ClientWhatsAppSendSheet } from './ClientWhatsAppSendSheet.component'

type ClientWhatsAppSendButtonProps = Readonly<{
  /** A frase de resolução da ocorrência, quando a tela a tem (a lista da rota); o aceite vem da viagem. */
  phraseKey?: RouteOccurrencePhraseKey | null | undefined
  occurrenceId: string
  /** O que identifica a ocorrência para leitor de tela (o nome do tipo). */
  contextLabel: string
}>

/**
 * Spec 281 T8 (RF3/RF5/D11): "Enviar por WhatsApp", ao lado do "Enviar ao cliente". O tipo decide: a API recusa com
 * `409` quando o `client_channel` não liga o WhatsApp, e o botão some; com o número da empresa desconectado ele
 * também some e o e-mail segue sendo o caminho.
 */
export function ClientWhatsAppSendButton(props: ClientWhatsAppSendButtonProps) {
  // Sem provedor de consulta (teste de renderização estática, tela fora da casca) não há o que perguntar.
  return useContext(QueryClientContext) === undefined ? null : <ClientWhatsAppSendGate {...props} />
}

/** Sem boleto aceito nenhum pedido à API é feito: a lista da rota desenha este botão em toda linha. */
function ClientWhatsAppSendGate({ phraseKey, ...props }: ClientWhatsAppSendButtonProps) {
  const trip = useQuery<DriverTripSnapshot>({
    enabled: false,
    queryFn: skipToken,
    queryKey: CURRENT_TRIP_QUERY_KEY,
  })
  const acceptedIds = collectBoletoAcceptedIds(trip.data?.trips ?? [])
  return hasBoletoArrived(phraseKey, acceptedIds, props.occurrenceId) ? (
    <ClientWhatsAppSendAction {...props} />
  ) : null
}

function ClientWhatsAppSendAction({
  contextLabel,
  occurrenceId,
}: Omit<ClientWhatsAppSendButtonProps, 'phraseKey'>) {
  const { t } = useTranslation('clientWhatsApp')
  const [isOpen, setOpen] = useState(false)
  const whatsapp = useClientBoletoWhatsApp({ isEnabled: true, occurrenceId })
  if (whatsapp.isHidden) return null

  return (
    <>
      <button
        aria-label={t('button.ariaLabel', { context: contextLabel })}
        className={emailStyles.openButton}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Icon aria-hidden="true" name="message" size="sm" />
        <span>{t('button.label')}</span>
      </button>
      {/* No `body`: o cartão da lista tem `opacity` quando resolvida, e isso prende o `fixed` da folha dentro dele. */}
      {isOpen
        ? createPortal(
            <ClientWhatsAppSendSheet
              occurrenceId={occurrenceId}
              onClose={() => setOpen(false)}
              options={whatsapp.options}
            />,
            document.body,
          )
        : null}
    </>
  )
}
