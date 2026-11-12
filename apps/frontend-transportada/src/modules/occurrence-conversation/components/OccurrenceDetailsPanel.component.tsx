/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { ClientContactsAction } from '@/modules/delivery-clients/components/ClientContactsAction.component'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { formatPersonName } from '@/lib/personName'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'
import { OccurrenceResolutionBadge } from '@/modules/trip/components/OccurrenceResolutionBadge.component'
import {
  useTripOccurrenceDetailQuery,
  useTripOccurrenceTimelineQuery,
} from '@/modules/trip/queries/tripOccurrenceFeed.query'
import {
  describeOccurrenceClientCells,
  resolveOccurrenceTypeLabel,
  type TripOccurrenceDetail,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'
import { describeOccurrenceTimelineEvent } from '@/modules/trip/shared/tripOccurrenceTimeline.service'
import type { OccurrenceTimelineEvent } from '@/modules/trip/shared/tripOccurrenceTimeline.service'

import { useOccurrenceConversationsQuery } from '../queries/occurrenceConversation.query'
import type { OccurrenceConversationAttachment } from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceDetails.module.css'

type OccurrenceDetailsPanelProps = Readonly<{
  companyId?: string
  occurrenceId: string
  /**
   * Spec 279 T6b: o estado do envio ao cliente (Enviado/Falhou, com "Tentar de novo"), de `ClientEmailSendState`.
   * Sem nada, a seção não aparece.
   */
  sendState?: ReactNode
}>

function Section({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function translateValues(
  values: Readonly<Record<string, number | string>>,
  t: (key: string) => string,
): Readonly<Record<string, number | string>> {
  const translated = { ...values }
  for (const name of ['reason', 'status'] as const) {
    const value = translated[name]
    if (typeof value === 'string') translated[name] = t(value)
  }
  return translated
}

function TimelineSection({
  companyId,
  occurrenceId,
}: Readonly<{ companyId?: string; occurrenceId: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const { t: tTrip } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const query = useTripOccurrenceTimelineQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: true,
    occurrenceId,
  })
  const events: readonly OccurrenceTimelineEvent[] = query.data?.events ?? []

  return (
    <Section title={t('details.timeline.title')}>
      {query.isLoading ? <Skeleton height="3rem" width="100%" /> : null}
      {query.isError ? <p className={styles.hint}>{t('details.timeline.error')}</p> : null}
      {query.isSuccess && events.length === 0 ? (
        <p className={styles.hint}>{t('details.timeline.empty')}</p>
      ) : null}
      {events.length === 0 ? null : (
        <ol className={styles.timeline}>
          {events.map((event) => {
            const sentence = describeOccurrenceTimelineEvent(event)
            const actor =
              event.actor.name === null
                ? tTrip(`occurrenceTimeline.actor.${event.actor.kind}`)
                : formatPersonName(event.actor.name)
            return (
              <li key={event.id}>
                <time dateTime={event.occurredAt}>{formatMoment(event.occurredAt)}</time>
                <span>
                  {tTrip(
                    sentence.key,
                    translateValues(sentence.values, (key) => tTrip(key)),
                  )}
                </span>
                <span className={styles.timelineActor}>{actor}</span>
              </li>
            )
          })}
        </ol>
      )}
    </Section>
  )
}

/** O boleto é o arquivo que a contratante mandou na conversa: lista o que chegou, sem abrir nem reenviar. */
function BoletoSection({
  companyId,
  occurrenceId,
}: Readonly<{ companyId?: string; occurrenceId: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useOccurrenceConversationsQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: true,
    occurrenceId,
  })
  const files: readonly OccurrenceConversationAttachment[] = (query.data?.conversations ?? [])
    .filter((conversation) => conversation.participant === 'contractor')
    .flatMap((conversation) => conversation.messages)
    .filter((message) => message.direction === 'inbound')
    .flatMap((message) => message.attachments)

  return (
    <Section title={t('details.boleto.title')}>
      {files.length === 0 ? (
        <p className={styles.hint}>{t('details.boleto.none')}</p>
      ) : (
        <ul className={styles.list}>
          {files.map((file) => (
            <li key={file.id}>{file.fileName}</li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/**
 * Spec 281 T8b: o escritório completa o contato do cliente pela página da ocorrência quando o motorista não informou —
 * os mesmos painéis do cadastro do cliente (vários e-mails e números; adicionar, editar, remover). Sem `fleet.manage`
 * a lista fica só para leitura.
 */
function ClientContactsSection({
  canManage,
  taxId,
}: Readonly<{ canManage: boolean; taxId: string }>) {
  const { t } = useTranslation('occurrenceConversation')

  return (
    <Section title={t('details.clientEmails.title')}>
      {taxId === '' ? (
        <p className={styles.hint}>{t('details.clientEmails.noClient')}</p>
      ) : (
        <ClientContactsAction isDisabled={!canManage} taxId={taxId} />
      )}
    </Section>
  )
}

function SummarySections({ occurrence }: Readonly<{ occurrence: TripOccurrenceDetail }>) {
  const { t } = useTranslation('occurrenceConversation')
  const { t: tTrip } = useTranslation('trip')
  const type = resolveOccurrenceTypeLabel(occurrence)
  const typeName =
    type.labelKey === null ? type.value : tTrip(type.labelKey, { defaultValue: type.value })
  const client = describeOccurrenceClientCells(occurrence.document)
  const driverName =
    occurrence.driver === null ? t('details.noDriver') : formatPersonName(occurrence.driver.name)

  return (
    <>
      <Section title={t('details.summary.title')}>
        <dl className={styles.facts}>
          <Fact label={t('details.summary.type')} value={typeName} />
          <div>
            <dt>{t('details.summary.status')}</dt>
            <dd className={styles.statusRow}>
              <span>{tTrip(`occurrenceFeed.stage.${occurrence.stage ?? 'stop'}`)}</span>
              <OccurrenceResolutionBadge resolution={occurrence.resolution ?? null} />
            </dd>
          </div>
          <Fact
            label={t('details.summary.client')}
            value={client.name === '' ? '—' : client.name}
          />
          <Fact label={t('details.summary.driver')} value={driverName} />
        </dl>
        <p className={styles.noteLabel}>{t('details.summary.note')}</p>
        <p className={styles.note}>
          {occurrence.description === '' ? t('details.summary.noNote') : occurrence.description}
        </p>
      </Section>
    </>
  )
}

/**
 * Spec 279 T6c (RF13): o detalhe da ocorrência para quem está na conversa — tipo, nota, cliente, motorista, status,
 * linha do tempo, boleto e contatos do cliente (spec 281 T8b: o escritório completa e-mails e números daqui). O endereço chega mascarado.
 */
export function OccurrenceDetailsPanel({
  companyId,
  occurrenceId,
  sendState,
}: OccurrenceDetailsPanelProps) {
  const { t } = useTranslation('occurrenceConversation')
  const permissions = useAuthMeQuery().data?.data.permissions ?? []
  const detail = useTripOccurrenceDetailQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: true,
    occurrenceId,
  })
  const occurrence = detail.data

  if (detail.isLoading) {
    return (
      <SkeletonGroup label={t('details.loading')}>
        <Skeleton height="2rem" width="60%" />
        <Skeleton height="8rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (occurrence === undefined) {
    return (
      <p className={styles.hint} role="alert">
        {t('details.error')}
      </p>
    )
  }

  return (
    <div className={styles.body}>
      <SummarySections occurrence={occurrence} />
      <TimelineSection
        {...(companyId === undefined ? {} : { companyId })}
        occurrenceId={occurrenceId}
      />
      <BoletoSection
        {...(companyId === undefined ? {} : { companyId })}
        occurrenceId={occurrenceId}
      />
      <ClientContactsSection
        canManage={permissions.includes('fleet.manage')}
        taxId={describeOccurrenceClientCells(occurrence.document).taxId}
      />
      {sendState === undefined ? null : (
        <Section title={t('details.sendState.title')}>{sendState}</Section>
      )}
    </div>
  )
}
