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

import {
  LEFTOVER_REASON,
  resolveLeftoverStops,
  type CoverableSuggestionStop,
  type LeftoverReason,
  type LeftoverStop,
} from '@/modules/routing/shared/suggestionLeftover.service'

import { countOverPayload, type ProposalVehicleView } from '../shared/proposalView.service'
import {
  summarizeProposalSelection,
  toggleAllProposalSelection,
  toggleProposalSelection,
} from '../shared/proposalSelection.service'
import { TripProposalRow } from './TripProposalRow.component'
import styles from '../styles/trip.module.css'

type TripProposalListProps = Readonly<{
  /** ⚠️ Da proposta inteira, não de um caminhão: tirar uma parada muda o maço, e o maço decide tudo. */
  isEdited: boolean
  isAccepting: boolean
  isRecalculating: boolean
  onAccept: (vehicleIds: readonly string[]) => void
  onDiscard: () => void
  onDiscardVehicle: (vehicleId: string) => void
  /**
   * ⚠️ **Da proposta, não de um caminhão.** Tirar uma parada muda o maço, e o maço decide a
   * distribuição inteira: prometer um recorte por veículo seria prometer o que o solver não faz.
   */
  onRecalculate: () => void
  onSelectionChange: (selected: ReadonlySet<string>) => void
  onToggleOpen: (vehicleId: string) => void
  openVehicleId: null | string
  renderDetail: (view: ProposalVehicleView) => ReactNode
  selected: ReadonlySet<string>
  /** ⚠️ **Todas** as paradas da proposta, inclusive as sem veículo: são elas a sobra. */
  stops: readonly CoverableSuggestionStop[]
  views: readonly ProposalVehicleView[]
}>

/**
 * Spec 110 D5: **aceitar tudo, ou só o que serve** — e os totais são do que está marcado.
 *
 * ⚠️ É o ponto da tela: comparar aceitar tudo com aceitar parte é a decisão, e um total fixo não
 * ajuda a tomá-la. Desmarcar a viagem com a conta incompleta tira a marca junto com ela.
 */
export function TripProposalList({
  isAccepting,
  isEdited,
  isRecalculating,
  onAccept,
  onDiscard,
  onDiscardVehicle,
  onRecalculate,
  onSelectionChange,
  onToggleOpen,
  openVehicleId,
  renderDetail,
  selected,
  stops,
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

  const money = (value: null | string): string =>
    value === null ? t('proposal.unknown') : formatAmount(value)

  /**
   * ⚠️ **O aceite não pode ser calado sobre o teto de peso.** Medido: quatro das cinco viagens
   * propostas nasceram acima da capacidade do caminhão, e a barra oferecia "Aceitar e criar as 5
   * viagens" sem uma palavra. Fiscalização pelo peso **declarado** em CT-e ou MDF-e não admite
   * tolerância (Res. CONTRAN 882/2021, Art. 49 §3º) — e o aviso não bloqueia: quem decide despachar
   * é o operador, como a ADR-0044 §4 já decidiu para a violação dentro do solver.
   */
  const overPayload = countOverPayload(views, selected)
  /**
   * ⚠️ **A proposta precisa dizer o que ficou de fora dela.** Medido em 2026-09-09, depois do corte
   * por capacidade: o operador escolheu 345 notas, a barra anunciou "5 de 5 viagens · 180 entregas"
   * e calou sobre 165 — 148 que não coubem na frota e 17 de endereço impreciso demais para
   * roteirizar. Sugestão que devolve parte e não conta o resto **parece completa**, que é o modo de
   * falha que a spec 107 nomeia: o operador aceita e descobre a carga esquecida no dia seguinte.
   *
   * O painel de sobra existia só **depois** do aceite, e ali já é tarde: as viagens estão criadas.
   */
  const leftovers = resolveLeftoverStops(stops)
  const leftoverByReason = [
    { count: countStops(leftovers, LEFTOVER_REASON.overCapacity), key: 'overCapacity' },
    { count: countStops(leftovers, LEFTOVER_REASON.notCovered), key: 'notCovered' },
    { count: countStops(leftovers, LEFTOVER_REASON.imprecise), key: 'imprecise' },
  ].filter((entry) => entry.count > 0)

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
          {leftoverByReason.length === 0 ? null : (
            <p className={styles.hint} role="status">
              {leftoverByReason
                .map((entry) => t(`routeAssembly.leftovers.${entry.key}`, { count: entry.count }))
                .join(' · ')}
            </p>
          )}
          {overPayload === 0 ? null : (
            <p className={styles.alert} role="alert">
              {t('proposal.overPayloadWarning', { count: overPayload })}
            </p>
          )}
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
          <Total label={t('proposal.totalRevenue')} value={money(summary.totalRevenue)} />
          <Total
            label={t('proposal.totalExpenses')}
            tone={summary.totalCost === null ? undefined : styles.proposalExpenses}
            value={money(summary.totalCost)}
          />
          <Total
            label={t('proposal.totalMargin')}
            tone={
              summary.hasGaps
                ? styles.proposalWarn
                : isNegative(summary.totalMargin ?? '0.00')
                  ? styles.negative
                  : styles.proposalProfit
            }
            value={money(summary.totalMargin)}
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
            isEdited={isEdited}
            isOpen={openVehicleId === view.vehicleId}
            isSelected={selected.has(view.vehicleId)}
            key={view.vehicleId}
            onAccept={() => onAccept([view.vehicleId])}
            onDiscard={() => onDiscardVehicle(view.vehicleId)}
            onRecalculate={onRecalculate}
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
          {/*
            ⚠️ **O aceite é recusado enquanto houver remoção pendente.** O que está na tela não é o
            que sairia: o aceite parte dos grupos do servidor, e eles ainda não sabem da remoção.
          */}
          <Button
            disabled={isAccepting || isEdited || summary.selectedCount === 0}
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
        {isEdited ? (
          <p className={styles.proposalEditedBanner} role="status">
            <Icon aria-hidden="true" name="alert" />
            <span>{t('proposal.editedBanner')}</span>
            <Button
              disabled={isRecalculating}
              onClick={() => onRecalculate()}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="refresh" />
              {t('proposal.recalculateProposal')}
            </Button>
          </p>
        ) : null}
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

/**
 * As **paradas** da sobra, porque é o que o rótulo diz.
 *
 * ⚠️ O painel de depois do aceite usa as mesmas chaves contando paradas, e imprimir notas aqui daria
 * dois números diferentes sob a mesma frase — hoje eles coincidem (uma nota por parada nesta base),
 * e o dia em que divergirem seria o dia em que ninguém saberia qual dos dois é o certo.
 */
function countStops(stops: readonly LeftoverStop[], reason: LeftoverReason): number {
  return stops.filter((stop) => stop.reason === reason).length
}
