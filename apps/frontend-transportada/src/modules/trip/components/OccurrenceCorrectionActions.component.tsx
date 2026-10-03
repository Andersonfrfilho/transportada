/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { resolveOccurrenceCorrectionActions } from '../shared/tripOccurrenceDetail.service'
import type { TripOccurrenceDetail } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'
import { TripOccurrenceCancelDialog } from './TripOccurrenceCancelDialog.component'
import { TripOccurrenceCorrectionForm } from './TripOccurrenceCorrectionForm.component'

export type OccurrenceCorrectionActionsProps = Readonly<{
  occurrence: TripOccurrenceDetail
  permissions: readonly string[]
}>

/**
 * Spec 235 T2.1: Corrigir mora aqui, autocontido. Desabilitado, o botão fica no foco com
 * `aria-disabled` e o motivo ligado por `aria-describedby` — `disabled` tiraria o botão da ordem de
 * tabulação e o leitor de tela não leria o porquê.
 */
export function OccurrenceCorrectionActions({
  occurrence,
  permissions,
}: OccurrenceCorrectionActionsProps) {
  const { t } = useTranslation('trip')
  const reasonId = useId()
  const [isCorrecting, setIsCorrecting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const { cancel, correct } = resolveOccurrenceCorrectionActions(
    {
      caseView: occurrence.case,
      hasItems: occurrence.source === 'document' && occurrence.items.length > 0,
      isCancelled: occurrence.cancellation != null,
      permissions,
    },
    t as Translate,
  )
  const tripDocumentId = occurrence.document?.tripDocumentId ?? null
  if (occurrence.source !== 'document' || tripDocumentId === null) return null
  const reason = [correct, cancel].find((state) => state.availability === 'disabled')
  const hasCorrect = correct.availability !== 'hidden'
  const hasCancel = cancel.availability !== 'hidden'
  if (!hasCorrect && !hasCancel) return null

  const isDisabled = reason !== undefined

  function handleCorrectClick(): void {
    if (isDisabled) return
    setIsCorrecting(true)
  }

  function handleCancelClick(): void {
    if (isDisabled) return
    setIsCancelling(true)
  }

  function handleCancelClose(): void {
    setIsCancelling(false)
  }

  function handleCorrectionClose(): void {
    setIsCorrecting(false)
  }

  return (
    <div className={styles.occurrenceCorrection}>
      <div className={styles.occurrenceActions}>
        {hasCorrect ? (
          <Button
            aria-describedby={isDisabled ? reasonId : undefined}
            aria-disabled={isDisabled}
            aria-expanded={isCorrecting}
            onClick={handleCorrectClick}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="edit" />
            {t('occurrenceDetail.correction.correct')}
          </Button>
        ) : null}
        {hasCancel ? (
          <Button
            aria-describedby={isDisabled ? reasonId : undefined}
            aria-disabled={isDisabled}
            aria-haspopup="dialog"
            onClick={handleCancelClick}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="close" />
            {t('occurrenceDetail.correction.cancel.button')}
          </Button>
        ) : null}
      </div>
      {reason?.availability === 'disabled' ? (
        <p className={styles.hint} id={reasonId}>
          {reason.reason}
        </p>
      ) : null}
      {isCancelling ? (
        <TripOccurrenceCancelDialog
          documentId={tripDocumentId}
          occurrenceId={occurrence.id}
          onClose={handleCancelClose}
          tripId={occurrence.tripId}
        />
      ) : null}
      {isCorrecting ? (
        <TripOccurrenceCorrectionForm
          documentId={tripDocumentId}
          items={occurrence.items}
          occurrenceId={occurrence.id}
          onClose={handleCorrectionClose}
          tripId={occurrence.tripId}
        />
      ) : null}
    </div>
  )
}
