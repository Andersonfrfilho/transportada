/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344: quem decide "Aplicar" ou "Descartar" precisa ver a foto. A linha de /pendencias mostra a
 * miniatura do comprovante e, ao clicar, abre o original no mesmo visualizador da viagem.
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { ProofGalleryDialog } from '@/modules/trip/components/ProofGalleryDialog.component'
import { ProofImage } from '@/modules/trip/components/ProofImage.component'
import type { DeliveryProof } from '@/modules/trip/shared/deliveryProof.service'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { createTripClient } from '@/modules/trip/shared/tripClient.service'
import { useTranslation } from 'react-i18next'

import styles from '../styles/pendingItems.module.css'

type CanhotoProofPreviewProps = Readonly<{
  documentId: string
  proofId: string
  readProofs?: (input: { documentId: string; tripId: string }) => Promise<readonly DeliveryProof[]>
  tripId: string
}>

function readWithDefaultClient(input: { documentId: string; tripId: string }) {
  return createTripClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  }).readDeliveryProofs(input)
}

export function CanhotoProofPreview({
  documentId,
  proofId,
  readProofs,
  tripId,
}: CanhotoProofPreviewProps) {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const query = useQuery({
    queryFn: () => (readProofs ?? readWithDefaultClient)({ documentId, tripId }),
    queryKey: ['pending-items', 'canhoto-proof', tripId, documentId] as const,
    staleTime: 60_000,
  })

  const proof = query.data?.find((candidate) => candidate.id === proofId)
  if (proof === undefined) return null

  return (
    <div className={styles.canhotoPreview} data-testid="canhoto-preview">
      <ProofImage
        alt={t('deliveryProof.photoAlt')}
        label={t('deliveryProof.photoAlt')}
        onOpen={() => setIsOpen(true)}
        proof={proof}
        variant="thumbnail"
      />
      {isOpen ? (
        <ProofGalleryDialog gallery={[proof]} initialIndex={0} onClose={() => setIsOpen(false)} />
      ) : null}
    </div>
  )
}
