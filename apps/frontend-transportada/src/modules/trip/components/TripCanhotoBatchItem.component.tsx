/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.6: um canhoto do maço — a foto, o nome da nota, a leitura automática e a caixa de
 * marcação. A foto é o que a pessoa confere; a leitura é só o que a máquina achou dela.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

import { isDeliveryProofAwaitingProcessing } from '../shared/deliveryProof.service'
import { isCanhotoFlagged } from '../shared/canhotoMismatchPresentation.service'
import type { CanhotoBatchItem } from '../shared/canhotoBatchSelection.service'
import type { ProofImageOutcome } from './ProofImage.component'
import { ProofImage } from './ProofImage.component'
import { ProofProcessingNote } from './ProofProcessingNote.component'
import { ProofReview } from './ProofReview.component'
import styles from '../styles/trip.module.css'

export type TripCanhotoBatchItemActions = Readonly<{
  /** Spec 344 D8.2: a prova sinalizada só é aprovada por clique próprio, na própria prova. */
  onApproveFlagged: (documentId: string) => void
  onCheckedChange: (documentId: string, isChecked: boolean) => void
  onImageSettled: (documentId: string, outcome: ProofImageOutcome) => void
  onOpenImage: (proofId: string) => void
}>

type TripCanhotoBatchItemProps = Readonly<{
  actions: TripCanhotoBatchItemActions
  hasImageFailed: boolean
  isChecked: boolean
  /** A nota que é dona da única parada de Tab da grade (spec 222 T8.1). */
  isFocusTarget: boolean
  /** Aprovação individual em curso: segura o botão enquanto a anterior não termina. */
  isBusy: boolean
  /** A foto já carregou: a tela não aprova o que não mostrou. */
  isImageLoaded: boolean
  item: CanhotoBatchItem
}>

export function TripCanhotoBatchItem({
  actions,
  hasImageFailed,
  isChecked,
  isBusy,
  isFocusTarget,
  isImageLoaded,
  item,
}: TripCanhotoBatchItemProps) {
  const { t } = useTranslation('trip')
  const { documentId, label, proof } = item
  /** RF11: o original aparece, mas a conferência espera a foto ficar pronta. */
  const isAwaiting = isDeliveryProofAwaitingProcessing(proof)
  const isFlagged = isCanhotoFlagged(proof)

  return (
    <li
      className={cn(styles.canhotoBatchItem, hasImageFailed && styles.canhotoBatchItemFailed)}
      data-document-id={documentId}
    >
      <ProofImage
        alt={t('deliveryProof.photoAlt')}
        isEager
        label={label}
        onOpen={actions.onOpenImage}
        onSettled={(outcome) => actions.onImageSettled(documentId, outcome)}
        proof={proof}
        tabIndex={-1}
        variant="main"
      />
      <ProofProcessingNote proof={proof} />
      {isAwaiting ? (
        <p className={styles.hint}>{t('deliveryProof.processing.waitingReview')}</p>
      ) : null}
      <ProofReview proof={proof} />
      {hasImageFailed ? (
        <p className={styles.alert} role="alert">
          {t('deliveryProof.canhotoBatch.imageFailed')}
        </p>
      ) : null}
      {isFlagged ? (
        <>
          <p className={styles.hint}>{t('deliveryProof.canhotoBatch.flaggedHint')}</p>
          <Button
            data-flagged-approve=""
            disabled={hasImageFailed || isAwaiting || !isImageLoaded || isBusy}
            onClick={() => actions.onApproveFlagged(documentId)}
            size="sm"
            tabIndex={isFocusTarget ? 0 : -1}
            type="button"
            variant="secondary"
          >
            <Icon name="check" />
            {t('deliveryProof.canhotoReview.approveAnyway')}
          </Button>
        </>
      ) : (
        <Checkbox
          ariaLabel={t('deliveryProof.canhotoBatch.selectItem', { label })}
          checked={isChecked}
          disabled={hasImageFailed || isAwaiting}
          label={t('deliveryProof.canhotoBatch.noteLabel', { label })}
          onChange={(checked) => actions.onCheckedChange(documentId, checked)}
          tabIndex={isFocusTarget ? 0 : -1}
        />
      )}
    </li>
  )
}
