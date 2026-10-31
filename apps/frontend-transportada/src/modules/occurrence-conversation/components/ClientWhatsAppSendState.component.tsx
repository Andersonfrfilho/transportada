/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import {
  useContractorReplyWhatsAppOptionsQuery,
  useResendWhatsAppDeliveryMutation,
} from '../queries/contractorReplyWhatsApp.query'
import {
  createWhatsAppIdempotencyKey,
  describeWhatsAppSendState,
  type WhatsAppSendStateItem,
} from '../shared/contractorReplyWhatsApp.service'
import styles from '../styles/occurrenceDetails.module.css'
import { ClientDeliveryStatus } from './ClientDeliveryStatus.component'

type ClientWhatsAppSendStateProps = Readonly<{
  /** Na página da ocorrência: sem envio nenhum a seção some e, com envio, ganha o título. */
  isStandalone?: boolean
  occurrenceId: string
}>

const STATE_CLASS: Record<WhatsAppSendStateItem['state'], string> = {
  failed: styles.sendStateFailed ?? '',
  queued: styles.sendStateQueued ?? '',
  sent: styles.sendStateSent ?? '',
}

/**
 * Spec 281 T7 (RF3/RF5): o estado do boleto por WhatsApp na ocorrência — por número (mascarado), **Enviado** (com a
 * hora), **Na fila** ou **Falhou** com o motivo. "Tentar de novo" só onde a segunda tentativa pode dar certo; número sem
 * WhatsApp e arquivo grande mandam para o e-mail. Cada toque abre uma tentativa nova com a própria chave.
 */
export function ClientWhatsAppSendState({
  isStandalone = false,
  occurrenceId,
}: ClientWhatsAppSendStateProps) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useContractorReplyWhatsAppOptionsQuery({ enabled: true, occurrenceId })
  const resend = useResendWhatsAppDeliveryMutation(occurrenceId)
  const [pendingDeliveryId, setPendingDeliveryId] = useState<null | string>(null)
  const deliveries = query.data?.deliveries ?? []
  const items = describeWhatsAppSendState(deliveries)
  const triggerOf = new Map(deliveries.map((delivery) => [delivery.id, delivery.trigger]))
  const channel = query.data?.clientChannel

  if (query.isLoading) return isStandalone ? null : <Skeleton height="2rem" width="100%" />
  if (query.isError) {
    return isStandalone ? null : <p className={styles.hint}>{t('details.whatsappState.error')}</p>
  }
  if (items.length === 0) {
    return isStandalone || (channel !== 'whatsapp' && channel !== 'both') ? null : (
      <p className={styles.hint}>{t('details.whatsappState.none')}</p>
    )
  }

  return (
    <>
      {isStandalone ? (
        <h4 className={styles.sectionTitle}>{t('details.whatsappState.title')}</h4>
      ) : null}
      <ul className={styles.sendList}>
        {items.map((item) => (
          <li className={styles.sendRow} key={item.deliveryId}>
            <span>{item.numberMasked}</span>
            <span className={styles.sendStateLine}>
              <strong className={STATE_CLASS[item.state]}>
                {t(`details.whatsappState.state.${item.state}`)}
              </strong>
              <ClientDeliveryStatus
                at={item.at}
                channel="whatsapp"
                state={item.state}
                stateLabel={t(`details.whatsappState.state.${item.state}`)}
                trigger={triggerOf.get(item.deliveryId)}
                triggerScope="whatsappState"
              />
              {item.state === 'sent' || item.canRetry ? (
                <Button
                  disabled={resend.isPending}
                  onClick={() => {
                    setPendingDeliveryId(item.deliveryId)
                    resend.mutate({
                      deliveryId: item.deliveryId,
                      idempotencyKey: createWhatsAppIdempotencyKey(() => crypto.randomUUID()),
                    })
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {resend.isPending && pendingDeliveryId === item.deliveryId
                    ? t('details.whatsappState.retrying')
                    : item.state === 'sent'
                      ? t('details.whatsappState.resend')
                      : t('details.whatsappState.retry')}
                </Button>
              ) : null}
            </span>
            {item.state === 'failed' && item.reason !== null ? (
              <span className={styles.hint}>
                {`${t(`clientWhatsApp.reason.${item.reason}`)}.`}
                {item.offerEmail ? ` ${t('clientWhatsApp.useEmail')}` : ''}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {resend.isError ? (
        <p className={styles.hint} role="alert">
          {t('details.whatsappState.retryError')}
        </p>
      ) : null}
    </>
  )
}
