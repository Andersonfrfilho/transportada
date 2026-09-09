/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import {
  formatDistance,
  formatDuration,
} from '@/modules/routing/shared/suggestionValuation.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { isNegative } from '@/modules/trip-financials/shared/financialView.service'

import type { ProposalVehicleView } from '../shared/proposalView.service'
import {
  summarizeProposalSelection,
  toggleAllProposalSelection,
  toggleProposalSelection,
} from '../shared/proposalSelection.service'
import { TripProposalRow } from './TripProposalRow.component'
import styles from '../styles/trip.module.css'

type TripProposalListProps = Readonly<{
  editedVehicleIds: ReadonlySet<string>
  isAccepting: boolean
  onAccept: (vehicleIds: readonly string[]) => void
  onDiscard: () => void
  onDiscardVehicle: (vehicleId: string) => void
  onRecalculate: (vehicleId: string) => void
  onSelectionChange: (selected: ReadonlySet<string>) => void
  onToggleOpen: (vehicleId: string) => void
  openVehicleId: null | string
  renderDetail: (view: ProposalVehicleView) => ReactNode
  selected: ReadonlySet<string>
  views: readonly ProposalVehicleView[]
}>

/**
 * Spec 110 D5: **aceitar tudo, ou só o que serve** — e os totais são do que está marcado.
 *
 * ⚠️ É o ponto da tela: comparar aceitar tudo com aceitar parte é a decisão, e um total fixo não
 * ajuda a tomá-la. Desmarcar a viagem com a conta incompleta tira a marca junto com ela.
 */
export function TripProposalList({
  editedVehicleIds,
  isAccepting,
  onAccept,
  onDiscard,
  onDiscardVehicle,
  onRecalculate,
  onSelectionChange,
  onToggleOpen,
  openVehicleId,
  renderDetail,
  selected,
  views,
}: TripProposalListProps) {
  const { t } = useTranslation('trip')
  const summary = summarizeProposalSelection({
    selected,
    vehicles: views.map((view) => ({
      deliveries: view.deliveries,
      distanceMeters: view.distanceMeters,
      durationSeconds: view.durationSeconds,
      hasGaps: view.hasGaps,
      tollAmount: null,
      totalCost: view.totalCost,
      totalMargin: view.totalMargin,
      totalRevenue: view.totalRevenue,
      vehicleId: view.vehicleId,
    })),
  })

  const acceptLabel =
    summary.selectedCount === 0
      ? t('proposal.acceptNone')
      : summary.allSelected
        ? t('proposal.acceptAll', { count: summary.selectedCount })
        : t('proposal.acceptSome', { count: summary.selectedCount })

  return (
    <section aria-label={t('routeAssembly.proposal.title')} className={styles.deck}>
      <div className={styles.proposalBar}>
        <div className={styles.proposalBarHead}>
          <Checkbox
            ariaLabel={t('proposal.selectAll')}
            checked={summary.allSelected}
            indeterminate={summary.indeterminate}
            label={t('proposal.selectAll')}
            onChange={() =>
              onSelectionChange(toggleAllProposalSelection({ selected, vehicles: views }))
            }
          />
          <p className={styles.hint}>
            {t('proposal.headline', {
              deliveries: summary.deliveries,
              selected: summary.selectedCount,
              total: summary.totalCount,
            })}
          </p>
          {/* ⚠️ A afirmação da spec 108 é o ponto do painel: sem ela ele é só uma tela de números. */}
          <p className={styles.proposalNothingCreated} role="status">
            <Icon aria-hidden="true" name="shield" />
            {t('proposal.nothingCreated')}
          </p>
        </div>

        <dl className={styles.proposalTotals}>
          <Total label={t('proposal.totalRevenue')} value={formatAmount(summary.totalRevenue)} />
          <Total
            label={t('proposal.totalExpenses')}
            tone={styles.proposalExpenses}
            value={formatAmount(summary.totalCost)}
          />
          <Total
            label={t('proposal.totalMargin')}
            tone={
              summary.hasGaps
                ? styles.proposalWarn
                : isNegative(summary.totalMargin)
                  ? styles.negative
                  : styles.proposalProfit
            }
            value={formatAmount(summary.totalMargin)}
          />
          <Total
            label={t('proposal.totalToll')}
            value={
              summary.totalToll === null ? t('proposal.unknown') : formatAmount(summary.totalToll)
            }
          />
          <Total
            label={t('proposal.totalDistance')}
            value={formatDistance(summary.totalDistanceMeters) ?? t('proposal.unknown')}
          />
          <Total
            label={t('proposal.totalDuration')}
            value={formatDuration(summary.totalDurationSeconds) ?? t('proposal.unknown')}
          />
        </dl>
        <p className={styles.hint}>{t('proposal.selectionNote')}</p>
      </div>

      <ul className={styles.proposalList}>
        {views.map((view, index) => (
          <TripProposalRow
            index={index}
            isEdited={editedVehicleIds.has(view.vehicleId)}
            isOpen={openVehicleId === view.vehicleId}
            isSelected={selected.has(view.vehicleId)}
            key={view.vehicleId}
            onAccept={() => onAccept([view.vehicleId])}
            onDiscard={() => onDiscardVehicle(view.vehicleId)}
            onRecalculate={() => onRecalculate(view.vehicleId)}
            onToggleOpen={() => onToggleOpen(view.vehicleId)}
            onToggleSelected={() =>
              onSelectionChange(toggleProposalSelection({ selected, vehicleId: view.vehicleId }))
            }
            view={view}
          >
            {renderDetail(view)}
          </TripProposalRow>
        ))}
      </ul>

      <div className={styles.proposalFooter}>
        <div className={styles.proposalFooterActions}>
          <Button
            disabled={isAccepting || summary.selectedCount === 0}
            onClick={() => onAccept([...selected])}
            size="sm"
            type="button"
          >
            <Icon name="workspace-trip" />
            {acceptLabel}
          </Button>
          <Button
            disabled={isAccepting}
            onClick={onDiscard}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
            {t('proposal.discard')}
          </Button>
        </div>
        {/* O que acontece com o resto, dito antes do clique: nada é criado para elas. */}
        <p className={styles.hint}>
          {summary.releasedTrips === 0
            ? t('proposal.releaseNone')
            : t('proposal.releaseSome', {
                deliveries: summary.releasedDeliveries,
                trips: summary.releasedTrips,
              })}
        </p>
      </div>
    </section>
  )
}

function Total({
  label,
  tone,
  value,
}: Readonly<{ label: string; tone?: string | undefined; value: string }>) {
  return (
    <div className={styles.proposalTotal}>
      <span>{label}</span>
      <span className={tone === undefined ? undefined : tone}>{value}</span>
    </div>
  )
}
