/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { OccurrenceBulkSelection } from '../hooks/useOccurrenceBulkSelection.hook'
import { useBulkResolveOccurrences } from '../queries/useBulkResolveOccurrences.query'
import { OCCURRENCE_BULK_RESOLUTION_LIMIT } from '../shared/occurrenceBulkResolution.service'
import styles from '../styles/trip.module.css'

/**
 * Barra de ação em lote (data-tables.md §1): só existe com ocorrência marcada. A observação é uma só e segue o
 * formulário de "Resolver com observação" de uma ocorrência (`OccurrenceResolutionPanel`).
 */
export function TripOccurrenceBulkBar({
  selection,
}: Readonly<{ selection: OccurrenceBulkSelection }>) {
  const { t } = useTranslation('trip')
  const mutation = useBulkResolveOccurrences()
  const [isComposing, setIsComposing] = useState(false)
  const [note, setNote] = useState('')
  const outcome = mutation.data ?? null
  const bulk = {
    ...selection,
    isComposing,
    isPending: mutation.isPending,
    note,
    setIsComposing,
    setNote,
    clear: (): void => {
      selection.clear()
      setIsComposing(false)
      setNote('')
    },
    confirm: (): void => {
      if (note.trim().length === 0 || selection.selectedCount === 0 || selection.isOverLimit) return
      mutation.mutate(
        { items: selection.selected, note },
        {
          /** O que falhou continua marcado, para tentar de novo com a mesma observação. */
          onSuccess: (result) => {
            if (result.failed === 0) {
              selection.clear()
              setIsComposing(false)
              setNote('')
            }
          },
        },
      )
    },
  }

  const feedback =
    outcome === null ? null : (
      <p className={styles.hint} role={outcome.failed > 0 ? 'alert' : 'status'}>
        {t('occurrenceBulk.outcome', {
          alreadyResolved: outcome.alreadyResolved,
          failed: outcome.failed,
          resolved: outcome.resolved,
        })}
      </p>
    )

  if (bulk.selectedCount === 0) return feedback

  return (
    <div className={styles.occurrenceBulkBar} role="region" aria-label={t('occurrenceBulk.region')}>
      <div className={styles.occurrenceBulkHead}>
        <strong>{t('occurrenceBulk.selected', { count: bulk.selectedCount })}</strong>
        {bulk.isComposing ? null : (
          <div className={styles.occurrenceFormActions}>
            <Button onClick={() => bulk.setIsComposing(true)} size="sm" type="button">
              <Icon name="check" />
              {t('occurrenceBulk.action')}
            </Button>
            <Button onClick={bulk.clear} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('occurrenceBulk.clear')}
            </Button>
          </div>
        )}
      </div>
      {bulk.isOverLimit ? (
        <p className={styles.hint} role="alert">
          {t('occurrenceBulk.overLimit', { limit: OCCURRENCE_BULK_RESOLUTION_LIMIT })}
        </p>
      ) : null}
      {bulk.isComposing ? (
        <div className={styles.occurrenceForm}>
          <label>
            {t('occurrenceBulk.noteLabel')}
            <textarea
              aria-label={t('occurrenceBulk.noteLabel')}
              maxLength={2000}
              onChange={(event) => bulk.setNote(event.target.value)}
              value={bulk.note}
            />
          </label>
          <p className={styles.hint}>
            {t('occurrenceBulk.noteHelp', { count: bulk.selectedCount })}
          </p>
          <div className={styles.occurrenceFormActions}>
            <Button
              disabled={bulk.note.trim().length === 0 || bulk.isPending || bulk.isOverLimit}
              onClick={bulk.confirm}
              size="sm"
              type="button"
            >
              <Icon name={bulk.isPending ? 'spinner' : 'check'} />
              {t('occurrenceBulk.confirm', { count: bulk.selectedCount })}
            </Button>
            <Button
              disabled={bulk.isPending}
              onClick={() => bulk.setIsComposing(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
              {t('occurrenceResolution.dismiss')}
            </Button>
          </div>
        </div>
      ) : null}
      {feedback}
    </div>
  )
}
