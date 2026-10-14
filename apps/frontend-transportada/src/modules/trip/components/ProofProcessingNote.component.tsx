/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T009: a linha discreta do estado da foto. `received`/`processing` dizem que a versão leve
 * ainda sai (o original segue na tela); `processing_failed` diz que ficou só o original. Foto pronta
 * (ou API anterior, sem o campo) não renderiza nada.
 */
import { useTranslation } from 'react-i18next'

import { presentDeliveryProofProcessing, type DeliveryProof } from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

export function ProofProcessingNote({ proof }: Readonly<{ proof: DeliveryProof }>) {
  const { t } = useTranslation('trip')
  const presentation = presentDeliveryProofProcessing(proof)
  if (presentation === undefined) return null

  return (
    <p className={styles.hint} role="status">
      {t(`deliveryProof.processing.${presentation}`)}
    </p>
  )
}
