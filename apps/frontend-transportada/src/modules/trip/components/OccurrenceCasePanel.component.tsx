/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { useOccurrenceCaseActions } from '../hooks/useOccurrenceCaseActions.hook'
import type { TripOccurrenceCaseView } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

export type OccurrenceCasePanelProps = Readonly<{
  canResolve: boolean
  occurrenceCase: null | TripOccurrenceCaseView
  occurrenceId: string
}>

type NoteAction = 'cancel' | 'warehouse-return'

const momentFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : momentFormatter.format(moment)
}

/**
 * Spec 164 T22 (RF33): passo atual, histórico curto (decisão, se houver) e **só os botões que o
 * estado e a permissão permitem**. `occurrenceCase: null` é o registro de hoje — tipo `unset` ou
 * ocorrência anterior à migration (D11) — e a tela mostra "sem tratativa", nunca quebra.
 *
 * ⚠️ **"Decidir no lugar do contratante" não está aqui.** A API só expõe
 * `POST /client-occurrences/:id/decision` com a permissão `occurrences.decide`, que a D6 do
 * spec.md concede só ao papel `contractor` — "em nenhum papel de dentro". Sem rota interna para essa
 * ação, o botão ficaria aqui apenas para devolver 403; a lacuna é do backend, registrada para a
 * próxima task, não implementada aqui com um caminho que a API recusa.
 */
export function OccurrenceCasePanel({
  canResolve,
  occurrenceCase,
  occurrenceId,
}: OccurrenceCasePanelProps) {
  const { t } = useTranslation('trip')
  const actions = useOccurrenceCaseActions()
  const [pendingNoteAction, setPendingNoteAction] = useState<NoteAction | null>(null)
  const [note, setNote] = useState('')

  if (occurrenceCase === null) {
    return <p className={styles.hint}>{t('occurrenceCase.none')}</p>
  }

  const { status } = occurrenceCase
  const isBusy =
    actions.review.isPending ||
    actions.returnToWarehouse.isPending ||
    actions.submitToContractor.isPending ||
    actions.close.isPending ||
    actions.cancel.isPending

  function startNoteAction(action: NoteAction): void {
    setPendingNoteAction(action)
    setNote('')
  }

  function cancelNoteAction(): void {
    setPendingNoteAction(null)
    setNote('')
  }

  function submitNoteAction(): void {
    if (note.trim().length === 0) return
    if (pendingNoteAction === 'cancel') {
      actions.cancel.mutate({ note, occurrenceId })
    } else if (pendingNoteAction === 'warehouse-return') {
      actions.returnToWarehouse.mutate({ note, occurrenceId })
    }
    setPendingNoteAction(null)
    setNote('')
  }

  const canReview = canResolve && status === 'recorded'
  const canWarehouseReturn = canResolve && status === 'under_review'
  const canSubmitToContractor = canResolve && status === 'under_review'
  const canCancel = canResolve && (status === 'recorded' || status === 'under_review')
  const canClose = canResolve && status === 'decided'

  return (
    <div className={styles.occurrenceStage}>
      <p className={styles.hint}>
        {t('occurrenceCase.statusLabel')}:{' '}
        <strong>{t(`occurrenceFeed.caseStatus.${status}`)}</strong>
      </p>
      <p className={styles.hint}>
        {t('occurrenceCase.redeliveryPolicyLabel')}:{' '}
        {t(`occurrenceCase.redeliveryPolicy.${occurrenceCase.redeliveryPolicy}`)}
      </p>

      {occurrenceCase.decision !== null ? (
        <p className={styles.hint}>
          {t(`occurrenceCase.decisionKind.${occurrenceCase.decision.kind}`)}
          {occurrenceCase.decision.note.length > 0 ? ` — ${occurrenceCase.decision.note}` : ''}
          {occurrenceCase.decision.decidedAt !== null
            ? ` (${formatMoment(occurrenceCase.decision.decidedAt)})`
            : ''}
        </p>
      ) : null}

      {status === 'awaiting_contractor' ? (
        <p className={styles.hint} role="status">
          {t('occurrenceCase.awaitingContractor')}
        </p>
      ) : null}

      {pendingNoteAction !== null ? (
        <div className={styles.occurrenceForm}>
          <label>
            {t(`occurrenceCase.noteLabel.${pendingNoteAction}`)}
            <textarea
              aria-label={t(`occurrenceCase.noteLabel.${pendingNoteAction}`)}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </label>
          <div className={styles.occurrenceFormActions}>
            <Button
              disabled={note.trim().length === 0 || isBusy}
              onClick={submitNoteAction}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {t('occurrenceCase.confirm')}
            </Button>
            <Button onClick={cancelNoteAction} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('occurrenceCase.dismiss')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.occurrenceFormActions}>
          {canReview ? (
            <Button
              disabled={isBusy}
              onClick={() => actions.review.mutate({ occurrenceId })}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {t('occurrenceCase.action.review')}
            </Button>
          ) : null}
          {canWarehouseReturn ? (
            <Button
              disabled={isBusy}
              onClick={() => startNoteAction('warehouse-return')}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="refresh" />
              {t('occurrenceCase.action.warehouseReturn')}
            </Button>
          ) : null}
          {canSubmitToContractor ? (
            <Button
              disabled={isBusy}
              onClick={() => actions.submitToContractor.mutate({ occurrenceId })}
              size="sm"
              type="button"
            >
              <Icon name="send" />
              {t('occurrenceCase.action.submitToContractor')}
            </Button>
          ) : null}
          {canClose ? (
            <Button
              disabled={isBusy}
              onClick={() => actions.close.mutate({ occurrenceId })}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {t('occurrenceCase.action.close')}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              disabled={isBusy}
              onClick={() => startNoteAction('cancel')}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="trash" />
              {t('occurrenceCase.action.cancel')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
