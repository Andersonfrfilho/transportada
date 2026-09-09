/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SuggestionValuationReport } from '@/modules/routing/components/SuggestionValuationReport.component'
import { SuggestionVehicleValuation } from '@/modules/routing/components/SuggestionVehicleValuation.component'
import { resolveProposalVehicles } from '@/modules/routing/shared/suggestionProposal.service'
import type { SuggestionValuation } from '@/modules/routing/shared/suggestionValuation.service'
import { resolveLeftoverStops } from '@/modules/routing/shared/suggestionLeftover.service'

import type { MultiVehicleProposal } from '../shared/trip.types'
import styles from '../styles/trip.module.css'
import { TripRouteAssemblyLeftovers } from './TripRouteAssemblyLeftovers.component'

type TripRouteAssemblyProposalProps = Readonly<{
  isAccepting: boolean
  isValuationLoading: boolean
  onAccept: () => void
  onDiscard: () => void
  plateByVehicleId: ReadonlyMap<string, string>
  proposal: MultiVehicleProposal
  valuation: null | SuggestionValuation
}>

/**
 * Spec 108: **a proposta antes do rascunho.**
 *
 * ⚠️ Até 09/09/2026 o mesmo clique montava e criava: a tela dizia "5 viagens criadas pela
 * recomendação" e o operador nunca tinha visto o que aceitou. Desfazer custava cancelar cinco
 * viagens, uma a uma, e as notas só voltavam ao pool depois disso (spec 102).
 *
 * ⚠️ O que existe no banco enquanto este painel está aberto é a **sugestão** — paradas propostas.
 * Nenhum rascunho, nenhum vínculo de nota, nenhuma parada de viagem. E é isso que o painel afirma
 * em voz alta, porque um painel que só mostra números seria indistinguível do que ele substituiu.
 */
export function TripRouteAssemblyProposal({
  isAccepting,
  isValuationLoading,
  onAccept,
  onDiscard,
  plateByVehicleId,
  proposal,
  valuation,
}: TripRouteAssemblyProposalProps) {
  const { t } = useTranslation('trip')

  const vehicles = resolveProposalVehicles({ plateByVehicleId, stops: proposal.stops })
  const leftovers = resolveLeftoverStops(proposal.stops)
  const valuationByVehicle = new Map(
    (valuation?.vehicles ?? []).map((entry) => [entry.vehicleId, entry]),
  )
  const vehicleLabels = Object.fromEntries(
    vehicles.map((vehicle) => [
      vehicle.vehicleId,
      vehicle.plate ?? t('routeAssembly.proposal.unknownPlate'),
    ]),
  )
  const totalDocuments = vehicles.reduce((total, vehicle) => total + vehicle.documentCount, 0)

  return (
    <section aria-label={t('routeAssembly.proposal.title')} className={styles.proposal}>
      <header className={styles.proposalHead}>
        <div>
          <h3>{t('routeAssembly.proposal.title')}</h3>
          <p className={styles.hint}>
            {t('routeAssembly.proposal.summary', { count: vehicles.length })}
            {' · '}
            {t('routeAssembly.proposal.deliveries', { count: totalDocuments })}
          </p>
        </div>
        {/* ⚠️ A afirmação é o ponto do painel: sem ela ele é só mais uma tela de números. */}
        <p className={styles.proposalNothingCreated} role="status">
          <Icon aria-hidden="true" name="shield" />
          {t('routeAssembly.proposal.nothingCreated')}
        </p>
      </header>

      <ul className={styles.proposalVehicles}>
        {vehicles.map((vehicle) => (
          <li className={styles.proposalCard} key={vehicle.vehicleId}>
            <h4>{vehicle.plate ?? t('routeAssembly.proposal.unknownPlate')}</h4>
            <p className={styles.proposalCardCounts}>
              {t('routeAssembly.proposal.stops', { count: vehicle.stopCount })}
              {' · '}
              {t('routeAssembly.proposal.deliveries', { count: vehicle.documentCount })}
            </p>

            <SuggestionVehicleValuation
              isLoading={isValuationLoading}
              valuation={valuationByVehicle.get(vehicle.vehicleId) ?? null}
            />

            <details className={styles.proposalCardStops}>
              <summary>{t('routeAssembly.proposal.showStops')}</summary>
              <ol>
                {vehicle.stopLabels.map((label, index) => (
                  <li key={`${vehicle.vehicleId}-${String(index)}`}>{label}</li>
                ))}
              </ol>
            </details>
          </li>
        ))}
      </ul>

      <SuggestionValuationReport
        isLoading={isValuationLoading}
        valuation={valuation}
        vehicleLabels={vehicleLabels}
      />

      {/*
        ⚠️ A sobra aparece **aqui**, antes do aceite: descobrir que 16 notas ficaram de fora depois
        de as viagens existirem é descobrir tarde. As viagens vão vazias de propósito — nenhuma
        existe ainda, e a frase da segunda onda não teria de onde sair.
      */}
      <TripRouteAssemblyLeftovers
        onRetry={onDiscard}
        outcome={{ leftoverStops: leftovers, skippedDocuments: [], trips: [] }}
        plateByVehicleId={plateByVehicleId}
      />

      <div className={styles.proposalActions}>
        <Button disabled={isAccepting} onClick={onAccept} size="sm" type="button">
          <Icon name="workspace-trip" />
          {t('routeAssembly.proposal.accept', { count: vehicles.length })}
        </Button>
        <Button disabled={isAccepting} onClick={onDiscard} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('routeAssembly.proposal.discard')}
        </Button>
      </div>
    </section>
  )
}
