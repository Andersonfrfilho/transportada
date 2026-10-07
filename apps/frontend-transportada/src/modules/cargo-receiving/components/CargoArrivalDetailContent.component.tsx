/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoArrivalDetailController } from '../hooks/useCargoArrivalDetail.hook'
import type { CargoArrivalDetail } from '../shared/cargoArrival.types'
import { resolveGroupKey } from '../shared/cargoArrivalGroups.service'
import styles from '../styles/cargoReceiving.module.css'
import detailStyles from '../styles/cargoDetail.module.css'
import { CargoActionFailure } from './CargoActionFailure.component'
import { CargoArrivalDetailHeader } from './CargoArrivalDetailHeader.component'
import { CargoBatchOutcomePanel } from './CargoBatchOutcomePanel.component'
import { CargoCloseSection } from './CargoCloseSection.component'
import { CargoDetailActions } from './CargoDetailActions.component'
import { CargoOccurrenceList } from './CargoOccurrenceList.component'
import { CargoOccurrenceNotices } from './CargoOccurrenceNotices.component'
import { CargoOccurrenceProvider } from './CargoOccurrenceProvider.component'
import { CargoGroupTable } from './CargoGroupTable.component'

type CargoArrivalDetailContentProps = Readonly<{
  arrival: CargoArrivalDetail
  canManage: boolean
  canResolve: boolean
  detail: CargoArrivalDetailController
}>

/** A chegada já carregada: cabeçalho, ações sobre a seleção, resultado do lote, grupos e fechamento. */
export function CargoArrivalDetailContent({
  arrival,
  canManage,
  canResolve,
  detail,
}: CargoArrivalDetailContentProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const panelRef = useRef<HTMLElement>(null)
  const isClosed = arrival.status === 'closed'
  const canAct = canManage && !isClosed
  const { selection } = detail

  return (
    <CargoOccurrenceProvider arrival={arrival} canManage={canManage} canResolve={canResolve}>
      <main className={styles.shell} ref={panelRef}>
        <CargoArrivalDetailHeader
          arrival={arrival}
          onOpenList={detail.openList}
          onOpenSeparation={detail.openSeparation}
        />
        {isClosed ? <p className={styles.notice}>{t('detail.closedNotice')}</p> : null}
        <CargoOccurrenceNotices />
        {canAct && selection.selected.size > 0 ? (
          <CargoDetailActions
            isWorking={detail.isWorking}
            onAssignRoute={detail.assignRoute}
            onClearSelection={selection.clear}
            onSetStatus={detail.setStatus}
            selectedCount={selection.selected.size}
          />
        ) : null}
        <CargoActionFailure
          errorCode={detail.routeErrorCode ?? detail.batchErrorCode}
          panelRef={panelRef}
          refusal={detail.actionRefusal}
        />
        {detail.routeApplied ? (
          <p className={detailStyles.saved}>{t('outcome.routeApplied')}</p>
        ) : null}
        {detail.outcomes === undefined ? null : (
          <CargoBatchOutcomePanel
            documents={detail.documents}
            onDismiss={detail.dismissOutcome}
            outcomes={detail.outcomes}
            panelRef={panelRef}
          />
        )}
        <CargoOccurrenceList documents={detail.documents} />
        {arrival.groups.map((group) => (
          <CargoGroupTable
            canSelect={canAct}
            group={group}
            key={resolveGroupKey(group)}
            onToggleDocument={selection.toggleDocument}
            onToggleGroup={selection.toggleGroup}
            selected={selection.selected}
          />
        ))}
        {canAct ? (
          <CargoCloseSection
            documents={detail.documents}
            errorCode={detail.closeErrorCode}
            isWorking={detail.isWorking}
            onClose={detail.close}
            panelRef={panelRef}
            pending={detail.pending}
          />
        ) : null}
      </main>
    </CargoOccurrenceProvider>
  )
}
