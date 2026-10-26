/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { buildTimelineLines } from '@/modules/driver-trip/pages/DriverOccurrenceDetail.page'
import type { DriverTrip } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  useDriverRouteOccurrenceDetail,
  useDriverRouteOccurrences,
} from '@/modules/driver-trip/shared/useDriverRouteOccurrences.query'

import { ClientEmailSendState } from './ClientEmailSendState.component'
import { useDriverClientEmailsQuery } from '../shared/driverClientEmails.query'
import styles from '../styles/occurrenceDetails.module.css'

type OccurrenceDetailsSheetProps = Readonly<{
  canSync: boolean
  occurrenceId: string
  onClose: () => void
  /**
   * Spec 279 T6b: o estado do envio ao cliente. Sem nada passado, a folha mostra o que o servidor devolve dos
   * envios (só leitura); sem envio nenhum, a seção não aparece.
   */
  sendState?: ReactNode
  trip: DriverTrip | undefined
  tripId: string | undefined
}>

function Section({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  )
}

function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}

/**
 * Spec 279 T6c (RF13): o que o motorista já vê da própria ocorrência — tipo, estado, nota, cliente, andamento,
 * arquivos — sem sair da conversa. É leitura: nenhuma ação sai daqui, e o e-mail do cliente chega mascarado (T4).
 */
export function OccurrenceDetailsSheet({
  canSync,
  occurrenceId,
  onClose,
  sendState,
  trip,
  tripId,
}: OccurrenceDetailsSheetProps) {
  const { t } = useTranslation('conversation')
  const { t: tTrip } = useTranslation('driverTrip')
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const list = useDriverRouteOccurrences({ canSync, tripId })
  const occurrence =
    list.data?.status === 'loaded'
      ? list.data.occurrences.find((candidate) => candidate.id === occurrenceId)
      : undefined
  const detail = useDriverRouteOccurrenceDetail({
    canSync: canSync && occurrence !== undefined,
    id: occurrenceId,
    kind: occurrence?.kind ?? 'document',
  })
  const detailData = detail.data?.status === 'loaded' ? detail.data.data : undefined
  const emails = useDriverClientEmailsQuery({ canSync, id: occurrenceId })
  useEscapeToClose(onClose)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const stop = trip?.stops.find((candidate) => candidate.id === occurrence?.stopId)
  const invoice = stop?.documents.find((candidate) => candidate.id === occurrence?.documentId)
  const timeline =
    occurrence === undefined
      ? []
      : buildTimelineLines({
          detail: detailData,
          entry: {
            documentId: occurrence.documentId,
            documentNumber: occurrence.documentNumber,
            hasConversation: occurrence.conversationExists,
            hasDocument: occurrence.documentCount > 0,
            iconName: occurrence.type.iconName,
            id: occurrence.id,
            isReopened: occurrence.reopenedAt !== null,
            kind: occurrence.kind,
            recordedAt: occurrence.recordedAt,
            rejectionCause: undefined,
            resolutionNote: undefined,
            resolutionPhraseKey: undefined,
            source: 'server',
            state: occurrence.state,
            stopId: occurrence.stopId,
            stopSequence: occurrence.stopSequence,
            typeId: occurrence.type.id,
            typeName: occurrence.type.name,
            unreadCount: 0,
          },
          t: tTrip,
        })
  const files = detailData?.attachments ?? []
  const clientEmails = emails.data?.emails ?? []
  const deliveries = emails.data?.deliveries ?? []

  return createPortal(
    <div className={styles.overlay}>
      <div aria-hidden="true" className={styles.backdrop} onClick={onClose} />
      <section aria-labelledby={titleId} aria-modal="true" className={styles.sheet} role="dialog">
        <header className={styles.head}>
          <h2 id={titleId}>{t('details.title')}</h2>
          <button
            aria-label={t('details.close')}
            className={styles.close}
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className={styles.scroll}>
          {occurrence === undefined ? (
            <p className={styles.hint} role="status">
              {list.isLoading ? t('details.loading') : t('details.unavailable')}
            </p>
          ) : (
            <>
              <Section title={t('details.summary.title')}>
                <dl className={styles.facts}>
                  <div>
                    <dt>{t('details.summary.type')}</dt>
                    <dd>{occurrence.type.name}</dd>
                  </div>
                  <div>
                    <dt>{t('details.summary.status')}</dt>
                    <dd>{tTrip(`routeOccurrence.state.${occurrence.state}`)}</dd>
                  </div>
                  <div>
                    <dt>{t('details.summary.client')}</dt>
                    <dd>{invoice?.recipientName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>{t('details.summary.driver')}</dt>
                    <dd>
                      {occurrence.recordedByMe
                        ? t('details.summary.recordedByMe')
                        : t('details.summary.recordedByOffice')}
                    </dd>
                  </div>
                </dl>
                <p className={styles.noteLabel}>{t('details.summary.note')}</p>
                <p className={styles.note}>{detailData?.note ?? t('details.summary.noNote')}</p>
              </Section>
              <Section title={t('details.timeline.title')}>
                <ol className={styles.timeline}>
                  {timeline.map((line) => (
                    <li key={line.key}>
                      <time>{line.time}</time>
                      <span>{line.text}</span>
                    </li>
                  ))}
                </ol>
              </Section>
              <Section title={t('details.boleto.title')}>
                {files.length === 0 ? (
                  <p className={styles.hint}>{t('details.boleto.none')}</p>
                ) : (
                  <ul className={styles.list}>
                    {files.map((file) => (
                      <li key={file.objectId}>{file.name ?? t('details.boleto.unnamed')}</li>
                    ))}
                  </ul>
                )}
              </Section>
              {emails.isError ? null : (
                <Section title={t('details.clientEmails.title')}>
                  {clientEmails.length === 0 ? (
                    <p className={styles.hint}>{t('details.clientEmails.none')}</p>
                  ) : (
                    <ul className={styles.list}>
                      {clientEmails.map((email) => (
                        <li key={email.emailId}>
                          <span>{email.addressMasked}</span>
                          {email.label === '' ? null : (
                            <span className={styles.labelNote}>{email.label}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              )}
              {sendState === undefined && deliveries.length === 0 ? null : (
                <Section title={t('details.sendState.title')}>
                  {sendState ?? <ClientEmailSendState deliveries={deliveries} />}
                </Section>
              )}
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}
