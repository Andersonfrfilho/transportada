/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useCargoCaseItem } from '../hooks/useCargoCaseItem.hook'
import { useCargoOccurrence } from '../hooks/useCargoOccurrence.hook'
import { resolveCargoCaseActions } from '../shared/cargoOccurrenceCase.service'
import type { CargoOccurrenceView } from '../shared/cargoOccurrence.types'
import styles from '../styles/cargoOccurrenceCase.module.css'
import occurrenceStyles from '../styles/cargoOccurrence.module.css'
import { CargoCaseActionButtons } from './CargoCaseActionButtons.component'
import { CargoCaseFailure } from './CargoCaseFailure.component'
import { CargoCasePanel } from './CargoCasePanel.component'
import { CargoCaseSettlementForm } from './CargoCaseSettlementForm.component'

type CargoOccurrenceCaseActionsProps = Readonly<{
  noteNumber: string | undefined
  occurrence: CargoOccurrenceView
}>

/**
 * Conduz a tratativa de UMA avaria de recebimento (`occurrences.resolve`): só os botões que o estado permite,
 * confirmação onde a ação não se desfaz, motivo obrigatório onde a API o exige, o acerto antes de encerrar uma
 * decisão `goods_paid`, e o motivo de cada recusa. Sem a permissão, ou sem tratativa, não renderiza nada.
 */
export function CargoOccurrenceCaseActions({
  noteNumber,
  occurrence,
}: CargoOccurrenceCaseActionsProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const { arrival, canResolve } = useCargoOccurrence()
  const item = useCargoCaseItem({ arrivalId: arrival.id, occurrenceId: occurrence.id })
  const status = occurrence.case?.status ?? null
  const actions = resolveCargoCaseActions({ canResolve, status })
  const hasActions = Object.values(actions).some((value) => value === true)
  const isSettlementShown = canResolve && status === 'decided' && item.isSettlementRequired
  const panel =
    item.panel !== undefined && isPanelOffered(item.panel, actions) ? item.panel : undefined

  if (!hasActions && !isSettlementShown && item.errorCode === undefined) return null

  return (
    <div className={styles.caseActions} data-case-actions="">
      <CargoCaseActionButtons
        actions={actions}
        isBlocked={item.isSettlementDirty}
        isPending={item.isPending}
        noteNumber={noteNumber}
        onOpenPanel={item.openPanel}
        onReview={() => void item.run({ action: 'review' })}
        typeName={occurrence.typeName}
      />
      {actions.canClose && item.isSettlementDirty ? (
        <p className={occurrenceStyles.noteHint}>
          {t('occurrence.caseActions.closeBlockedByDraft')}
        </p>
      ) : null}
      {panel === undefined ? null : (
        <CargoCasePanel
          decisionKinds={actions.decisionKinds}
          isPending={item.isPending}
          key={panel}
          kind={panel}
          onCancel={item.closePanel}
          onConfirm={(change) => void item.run(change)}
        />
      )}
      {isSettlementShown ? (
        <CargoCaseSettlementForm occurrence={occurrence} onDirtyChange={item.setSettlementDirty} />
      ) : null}
      {item.errorCode === undefined ? null : <CargoCaseFailure code={item.errorCode} />}
    </div>
  )
}

function isPanelOffered(
  panel: NonNullable<ReturnType<typeof useCargoCaseItem>['panel']>,
  actions: ReturnType<typeof resolveCargoCaseActions>,
): boolean {
  const offered = {
    cancel: actions.canCancel,
    close: actions.canClose,
    decide: actions.canDecide,
    submit: actions.canSubmit,
    'warehouse-return': actions.canReturnToWarehouse,
  } as const
  return offered[panel]
}
