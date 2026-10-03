/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { TouchFailure } from '../mutations/useSeparationTouch.mutation'
import type { CargoArrivalDocument } from '../shared/cargoArrival.types'
import { resolveNextTouchTarget } from '../shared/cargoSeparationTouch.service'
import styles from '../styles/cargoSeparation.module.css'
import rowStyles from '../styles/cargoSeparationRow.module.css'

type SeparationDocumentRowProps = Readonly<{
  canAct: boolean
  document: CargoArrivalDocument
  failure: TouchFailure | undefined
  isPending: boolean
  onRetry: (failure: TouchFailure) => void
  onTouch: (document: CargoArrivalDocument) => void
  refusalReason: string | undefined
}>

function StepButton(
  props: Readonly<{
    document: CargoArrivalDocument
    isPending: boolean
    onTouch: (document: CargoArrivalDocument) => void
  }>,
): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const { document } = props
  const step = t(`separation.step.${document.separationState}`)
  const label = t('separation.stepLabel', { number: document.number, step })

  if (resolveNextTouchTarget(document.separationState) === undefined) {
    return (
      <button aria-label={label} className={rowStyles.stepDone} disabled type="button">
        <Icon name="check" />
        {step}
      </button>
    )
  }
  return (
    <Button
      aria-label={label}
      className={rowStyles.stepButton}
      disabled={props.isPending}
      onClick={() => props.onTouch(document)}
      type="button"
    >
      {step}
    </Button>
  )
}

/**
 * Uma nota na doca: o botão grande mostra o PRÓXIMO passo em texto — nunca só cor — e avança a nota com um
 * toque. O que falhou fica na linha com "tentar de novo", e o que o servidor recusou diz o motivo.
 */
export function SeparationDocumentRow({
  canAct,
  document,
  failure,
  isPending,
  onRetry,
  onTouch,
  refusalReason,
}: SeparationDocumentRowProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const failureCode = failure?.code
  const failureReason =
    failureCode === undefined
      ? ''
      : t([`errors.${failureCode}`, 'errors.unknown'], { code: failureCode })

  return (
    <li className={rowStyles.documentRow} data-document-id={document.nfeDocumentId}>
      <div className={rowStyles.documentInfo}>
        <div className={rowStyles.documentHead}>
          <span className={rowStyles.documentNumber}>
            {t('document.number', { number: document.number })}
          </span>
          {canAct ? null : (
            <span className={styles.badge}>{t(`state.${document.separationState}`)}</span>
          )}
        </div>
        <span className={rowStyles.recipient}>
          {document.recipientName ?? t('document.unknownRecipient')}
        </span>
      </div>
      {canAct ? <StepButton document={document} isPending={isPending} onTouch={onTouch} /> : null}
      {failure === undefined ? null : (
        <div className={rowStyles.failure} role="alert">
          <span>{t('separation.failure', { reason: failureReason })}</span>
          <Button
            aria-label={t('separation.retryLabel', { number: document.number })}
            className={rowStyles.retryButton}
            onClick={() => onRetry(failure)}
            type="button"
            variant="secondary"
          >
            <Icon name="refresh" />
            {t('separation.retry')}
          </Button>
        </div>
      )}
      {refusalReason === undefined ? null : (
        <p className={rowStyles.refusedNote}>
          {t('separation.refused', {
            reason: t(`refusal.reasons.${refusalReason}`, { defaultValue: refusalReason }),
          })}
        </p>
      )}
    </li>
  )
}
