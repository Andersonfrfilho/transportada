/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import { isResendRequestEvent } from '../shared/contractorReply.service'
import type { ContractorReplyDelivery, ContractorReplyEvent } from '../shared/contractorReply.types'
import styles from '../styles/contractorReply.module.css'

type ContractorReplyTimelineProps = Readonly<{
  deliveries: readonly ContractorReplyDelivery[]
  events: readonly ContractorReplyEvent[]
}>

/**
 * Spec 248 RF13: a linha do tempo do retorno, do mais novo ao mais antigo, e o que foi entregue a quem. O ator
 * é só o tipo (sistema ou operação): a API não manda quem foi.
 */
export function ContractorReplyTimeline({ deliveries, events }: ContractorReplyTimelineProps) {
  const { t } = useTranslation('occurrenceConversation')
  const formatMoment = useMomentFormatter()

  return (
    <>
      {deliveries.length === 0 ? null : (
        <section aria-label={t('contractorReply.deliveries.title')} className={styles.block}>
          <h4>{t('contractorReply.deliveries.title')}</h4>
          <ul className={styles.list}>
            {deliveries.map((delivery) => (
              <li key={delivery.id}>
                <strong>{t(`contractorReply.deliveries.target.${delivery.target}`)}</strong>
                {' · '}
                {t(`contractorReply.deliveries.status.${delivery.status}`)}
                {delivery.reason === null
                  ? null
                  : ` · ${t(`contractorReply.deliveries.reason.${delivery.reason}`)}`}
                {delivery.sentAt === null ? null : ` · ${formatMoment(delivery.sentAt)}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label={t('contractorReply.timeline.title')} className={styles.block}>
        <h4>{t('contractorReply.timeline.title')}</h4>
        {events.length === 0 ? (
          <p className={styles.hint}>{t('contractorReply.timeline.empty')}</p>
        ) : (
          <ol className={styles.timeline}>
            {events.map((event) => (
              <li className={styles.timelineItem} key={event.id}>
                <span className={styles.timelineWhen}>{formatMoment(event.createdAt)}</span>
                <span>
                  {isResendRequestEvent(event)
                    ? t('contractorReply.timeline.event.resent')
                    : t(`contractorReply.timeline.event.${event.toStatus}`)}
                  {' · '}
                  <span className={styles.timelineActor}>
                    {t(`contractorReply.timeline.actor.${event.actorKind}`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
