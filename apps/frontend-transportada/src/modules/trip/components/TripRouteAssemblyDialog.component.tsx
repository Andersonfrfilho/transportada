/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { FleetDriverDetail, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { getRouteSuggestionClient } from '@/modules/routing/hooks/useRouteSuggestion.hook'
import { useSuggestionValuation } from '@/modules/routing/queries/useSuggestionValuation.query'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { TripRouteAssemblyController } from '../hooks/useTripRouteAssembly.hook'
import { buildProposalVehicleViews } from '../shared/proposalView.service'
import { TripProposalDetail } from './TripProposalDetail.component'
import { TripProposalList } from './TripProposalList.component'
import { TripRouteAssemblyPanel } from './TripRouteAssemblyPanel.component'
import styles from '../styles/trip.module.css'

type TripRouteAssemblyDialogProps = Readonly<{
  assembly: TripRouteAssemblyController
  drivers: readonly FleetDriverDetail[]
  permissions: readonly string[]
  vehicles: readonly FleetVehicleDetail[]
}>

/**
 * O roteiro por faixa entra pela mesma porta da criação manual: os dois montam viagem, e deixar um
 * aberto na tela e o outro atrás de um botão fazia a listagem de viagens começar com dois
 * formulários antes da primeira linha da tabela.
 *
 * ⚠️ **Spec 110 D1: a revisão mora aqui, e o diálogo só fecha no aceite ou no descarte.** Ela vivia
 * em `TripWorkspace.page.tsx`, entre os botões e a tabela — e o diálogo que a pediu fechava antes de
 * ela aparecer.
 */
export function TripRouteAssemblyDialog({
  assembly,
  drivers,
  permissions,
  vehicles,
}: TripRouteAssemblyDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: assembly.isOpen,
    onClose: assembly.close,
  })

  /** Spec 101: a conta da proposta. ⚠️ Sem `trip.financials` o painel fica inteiro; some o dinheiro. */
  const suggestionValuation = useSuggestionValuation({
    client: getRouteSuggestionClient(),
    isReady: assembly.proposal !== null,
    permissions,
    suggestionId: assembly.proposal?.suggestion.id ?? null,
  })

  if (!assembly.isOpen) return null

  const proposal = assembly.proposal
  const vehicleById = new Map(
    vehicles.map((vehicle) => [
      vehicle.id,
      {
        label: [vehicle.brand, vehicle.model].filter((part) => part !== '').join(' '),
        plate: vehicle.plate,
        type: vehicle.vehicleType,
      },
    ]),
  )
  const views =
    proposal === null
      ? []
      : buildProposalVehicleViews({
          documentsById: new Map(
            assembly.pool.map((document) => [
              document.id,
              {
                cargoGrossWeight: document.cargoGrossWeight,
                cargoWeightSource: document.cargoWeightSource,
              },
            ]),
          ),
          /** ⚠️ Quem dirige sai do **par** que a montagem enviou, não da conta (spec 110 D2). */
          driverIdByVehicleId: assembly.driverIdByVehicleId,
          driverNameById: new Map(drivers.map((driver) => [driver.id, driver.name])),
          stops: proposal.stops,
          valuation: suggestionValuation.valuation,
          vehicleById,
        })
  const valuationByVehicle = new Map(
    (suggestionValuation.valuation?.vehicles ?? []).map((entry) => [entry.vehicleId, entry]),
  )

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-route-assembly-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="trip-route-assembly-title">{t('routeAssembly.title')}</h2>
            <p className={styles.hint}>{t('routeAssembly.intro')}</p>
          </div>
          <Button
            aria-label={t('quickCreate.close')}
            onClick={assembly.close}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>

        {/*
          ⚠️ Com a proposta na tela o formulário **recolhe numa faixa**: sem isso a lista nasce duas
          telas abaixo do topo, e quem acabou de pedir o roteiro rola para encontrá-lo.
        */}
        {proposal === null ? (
          <TripRouteAssemblyPanel assembly={assembly} drivers={drivers} vehicles={vehicles} />
        ) : (
          <>
            <div className={styles.proposalRecap}>
              <p className={styles.hint}>
                {t('routeAssembly.recap', {
                  drivers: assembly.draft.driverIds.length,
                  notes: assembly.selection.eligible.length,
                  vehicles: assembly.effectiveVehicleIds.length,
                })}
              </p>
              <Button onClick={assembly.discardProposal} size="sm" type="button" variant="ghost">
                <Icon name="edit" />
                {t('routeAssembly.changeRequest')}
              </Button>
            </div>

            <TripProposalList
              isEdited={assembly.isProposalEdited}
              isAccepting={assembly.acceptMutation.isPending}
              onAccept={(vehicleIds) => assembly.acceptMutation.mutate(vehicleIds)}
              onDiscard={assembly.discardProposal}
              onDiscardVehicle={assembly.discardVehicle}
              isRecalculating={assembly.proposeMutation.isPending}
              onRecalculate={() => assembly.proposeMutation.mutate()}
              onSelectionChange={assembly.setSelectedVehicleIds}
              onToggleOpen={assembly.toggleOpenVehicle}
              openVehicleId={assembly.openVehicleId}
              renderDetail={(view) => (
                <TripProposalDetail
                  endLabel={null}
                  onRemoveStop={assembly.markStopRemoved}
                  onUndoRemoveStop={assembly.undoStopRemoval}
                  pendingRemovals={assembly.pendingRemovals}
                  endPolicy={proposal.suggestion.endPolicy}
                  originLabel={null}
                  permissions={permissions}
                  valuation={valuationByVehicle.get(view.vehicleId) ?? null}
                  vehicle={vehicles.find((vehicle) => vehicle.id === view.vehicleId)}
                  view={view}
                />
              )}
              selected={assembly.selectedVehicleIds}
              views={views}
            />
          </>
        )}

        {proposal === null ? (
          <div className={styles.dialogFooter}>
            <Button onClick={assembly.close} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('quickCreate.cancel')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
