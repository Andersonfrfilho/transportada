/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'
import type { DocumentReference } from '../shared/cargoReceivingRefusal.service'
import officeStyles from '../styles/cargoOccurrenceOffice.module.css'
import { CargoOccurrenceListItem } from './CargoOccurrenceListItem.component'

type CargoOccurrenceListProps = Readonly<{ documents: readonly DocumentReference[] }>

/**
 * As avarias de recebimento da chegada. A tratativa em si (decidir, pedir ao contratante) segue no fluxo dela:
 * esta lista só mostra a situação — a ocorrência sem viagem ainda não aparece na fila de ocorrências.
 */
export function CargoOccurrenceList({ documents }: CargoOccurrenceListProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const { occurrences } = useCargoOccurrence()
  if (occurrences.length === 0) return null
  const numberOf = new Map(documents.map((document) => [document.id, document.number]))

  return (
    <section className={officeStyles.occurrenceSection} data-occurrences="">
      <h2>{t('occurrence.list.title')}</h2>
      <ul className={officeStyles.occurrenceList}>
        {occurrences.map((occurrence) => (
          <CargoOccurrenceListItem
            key={occurrence.id}
            noteNumber={numberOf.get(occurrence.nfeDocumentId)}
            occurrence={occurrence}
          />
        ))}
      </ul>
    </section>
  )
}
