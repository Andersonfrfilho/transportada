/* Copyright (c) 2026 Ada Technology. MIT License. */
import { QueryClientContext, skipToken, useQuery } from '@tanstack/react-query'
import { useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { CURRENT_TRIP_QUERY_KEY } from '@/modules/driver-trip/hooks/useDriverTrip.hook'
import type { RouteOccurrencePhraseKey } from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import type { DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'

import { useClientBoletoEmails } from '../hooks/useClientBoletoEmails.hook'
import {
  collectBoletoAcceptedIds,
  hasBoletoArrived,
} from '../shared/clientBoletoEmailVisibility.service'
import styles from '../styles/clientEmail.module.css'
import { ClientEmailSendSheet } from './ClientEmailSendSheet.component'

type ClientEmailSendButtonProps = Readonly<{
  /** A frase de resolução da ocorrência, quando a tela a tem (a lista da rota); o aceite vem da viagem. */
  phraseKey?: RouteOccurrencePhraseKey | null | undefined
  occurrenceId: string
  /** O que identifica a ocorrência para leitor de tela (o nome do tipo). */
  contextLabel: string
}>

/**
 * Spec 279 T6 (RF6/RF9/RF11): "Enviar ao cliente", na conversa e no cartão da ocorrência. O tipo decide: a
 * API recusa com `409` quando o tipo é `off` ou o encaminhamento está desligado, e o botão some.
 */
export function ClientEmailSendButton(props: ClientEmailSendButtonProps) {
  // Sem provedor de consulta (teste de renderização estática, tela fora da casca) não há o que perguntar.
  return useContext(QueryClientContext) === undefined ? null : <ClientEmailSendGate {...props} />
}

/** Sem boleto aceito nenhum pedido à API é feito: a lista da rota desenha este botão em toda linha. */
function ClientEmailSendGate({ phraseKey, ...props }: ClientEmailSendButtonProps) {
  const trip = useQuery<DriverTripSnapshot>({
    enabled: false,
    queryFn: skipToken,
    queryKey: CURRENT_TRIP_QUERY_KEY,
  })
  const acceptedIds = collectBoletoAcceptedIds(trip.data?.trips ?? [])
  return hasBoletoArrived(phraseKey, acceptedIds, props.occurrenceId) ? (
    <ClientEmailSendAction {...props} />
  ) : null
}

function ClientEmailSendAction({
  contextLabel,
  occurrenceId,
}: Omit<ClientEmailSendButtonProps, 'phraseKey'>) {
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
