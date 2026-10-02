/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.6: um canhoto do maço — a foto, o nome da nota, a leitura automática e a caixa de
 * marcação. A foto é o que a pessoa confere; a leitura é só o que a máquina achou dela.
 */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

import type { CanhotoBatchItem } from '../shared/canhotoBatchSelection.service'
import type { ProofImageOutcome } from './ProofImage.component'
import { ProofImage } from './ProofImage.component'
import { ProofReview } from './ProofReview.component'
import styles from '../styles/trip.module.css'

export type TripCanhotoBatchItemActions = Readonly<{
  onCheckedChange: (documentId: string, isChecked: boolean) => void
  onImageSettled: (documentId: string, outcome: ProofImageOutcome) => void
  onOpenImage: (proofId: string) => void
}>

type TripCanhotoBatchItemProps = Readonly<{
  actions: TripCanhotoBatchItemActions
  hasImageFailed: boolean
  isChecked: boolean
  item: CanhotoBatchItem
}>

export function TripCanhotoBatchItem({
  actions,
  hasImageFailed,
  isChecked,
  item,
}: TripCanhotoBatchItemProps) {
  const { t } = useTranslation('trip')
  const { documentId, label, proof } = item

  return (
    <li className={cn(styles.canhotoBatchItem, hasImageFailed && styles.canhotoBatchItemFailed)}>
      <ProofImage
        alt={t('deliveryProof.photoAlt')}
        isEager
        label={label}
        onOpen={actions.onOpenImage}
        onSettled={(outcome) => actions.onImageSettled(documentId, outcome)}
        proof={proof}
        variant="main"
      />
      <ProofReview proof={proof} />
      {hasImageFailed ? (
        <p className={styles.alert} role="alert">
          {t('deliveryProof.canhotoBatch.imageFailed')}
        </p>
      ) : null}
      <Checkbox
        ariaLabel={t('deliveryProof.canhotoBatch.selectItem', { label })}
        checked={isChecked}
        disabled={hasImageFailed}
        label={t('deliveryProof.canhotoBatch.noteLabel', { label })}
        onChange={(checked) => actions.onCheckedChange(documentId, checked)}
      />
    </li>
  )
}
