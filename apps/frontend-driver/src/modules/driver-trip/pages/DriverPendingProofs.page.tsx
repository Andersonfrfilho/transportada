/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/pages/DriverPendingProofs.page.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  DeliveryProofSection,
  type DriverProofAttachment,
} from '../components/DriverStopCard.component'
import type { EventQueueItemView } from '../shared/eventQueueView.service'
import { documentAttachmentKey } from '../shared/offlineAttachments.service'
import type { DriverTripSnapshot, ProofPunctuality } from '../shared/driverTrip.types'
import { listProofPendingDocuments } from '../shared/driverTripView.service'
import styles from '../styles/driverTrip.module.css'

type DriverPendingProofsPageProps = Readonly<{
  onBack: () => void
  onProof: (input: DriverProofAttachment) => void
  proofOutcomeByDocumentId: ReadonlyMap<string, ProofPunctuality>
  /** Spec 159 (T11): diz quais documentos já têm anexo na fila, aguardando envio. */
  queueView: readonly EventQueueItemView[]
  snapshot: DriverTripSnapshot | undefined
}>

/** O documento já tem anexo parado na fila — o formulário some, para não duplicar o toque. */
export function isProofAlreadyQueued(input: {
  readonly documentId: string
  readonly queueView: readonly EventQueueItemView[]
}): boolean {
  const key = documentAttachmentKey(input.documentId)
  return input.queueView.some(
    (item) => item.idempotencyKey === key && item.status.state !== 'rejected',
  )
}

/**
 * Spec 159 (P6, T9): toda nota entregue sem a foto obrigatória, em qualquer viagem do snapshot —
 * o motorista anexa em lote sem procurar parada por parada. O formulário é o mesmo de
 * `DriverStopCard` (`DeliveryProofSection`), reaproveitado — não uma segunda implementação.
 */
export function DriverPendingProofsPage({
  onBack,
  onProof,
  proofOutcomeByDocumentId,
  queueView,
  snapshot,
}: DriverPendingProofsPageProps) {
  const { t } = useTranslation('driverTrip')
  const entries = listProofPendingDocuments(snapshot)

  return (
    <main className={styles.shell}>
      <header className={styles.eventQueueHeader}>
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('pendingProofs.back')}
        </Button>
        <h1 className={styles.eventQueueTitle}>{t('pendingProofs.title')}</h1>
      </header>
      {entries.length === 0 ? null : (
        <p className={styles.profileMeta}>{t('pendingProofs.hint')}</p>
      )}

      {entries.length === 0 ? (
        <p className={styles.profileMeta} role="status">
          {t('pendingProofs.empty')}
        </p>
      ) : (
        <ul className={styles.documentList}>
          {entries.map((entry) => {
            const outcome = proofOutcomeByDocumentId.get(entry.documentId)
            const isQueued = isProofAlreadyQueued({
              documentId: entry.documentId,
              queueView,
            })
            return (
              <li className={styles.pendingProofItem} key={entry.documentId}>
                <span className={styles.pendingProofRecipient}>{entry.recipientName}</span>
                <span className={styles.stopMeta}>
                  {t('pendingProofs.documentLabel', {
                    number: entry.documentNumber,
                    series: entry.documentSeries,
                  })}
                </span>
                {outcome === undefined ? null : (
                  <p className={styles.profileMeta} role="status">
                    {t(`pendingProofs.outcome.${outcome}`)}
                  </p>
                )}
                {isQueued ? (
                  <p className={styles.pendingProofQueued} role="status">
                    <Icon name="clock" />
                    {t('pendingProofs.queued')}
                  </p>
                ) : (
                  <DeliveryProofSection
                    documentId={entry.documentId}
                    onProof={onProof}
                    proofSettings={entry.deliveryProof}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
