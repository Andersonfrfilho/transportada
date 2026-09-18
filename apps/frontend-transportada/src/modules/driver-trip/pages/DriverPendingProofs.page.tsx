/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import {
  DeliveryProofSection,
  type DriverProofAttachment,
} from '../components/DriverStopCard.component'
import type { DriverTripSnapshot, ProofPunctuality } from '../shared/driverTrip.types'
import { listProofPendingDocuments } from '../shared/driverTripView.service'
import styles from '../styles/driverTrip.module.css'

type DriverPendingProofsPageProps = Readonly<{
  onBack: () => void
  onProof: (input: DriverProofAttachment) => void
  proofOutcomeByDocumentId: ReadonlyMap<string, ProofPunctuality>
  snapshot: DriverTripSnapshot | undefined
}>

/**
 * Spec 157 (P6, T9): toda nota entregue sem a foto obrigatória, em qualquer viagem do snapshot —
 * o motorista anexa em lote sem procurar parada por parada. O formulário é o mesmo de
 * `DriverStopCard` (`DeliveryProofSection`), reaproveitado — não uma segunda implementação.
 */
export function DriverPendingProofsPage({
  onBack,
  onProof,
  proofOutcomeByDocumentId,
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

      {entries.length === 0 ? (
        <p className={styles.profileMeta} role="status">
          {t('pendingProofs.empty')}
        </p>
      ) : (
        <ul className={styles.documentList}>
          {entries.map(({ document, stopLabel }) => {
            const outcome = proofOutcomeByDocumentId.get(document.id)
            return (
              <li className={styles.document} key={document.id}>
                <span>{document.recipientName}</span>
                <span className={styles.stopMeta}>{stopLabel}</span>
                {outcome === undefined ? null : (
                  <p className={styles.profileMeta} role="status">
                    {t(`pendingProofs.outcome.${outcome}`)}
                  </p>
                )}
                <DeliveryProofSection
                  documentId={document.id}
                  onProof={onProof}
                  proofSettings={document.deliveryProof}
                />
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
