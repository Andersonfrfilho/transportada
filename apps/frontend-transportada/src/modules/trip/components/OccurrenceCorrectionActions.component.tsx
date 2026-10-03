/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { resolveOccurrenceCorrectionActions } from '../shared/tripOccurrenceDetail.service'
import type { TripOccurrenceDetail } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

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
  const { correct } = resolveOccurrenceCorrectionActions(
    {
      caseView: occurrence.case,
      hasItems: occurrence.source === 'document' && occurrence.items.length > 0,
      isCancelled: occurrence.cancellation != null,
      permissions,
    },
    t as Translate,
  )
  if (correct.availability === 'hidden') return null

  const isDisabled = correct.availability === 'disabled'

  function handleCorrectClick(): void {
    if (isDisabled) return
    setIsCorrecting(true)
  }

  return (
    <div className={styles.occurrenceCorrection}>
      <div className={styles.occurrenceActions}>
        <Button
          aria-describedby={correct.availability === 'disabled' ? reasonId : undefined}
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
      </div>
      {correct.availability === 'disabled' ? (
        <p className={styles.hint} id={reasonId}>
          {correct.reason}
        </p>
      ) : null}
    </div>
  )
}
