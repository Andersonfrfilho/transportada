/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'

import { useOccurrenceCaseActions } from '../hooks/useOccurrenceCaseActions.hook'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import {
  TRIP_OCCURRENCE_CASE_DECISION_KINDS,
  type TripOccurrenceCaseDecisionKind,
  type TripOccurrenceCaseView,
} from '../shared/tripOccurrenceFeed.service'
import { OccurrenceSettlementPanel } from './OccurrenceSettlementPanel.component'
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
 * **"Decidir no lugar do contratante" (achado 1 da revisão)**: a rota interna
 * `POST /trip-occurrences/:id/case/decision` (`occurrences.resolve`, nunca `occurrences.decide` —
 * essa é do papel `contractor`) só aparece em `awaiting_contractor`. Nota é **sempre** obrigatória
 * — decidir por quem não respondeu sem dizer por quê não pode ser silencioso — e a tela avisa,
 * antes do clique, que a decisão fica registrada como da transportadora, nunca do cliente: é a
 * diferença entre "o contratante autorizou" e "nós decidimos por ele" numa trilha que sustenta
 * cobrança. Reentrega fica fora das opções quando `redeliveryPolicy` é `blocked` — evita o 422 que
 * a API já recusaria; decisão divergente sobre tratativa já `decided` volta `409` e aparece como
 * aviso, nunca erro de sistema.
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
  const [isDeciding, setIsDeciding] = useState(false)
  const [decisionKind, setDecisionKind] = useState<TripOccurrenceCaseDecisionKind>(
    TRIP_OCCURRENCE_CASE_DECISION_KINDS[0],
  )
  const [decisionNote, setDecisionNote] = useState('')
  /** Encerrar antes de salvar o acerto perde o que foi digitado — o painel de baixo avisa daqui. */
  const [hasUnsavedSettlement, setHasUnsavedSettlement] = useState(false)

  if (occurrenceCase === null) {
    return <p className={styles.hint}>{t('occurrenceCase.none')}</p>
  }

  const { redeliveryPolicy, status } = occurrenceCase
  /**
   * A política de reentrega só diz algo enquanto a tratativa está viva. Em tratativa cancelada ou
   * retornada ao barracão, "Admite reentrega" é ruído que se lê como autorização.
   */
  const isCaseOpen =
    status === 'recorded' ||
    status === 'under_review' ||
    status === 'awaiting_contractor' ||
    status === 'decided'
  const isBusy =
    actions.review.isPending ||
    actions.returnToWarehouse.isPending ||
    actions.submitToContractor.isPending ||
    actions.close.isPending ||
    actions.cancel.isPending ||
    actions.decide.isPending

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

  const decisionOptions = TRIP_OCCURRENCE_CASE_DECISION_KINDS.filter(
    (kind) => kind !== 'redelivery_authorized' || redeliveryPolicy === 'allowed',
  )

  function startDecision(): void {
    setIsDeciding(true)
    setDecisionKind(decisionOptions[0] ?? TRIP_OCCURRENCE_CASE_DECISION_KINDS[0])
    setDecisionNote('')
  }

  function cancelDecision(): void {
    setIsDeciding(false)
    setDecisionNote('')
  }

  function submitDecision(): void {
    if (decisionNote.trim().length === 0) return
    actions.decide.mutate(
      { kind: decisionKind, note: decisionNote, occurrenceId },
      { onSuccess: cancelDecision },
    )
  }

  const canReview = canResolve && status === 'recorded'
  const canWarehouseReturn = canResolve && status === 'under_review'
  const canSubmitToContractor = canResolve && status === 'under_review'
  const canCancel = canResolve && (status === 'recorded' || status === 'under_review')
  const canClose = canResolve && status === 'decided'
  const canDecideOnBehalf = canResolve && status === 'awaiting_contractor'
  const decisionFeedbackKey = resolveTripFeedbackKey(actions.decide.error)

  return (
    <div className={styles.occurrenceStage}>
      <p className={styles.hint}>
        {t('occurrenceCase.statusLabel')}:{' '}
        <strong>{t(`occurrenceFeed.caseStatus.${status}`)}</strong>
      </p>
      {isCaseOpen ? (
        <p className={styles.hint}>
          {t('occurrenceCase.redeliveryPolicyLabel')}:{' '}
          {t(`occurrenceCase.redeliveryPolicy.${occurrenceCase.redeliveryPolicy}`)}
        </p>
      ) : null}

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

      {isDeciding ? (
        <div className={styles.occurrenceForm}>
          <p className={styles.hint} role="alert">
            {t('occurrenceCase.decisionWarning')}
          </p>
          <label>
            {t('occurrenceCase.decisionKindLabel')}
            <Select
              ariaLabel={t('occurrenceCase.decisionKindLabel')}
              onChange={(value) => setDecisionKind(value as TripOccurrenceCaseDecisionKind)}
              options={decisionOptions.map((kind) => ({
                label: t(`occurrenceCase.decisionOption.${kind}`),
                value: kind,
              }))}
              value={decisionKind}
            />
          </label>
          {redeliveryPolicy === 'blocked' ? (
            <p className={styles.hint}>{t('occurrenceCase.decisionRedeliveryBlocked')}</p>
          ) : null}
          <label>
            {t('occurrenceCase.decisionNoteLabel')}
            <textarea
              aria-label={t('occurrenceCase.decisionNoteLabel')}
              onChange={(event) => setDecisionNote(event.target.value)}
              value={decisionNote}
            />
          </label>
          {decisionFeedbackKey !== null ? (
            <p className={styles.hint} role="alert">
              {t(`feedback.${decisionFeedbackKey}`)}
            </p>
          ) : null}
          <div className={styles.occurrenceFormActions}>
            <Button
              disabled={decisionNote.trim().length === 0 || isBusy}
              onClick={submitDecision}
              size="sm"
              type="button"
            >
              <Icon name="shield" />
              {t('occurrenceCase.confirm')}
            </Button>
            <Button onClick={cancelDecision} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('occurrenceCase.dismiss')}
            </Button>
          </div>
        </div>
      ) : null}

      {canDecideOnBehalf && !isDeciding ? (
        <div className={styles.occurrenceFormActions}>
          <Button disabled={isBusy} onClick={startDecision} size="sm" type="button">
            <Icon name="shield" />
            {t('occurrenceCase.action.decide')}
          </Button>
        </div>
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
            /*
             * "Encerrar tratativa" aparece antes de "Salvar acerto" e convidava a encerrar com
             * rascunho por gravar. Ele espera o acerto estar salvo, e diz por que está esperando.
             */
            <Tooltip label={hasUnsavedSettlement ? t('occurrenceCase.closeBlockedByDraft') : ''}>
              <Button
                disabled={isBusy || hasUnsavedSettlement}
                onClick={() => actions.close.mutate({ occurrenceId })}
                size="sm"
                type="button"
              >
                <Icon name="check" />
                {t('occurrenceCase.action.close')}
              </Button>
            </Tooltip>
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

      {status === 'decided' && occurrenceCase.decision?.kind === 'goods_paid' ? (
        <OccurrenceSettlementPanel
          canResolve={canResolve}
          onDraftDirtyChange={setHasUnsavedSettlement}
          occurrenceId={occurrenceId}
        />
      ) : null}
    </div>
  )
}
