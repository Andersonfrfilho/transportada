/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { TripWorkspaceController } from '../hooks/useTripWorkspace.hook'
import { hasTripDocumentProof } from '../shared/tripDocument.service'
import type { TripDocumentDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

import { TripOccurrences } from './TripOccurrences.component'

type TripDocumentOccurrencesProps = Readonly<{
  document: TripDocumentDetail
  workspace: TripWorkspaceController
}>

/**
 * Spec 227 D2: as ocorrências são seção da nota aberta, irmã de "Dados da nota" e do comprovante —
 * não mais uma terceira expansão dentro do comprovante. A busca segue a nota aberta (entregue ou
 * não), então a lista vazia aqui quer dizer que não há ocorrência, não que ela não foi buscada.
 *
 * ⚠️ O **formulário** de registro continua só na nota entregue ou devolvida, como era dentro do
 * comprovante: a busca de itens só roda para ela, e numa nota não entregue o formulário listaria
 * produtos só pelo código — além de duplicar o botão "Ocorrência" da separação (spec 182).
 */
export function TripDocumentOccurrences({ document, workspace }: TripDocumentOccurrencesProps) {
  const { t } = useTranslation('trip')

  return (
    <section
      aria-label={t('occurrence.title')}
      className={`${styles.documentData} ${styles.documentOccurrences}`}
    >
      <TripOccurrences
        canOpenOccurrence={workspace.controller.canReadTripFleetDetails}
        canRegister={workspace.controller.canManageTrips && hasTripDocumentProof(document)}
        email={workspace.lastOccurrenceEmail}
        isRegistering={workspace.isSendingOccurrencePhotos}
        occurrences={workspace.occurrencesQuery.data ?? []}
        onRegister={(occurrence) =>
          workspace.sendSeparationOccurrencePhotos({
            documentId: document.id,
            note: occurrence.note,
            occurrenceTypeId: occurrence.occurrenceTypeId,
            photos: occurrence.photos,
            productCodes: occurrence.productCodes,
            productQuantities: occurrence.productQuantities,
            productQuantityUnits: occurrence.productQuantityUnits,
            tripId: document.tripId,
          })
        }
        onReset={workspace.resetSeparationOccurrencePhotoSend}
        photoSendState={workspace.occurrencePhotoSendState}
        products={workspace.documentProductsQuery.data ?? []}
        types={workspace.occurrenceTypesQuery.data ?? []}
      />
    </section>
  )
}
