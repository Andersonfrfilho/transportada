/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { tripDocumentLabel } from '../shared/tripDocument.service'
import { toTripDocumentLabelSource } from '../shared/fieldDeliveryDocument.service'
import type {
  FieldDeliveryDraft,
  FieldDeliveryWizardDocument,
} from '../shared/fieldDeliveryWizard.service'
import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliveryFinishedStepProps = Readonly<{
  documents: readonly FieldDeliveryWizardDocument[]
  drafts: readonly FieldDeliveryDraft[]
  onSubmit: (drafts: readonly FieldDeliveryDraft[]) => void
}>

/**
 * Spec 156 D5 (aceite 5): "no fim, uma confirmação envia cada nota com o próprio comprovante" —
 * a lista mostra o que foi fotografado e o que foi pulado antes desse último toque. O envio em si
 * é da T12; aqui `onSubmit` só entrega os rascunhos prontos para quem hospeda o assistente.
 */
export function FieldDeliveryFinishedStep({
  documents,
  drafts,
  onSubmit,
}: FieldDeliveryFinishedStepProps) {
  const { t } = useTranslation('trip')
  const draftedDocumentIds = new Set(drafts.map((draft) => draft.documentId))

  return (
    <>
      <ul className={styles.finishedList}>
        {documents.map((document) => (
          <li className={styles.finishedListItem} key={document.documentId}>
            <span>{tripDocumentLabel(toTripDocumentLabelSource(document))}</span>
            <span>
              {draftedDocumentIds.has(document.documentId)
                ? t('fieldDelivery.finishedCaptured')
                : t('fieldDelivery.finishedSkipped')}
            </span>
          </li>
        ))}
      </ul>
      <Button onClick={() => onSubmit(drafts)} type="button">
        <Icon name="check" />
        {t('fieldDelivery.finishedSubmit', { count: drafts.length })}
      </Button>
    </>
  )
}
