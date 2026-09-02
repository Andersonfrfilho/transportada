/* Copyright (c) 2026 Ada Technology. MIT License. */
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import type { TripDocumentSelectionController } from '../hooks/useTripDocumentSelection.hook'
import { useTripStopOrder } from '../hooks/useTripStopOrder.hook'
import { hasTripDocumentFiscalWarning, tripDocumentLabel } from '../shared/tripDocument.service'
import type { TripDocumentDetail, TripStopDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

/**
 * Três portões distintos, não um: o domínio separa trabalho de barracão (separar/carregar, só
 * antes da saída e com roteiro planejado) de trabalho de rua (devolver, só depois da saída) — e
 * vincular/desvincular/desviar endereço segue um terceiro, o de `checkTripAcceptsLinkage`.
 * Colapsar os três num `isEditable` só mostrava "Devolver" exatamente quando ele falharia.
 */
export type TripStopDocumentActions = Readonly<{
  /** Spec 079: entregar é o mesmo trabalho de rua que devolver, e desde 02/09 o backend o exige. */
  canDeliver: boolean
  canManage: boolean
  canReturn: boolean
  canSeparateOrLoad: boolean
  isDeliverPending: boolean
  isEditable: boolean
  isReleasePending: boolean
  isTransitionPending: boolean
  onDeliver: (documentId: string) => void
  /** Spec 079 T006/T025: abre e fecha o comprovante da nota. */
  onToggleProof: (documentId: string) => void
  openProofDocumentId: null | string
  renderProof: (documentId: string) => ReactNode
  onLoad: (documentId: string) => void
  onOverrideAddress: (documentId: string) => void
  onRelease: (documentId: string) => void
  onReturn: (documentId: string) => void
  onSeparate: (documentId: string) => void
}>

type TripStopListProps = Readonly<{
  actions: TripStopDocumentActions
  canReorder: boolean
  onReorder: (stopIds: readonly string[]) => void
  selection: TripDocumentSelectionController
  stops: readonly TripStopDetail[]
}>

export function TripStopList({
  actions,
  canReorder,
  onReorder,
  selection,
  stops,
}: TripStopListProps) {
  const { t } = useTranslation('trip')
  const order = useTripStopOrder({ onReorder, stops })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const stopById = new Map(stops.map((stop) => [stop.id, stop]))
  const orderedStops = order.orderedIds
    .map((stopId) => stopById.get(stopId))
    .filter((stop): stop is TripStopDetail => stop !== undefined)

  if (stops.length === 0) {
    return <p className={styles.hint}>{t('stops.empty')}</p>
  }

  const list = (
    <ul className={styles.stopList}>
      {orderedStops.map((stop) => (
        <TripStopCard
          actions={actions}
          canReorder={canReorder}
          key={stop.id}
          selection={selection}
          stop={stop}
        />
      ))}
    </ul>
  )

  if (!canReorder) return list

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={order.handleDragEnd}
      sensors={sensors}
    >
      <SortableContext items={[...order.orderedIds]} strategy={verticalListSortingStrategy}>
        {list}
      </SortableContext>
    </DndContext>
  )
}

type TripStopCardProps = Readonly<{
  actions: TripStopDocumentActions
  canReorder: boolean
  selection: TripDocumentSelectionController
  stop: TripStopDetail
}>

function TripStopCard({ actions, canReorder, selection, stop }: TripStopCardProps) {
  const { t } = useTranslation('trip')
  const sortable = useSortable({ disabled: !canReorder, id: stop.id })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }
  const documentIds = stop.documents.map((document) => document.id)
  const allSelected =
    documentIds.length > 0 &&
    documentIds.every((documentId) => selection.selectedIds.has(documentId))
  const someSelected = documentIds.some((documentId) => selection.selectedIds.has(documentId))

  return (
    <li className={styles.stopCard} ref={sortable.setNodeRef} style={style}>
      <div className={styles.stopCardHead}>
        {canReorder ? (
          <button
            aria-label={t('stops.reorderHandle', { label: stop.label })}
            className={styles.stopDragHandle}
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <Icon name="grip" />
          </button>
        ) : null}
        <Checkbox
          ariaLabel={t('stops.selectAll', { label: stop.label })}
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onChange={(checked) => selection.toggleMany(documentIds, checked)}
        />
        <span className={styles.stopSequence}>{stop.sequence}</span>
        <span className={styles.stopLabel}>{stop.label}</span>
        <span className={styles.stopCounter}>
          {t('stops.documentCount', { count: stop.documents.length })}
        </span>
        <StopExecution stop={stop} />
      </div>

      <TripStopDocumentGroup actions={actions} documents={stop.documents} selection={selection} />
    </li>
  )
}

/**
 * Spec 057 P2: o que aconteceu na rua, na mesma linha da parada. Sem isto o escritório continua
 * descobrindo a entrega quando o motorista volta ao barracão — que é o problema que a 057 abriu.
 */
function StopExecution({ stop }: Readonly<{ stop: TripStopDetail }>) {
  const { t } = useTranslation('trip')
  if (stop.arrivedAt === null) return null

  return (
    <span className={styles.stopCounter}>
      {stop.completedAt === null
        ? t('stops.arrivedAt', { time: formatStopTime(stop.arrivedAt) })
        : t('stops.completedAt', { time: formatStopTime(stop.completedAt) })}
    </span>
  )
}

/** Hora e minuto: o dia é o da viagem, e a data por extenso só rouba espaço da linha. */
function formatStopTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function TripStopDocumentGroup({
  actions,
  documents,
  selection,
}: Readonly<{
  actions: TripStopDocumentActions
  documents: readonly TripDocumentDetail[]
  selection: TripDocumentSelectionController
}>) {
  return (
    <ul className={styles.stopDocumentList}>
      {documents.map((document) => (
        <TripStopDocumentRow
          actions={actions}
          document={document}
          key={document.id}
          selection={selection}
        />
      ))}
    </ul>
  )
}

function TripStopDocumentRow({
  actions,
  document,
  selection,
}: Readonly<{
  actions: TripStopDocumentActions
  document: TripDocumentDetail
  selection: TripDocumentSelectionController
}>) {
  const { t } = useTranslation('trip')

  return (
    <li
      className={
        hasTripDocumentFiscalWarning(document)
          ? `${styles.stopDocumentRow} ${styles.warningRow}`
          : styles.stopDocumentRow
      }
    >
      <Checkbox
        ariaLabel={t('stops.selectDocument', { document: tripDocumentLabel(document) })}
        checked={selection.selectedIds.has(document.id)}
        onChange={() => selection.toggle(document.id)}
      />
      <span className={styles.stopDocumentLabel}>{tripDocumentLabel(document)}</span>
      <span className={styles.separationStatusBadge}>
        {t(`separationStatus.${document.separationStatus}`)}
      </span>
      {/*
       * Spec 073 CA10: a marca aparece **só** no endereço de entrega. Em 345 de 345 notas reais o
       * endereço é o do cadastro — imprimir "Cadastro" em todas seria ruído que apaga justamente a
       * linha que explica por que o motorista foi a outro portão.
       */}
      {document.destinationOrigin === 'delivery' ? (
        <span className={styles.destinationOriginBadge} title={t('destinationOrigin.deliveryHint')}>
          {t('destinationOrigin.delivery')}
        </span>
      ) : null}
      {hasTripDocumentFiscalWarning(document) ? (
        <span className={styles.fiscalWarning}>{t('detail.fiscalWarning')}</span>
      ) : null}
      <div className={styles.rowActions}>
        {/*
         * O comprovante é do escritório, e ler não é administrar: quem acompanha a operação abre o
         * canhoto sem `trip.manage`. O botão só aparece quando há entrega ou devolução para
         * comprovar — numa nota que ainda está no galpão não há o que mostrar.
         */}
        {document.deliveredAt === null && document.returnedAt === null ? null : (
          <Button
            onClick={() => actions.onToggleProof(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('actions.viewProof')}
          </Button>
        )}
        {actions.canManage &&
        actions.canSeparateOrLoad &&
        document.separationStatus === 'pending' ? (
          <Button
            disabled={actions.isTransitionPending}
            onClick={() => actions.onSeparate(document.id)}
            size="sm"
            type="button"
          >
            {t('actions.separate')}
          </Button>
        ) : null}
        {actions.canManage &&
        actions.canSeparateOrLoad &&
        document.separationStatus === 'separated' ? (
          <Button
            disabled={actions.isTransitionPending}
            onClick={() => actions.onLoad(document.id)}
            size="sm"
            type="button"
          >
            {t('actions.load')}
          </Button>
        ) : null}
        {actions.canManage && actions.canReturn && document.separationStatus === 'loaded' ? (
          <Button
            disabled={actions.isTransitionPending}
            onClick={() => actions.onReturn(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('actions.return')}
          </Button>
        ) : null}
        {actions.canManage && actions.canDeliver && document.deliveredAt === null ? (
          <Button
            disabled={actions.isDeliverPending}
            onClick={() => actions.onDeliver(document.id)}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('actions.deliver')}
          </Button>
        ) : null}
        {actions.canManage && actions.isEditable ? (
          <Button
            disabled={actions.isReleasePending}
            onClick={() => actions.onRelease(document.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="remove" />
            {t('actions.release')}
          </Button>
        ) : null}
        {actions.canManage && actions.isEditable ? (
          <Button
            onClick={() => actions.onOverrideAddress(document.id)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="edit" />
            {t('deliveryOverride.menuAction')}
          </Button>
        ) : null}
      </div>
      {actions.openProofDocumentId === document.id ? actions.renderProof(document.id) : null}
    </li>
  )
}
