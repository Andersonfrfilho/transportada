/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  useContractorReplyEmailOptionsQuery,
  useRetryClientDeliveryMutation,
} from '../queries/contractorReplyEmail.query'
import {
  describeClientEmailSendState,
  type ClientEmailSendStateItem,
} from '../shared/contractorReplyEmail.service'
import styles from '../styles/occurrenceDetails.module.css'

type ClientEmailSendStateProps = Readonly<{
  /** Na página da ocorrência: sem envio nenhum a seção some e, com envio, ganha o título. */
  isStandalone?: boolean
  occurrenceId: string
}>

const STATE_CLASS: Record<ClientEmailSendStateItem['state'], string> = {
  failed: styles.sendStateFailed ?? '',
  queued: styles.sendStateQueued ?? '',
  sent: styles.sendStateSent ?? '',
}

/**
 * Spec 279 T6b (RF12): o estado do envio do boleto ao cliente na ocorrência — por endereço, **Enviado** (com a hora),
 * **Na fila** ou **Falhou** com "Tentar de novo" quando o provedor recusou. O endereço aparece por inteiro: é a tela da
 * própria empresa. O "Tentar de novo" manda só o id da entrega; a API lê o endereço e o anexo dela.
 */
export function ClientEmailSendState({
  isStandalone = false,
  occurrenceId,
}: ClientEmailSendStateProps) {
  const { t } = useTranslation('occurrenceConversation')
  const formatMoment = useMomentFormatter()
  const query = useContractorReplyEmailOptionsQuery({ enabled: true, occurrenceId })
  const retry = useRetryClientDeliveryMutation(occurrenceId)
  const items = describeClientEmailSendState(query.data?.deliveries ?? [])

  if (query.isLoading) return isStandalone ? null : <Skeleton height="2rem" width="100%" />
  if (query.isError) return <p className={styles.hint}>{t('details.sendState.error')}</p>
  if (items.length === 0) {
    return isStandalone ? null : <p className={styles.hint}>{t('details.sendState.none')}</p>
  }

  return (
    <>
      {isStandalone ? (
        <h4 className={styles.sectionTitle}>{t('details.sendState.title')}</h4>
      ) : null}
      <ul className={styles.sendList}>
        {items.map((item) => (
          <li className={styles.sendRow} key={item.deliveryId}>
            <span>{item.address}</span>
            <span className={styles.sendStateLine}>
              <strong className={STATE_CLASS[item.state]}>
                {t(`details.sendState.state.${item.state}`)}
              </strong>
              <time dateTime={item.at}>{formatMoment(item.at)}</time>
              {item.canRetry ? (
                <Button
                  disabled={retry.isPending}
                  onClick={() => retry.mutate({ deliveryId: item.deliveryId })}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {retry.isPending ? t('details.sendState.retrying') : t('details.sendState.retry')}
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {retry.isError ? (
        <p className={styles.hint} role="alert">
          {t('details.sendState.retryError')}
        </p>
      ) : null}
    </>
  )
}
