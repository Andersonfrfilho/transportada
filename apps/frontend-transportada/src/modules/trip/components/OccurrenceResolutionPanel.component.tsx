/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useResolveOccurrence } from '../queries/useResolveOccurrence.query'
import {
  resolveOccurrenceResolutionFeedback,
  type OccurrenceResolutionKind,
  type OccurrenceResolutionViewState,
} from '../shared/occurrenceResolution.service'
import styles from '../styles/trip.module.css'

export type OccurrenceResolutionPanelProps = Readonly<{
  canResolve: boolean
  occurrenceId: string
  occurrenceKind: OccurrenceResolutionKind
  /** Ausente enquanto o feed não entrega o andamento: o painel mostra só a ação. */
  state?: OccurrenceResolutionViewState
}>

/**
 * Spec 266 RF7: o escritório resolve a ocorrência (nota ou parada) com uma observação que o motorista
 * lê. Resolvida ou cancelada não oferece a ação — o servidor recusaria com 409.
 */
export function OccurrenceResolutionPanel({
  canResolve,
  occurrenceId,
  occurrenceKind,
  state,
}: OccurrenceResolutionPanelProps) {
  const { t } = useTranslation('trip')
  const resolve = useResolveOccurrence()
  const [isComposing, setIsComposing] = useState(false)
  const [note, setNote] = useState('')

  const canOfferAction = canResolve && state !== 'resolved' && state !== 'cancelled'
  const feedback = resolve.isError ? resolveOccurrenceResolutionFeedback(resolve.error) : null

  function handleCancel(): void {
    setIsComposing(false)
    setNote('')
  }

  function handleSubmit(): void {
    if (note.trim().length === 0) return
    resolve.mutate({ kind: occurrenceKind, note, occurrenceId }, { onSuccess: handleCancel })
  }

  return (
    <div className={styles.occurrenceStage}>
      {state === undefined ? null : (
        <p className={styles.hint}>
          {t('occurrenceResolution.stateLabel')}:{' '}
          <strong>{t(`occurrenceResolution.state.${state}`)}</strong>
        </p>
      )}
      {feedback === null ? null : (
        <p className={styles.hint} role={feedback.isInformational ? 'status' : 'alert'}>
          {t(`occurrenceResolution.feedback.${feedback.key}`)}
        </p>
      )}
      {!canOfferAction ? null : isComposing ? (
        <div className={styles.occurrenceForm}>
          <label>
            {t('occurrenceResolution.noteLabel')}
            <textarea
              aria-label={t('occurrenceResolution.noteLabel')}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </label>
          <p className={styles.hint}>{t('occurrenceResolution.noteHelp')}</p>
          <div className={styles.occurrenceFormActions}>
            <Button
              disabled={note.trim().length === 0 || resolve.isPending}
              onClick={handleSubmit}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {t('occurrenceResolution.confirm')}
            </Button>
            <Button onClick={handleCancel} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('occurrenceResolution.dismiss')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.occurrenceFormActions}>
          <Button onClick={() => setIsComposing(true)} size="sm" type="button">
            <Icon name="check" />
            {t('occurrenceResolution.action')}
          </Button>
        </div>
      )}
    </div>
  )
}
