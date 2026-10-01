/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { DeliveryProofPieces } from '../shared/deliveryProofCard.service'
import styles from '../styles/trip.module.css'

import { ProofImage } from './ProofImage.component'

type ProofPiecesProps = Readonly<{
  onOpen: (proofId: string) => void
  pieces: DeliveryProofPieces
}>

/** A peça principal grande e, se houver outras, a tira de miniaturas — só o que o payload trouxe. */
export function ProofPieces({ onOpen, pieces }: ProofPiecesProps) {
  const { t } = useTranslation('trip')
  const { main, others } = pieces

  return (
    <div className={styles.proofPieces}>
      {main === undefined ? null : (
        <ProofImage
          alt={t(main.altKey)}
          label={t(main.labelKey)}
          onOpen={onOpen}
          proof={main.proof}
          variant="main"
        />
      )}
      {others.length === 0 ? null : (
        <ul aria-label={t('deliveryProof.piecesLabel')} className={styles.proofStrip}>
          {others.map((piece) => (
            <li key={piece.proof.id}>
              <ProofImage
                alt={t(piece.altKey)}
                label={t(piece.labelKey)}
                onOpen={onOpen}
                proof={piece.proof}
                variant="thumbnail"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
