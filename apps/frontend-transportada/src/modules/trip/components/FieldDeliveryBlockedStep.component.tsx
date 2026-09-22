/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { FieldDeliveryWizardState } from '../shared/fieldDeliveryWizard.service'
import type { FieldDeliveryWizardDocument } from '../shared/fieldDeliveryWizard.service'
import { FIELD_DELIVERY_FOCUS_ATTRIBUTE } from '../shared/fieldDeliveryWizardFocus.service'
import { FieldDeliveryNoteBanner } from './FieldDeliveryNoteBanner.component'
import styles from '../styles/fieldDeliveryWizard.module.css'

type BlockedStep = Extract<FieldDeliveryWizardState['step'], { kind: 'blocked' }>

export type FieldDeliveryBlockedStepProps = Readonly<{
  document: FieldDeliveryWizardDocument
  onRetake: () => void
  onSkip: () => void
  step: BlockedStep
  stepIndex: number
  totalSteps: number
}>

/**
 * Spec 156 D6 (aceite 6): o canhoto não é de nota do lote — a foto não vale. T16: a faixa mostra a
 * nota esperada neste passo, e "Pular nota" existe aqui também, para quem está com o canhoto errado
 * na mão e não vai achar o certo agora.
 */
export function FieldDeliveryBlockedStep({
  document,
  onRetake,
  onSkip,
  step,
  stepIndex,
  totalSteps,
}: FieldDeliveryBlockedStepProps) {
  const { t } = useTranslation('trip')
  const { identification } = step
  const message =
    identification.status === 'notOnTrip'
      ? t('fieldDelivery.blockedNotOnTrip', { document: identification.documentLabel })
      : t('fieldDelivery.blockedOnTripNotSelected')

  return (
    <>
      <FieldDeliveryNoteBanner
        document={document}
        isStatic
        stepIndex={stepIndex}
        totalSteps={totalSteps}
      />
      <p className={styles.notice} role="alert">
        {message}
      </p>
      <div className={styles.stepActions}>
        <Button onClick={onSkip} type="button" variant="ghost">
          <Icon name="chevron-right" />
          {t('fieldDelivery.skip')}
        </Button>
        <Button onClick={onRetake} type="button" {...{ [FIELD_DELIVERY_FOCUS_ATTRIBUTE]: '' }}>
          <Icon name="camera" />
          {t('fieldDelivery.retake')}
        </Button>
      </div>
    </>
  )
}
