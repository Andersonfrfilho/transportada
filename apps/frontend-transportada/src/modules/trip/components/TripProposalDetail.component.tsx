/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { VehicleIdentityBand } from '@/modules/fleet/components/VehicleIdentityBand.component'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import {
  formatDistance,
  formatDuration,
} from '@/modules/routing/shared/suggestionValuation.service'
import type { SuggestionVehicleValuation } from '@/modules/routing/shared/suggestionValuation.service'
import { ValuationLedger } from '@/modules/trip-financials/components/ValuationLedger.component'

import { useTripCargoPreview } from '../hooks/useTripCargoPreview.hook'
import { toAssemblyMapNote } from '../shared/assemblyMapNote.service'
import type { ProposalVehicleView } from '../shared/proposalView.service'
import type { RouteEndPolicy, RouteTimelineDriverPayment } from '../shared/routeTimeline.service'
import type { TripCandidateDocument } from '../shared/trip.types'
import { TripAssemblyMap } from './TripAssemblyMap.component'
import { TripCargoPanel } from './TripCargoPanel.component'
import { TripRouteTimeline } from './TripRouteTimeline.component'
import styles from '../styles/trip.module.css'

type TripProposalDetailProps = Readonly<{
  /**
   * O maço que gerou a proposta. ⚠️ Ele é a **única** fonte de endereço, destinatário e telefone
   * aqui: a parada que a API manda tem `label` (a cidade) e os ids das notas, e nada mais — quem
   * sabe onde o caminhão encosta é a nota, que a tela já carregou para montar o pedido.
   */
  documents: readonly TripCandidateDocument[]
  endLabel: null | string
  onRemoveStop: (nfeDocumentIds: readonly string[]) => void
  onUndoRemoveStop: (nfeDocumentIds: readonly string[]) => void
  pendingRemovals: ReadonlySet<string>
  endPolicy: RouteEndPolicy
  originLabel: null | string
  permissions: readonly string[]
  valuation: null | SuggestionVehicleValuation
  vehicle: FleetVehicleDetail | undefined
  view: ProposalVehicleView
}>

/**
 * Spec 110 D3: **o expandido é a tela de criar viagem, por viagem proposta.**
 *
 * ⚠️ **Nenhum componente novo de carga.** `useTripCargoPreview` recebe notas + veículo e não precisa
 * de viagem criada; `TripCargoPanel` já traz a ocupação, a silhueta animada do tipo escolhido e a
 * planta isométrica 3D. O que esta spec faz é montá-los por viagem proposta.
 */
export function TripProposalDetail({
  documents,
  endLabel,
  endPolicy,
  onRemoveStop,
  onUndoRemoveStop,
  pendingRemovals,
  originLabel,
  permissions,
  valuation,
  vehicle,
  view,
}: TripProposalDetailProps) {
  const { t } = useTranslation('trip')
  const documentIds = [...new Set(view.stops.flatMap((stop) => stop.nfeDocumentIds))]
  const cargo = useTripCargoPreview({
    driverIds: valuation?.driverId === null || valuation === null ? [] : [valuation.driverId],
    nfeDocumentIds: documentIds,
    permissions,
    stopOrder: view.cities,
    vehicleId: view.vehicleId,
  })

  /**
   * ⚠️ **As notas desta viagem, na ordem do roteiro.** Sem elas o expandido mostrava cidade e
   * contagem — "SAO JOAQUIM DA BARRA · 1 nota" —, e quem confere a viagem não tinha endereço,
   * cliente nem telefone: exatamente o que o mapa da criação manual imprime ao lado de cada parada.
   */
  const documentById = new Map(documents.map((document) => [document.id, document]))
  const mapNotes = documentIds.flatMap((id) => {
    const document = documentById.get(id)
    return document === undefined ? [] : [toAssemblyMapNote(document)]
  })

  const occupancy = cargo.preview?.occupancy ?? null
  const cargoWeight = cargo.preview?.cargoWeight ?? null

  return (
    <>
      <VehicleIdentityBand
        facts={[
          { label: t('proposal.deliveries'), value: String(view.deliveries) },
          {
            label: t('proposal.time'),
            value: formatDuration(view.durationSeconds) ?? t('proposal.unknown'),
          },
          {
            label: t('proposal.totalDistance'),
            value: formatDistance(view.distanceMeters) ?? t('proposal.unknown'),
          },
        ]}
        label={view.vehicleLabel}
        plate={view.plate}
        specification={describeVehicle(vehicle)}
        vehicleType={view.vehicleType}
      />

      {/*
        ⚠️ **Sem `onOrderChange`**: quem ordenou foi o roteirizador, e oferecer setas que reordenam
        sem recalcular daria um roteiro que a conta ao lado não descreve (spec 110 D6). Remover
        parada continua existindo — ela é marcação, e o aceite fica travado até o recálculo.
      */}
      {mapNotes.length === 0 ? null : (
        <TripAssemblyMap
          nearby={[]}
          onStopRemove={onRemoveStop}
          order={view.cities}
          revenueLines={valuation?.valuation.revenueLines}
          selected={mapNotes}
          vehicleId={view.vehicleId}
        />
      )}

      <section>
        <h4 className={styles.hint}>{t('proposal.routeTitle')}</h4>
        <TripRouteTimeline
          onRemoveStop={onRemoveStop}
          onUndoRemoveStop={onUndoRemoveStop}
          input={{
            /**
             * ⚠️ Vazio, e **não é esquecimento**: a sugestão não persiste os `nodeIds` das praças
             * (spec 090 T11), então o pedágio por trecho ainda não existe aqui. A linha do tempo
             * mostra o dia sem inventar praça nenhuma.
             */
            booths: [],
            driverPayment: resolveDriverPayment(valuation),
            endLabel,
            endPolicy,
            originLabel,
            removedDocumentIds: pendingRemovals,
            returnLeg: null,
            stops: view.stops.map((stop) => ({
              distanceFromPreviousMeters: stop.distanceFromPreviousMeters,
              documentCount: stop.nfeDocumentIds.length,
              durationFromPreviousSeconds: stop.durationFromPreviousSeconds,
              estimatedArrivalAt: stop.estimatedArrivalAt,
              excludedFromOptimization: stop.excludedFromOptimization,
              label: stop.label,
              nfeDocumentIds: stop.nfeDocumentIds,
            })),
          }}
        />
      </section>

      {occupancy === null && cargoWeight === null ? null : (
        <TripCargoPanel
          cargoWeight={cargoWeight}
          layout={cargo.preview?.cargoLayout ?? null}
          occupancy={occupancy}
          vehicleType={view.vehicleType}
          weightConcentration={cargo.preview?.weightConcentration ?? null}
        />
      )}

      <section>
        <h4 className={styles.hint}>{t('proposal.accountTitle')}</h4>
        <ValuationLedger valuation={valuation?.valuation ?? null} />
      </section>
    </>
  )
}

/**
 * ⚠️ O pagamento do agregado sai da **base** da parcela, não de um cálculo daqui: quem sabe qual
 * zona pagou é a API, e refazer a escolha no cliente produziria um segundo número.
 */
function resolveDriverPayment(
  valuation: null | SuggestionVehicleValuation,
): null | RouteTimelineDriverPayment {
  const parcel = valuation?.valuation.costParcels.find((entry) => entry.kind === 'driver')
  const basis = parcel?.basis
  if (parcel === undefined || basis === undefined || basis === null || basis.of !== 'driver') {
    return null
  }

  return {
    amount: parcel.gap === null ? parcel.amount : null,
    paymentModel: basis.paymentModel,
    regionCity: basis.regionCity,
    regionCode: basis.regionCode,
    vehicleClass: basis.vehicleClass,
  }
}

/** A ficha em uma linha: baú, capacidade e porta. Campo ausente **some**, nunca vira "—". */
function describeVehicle(vehicle: FleetVehicleDetail | undefined): null | string {
  if (vehicle === undefined) return null
  const parts: string[] = []
  const { cargoHeightMeters, cargoLengthMeters, cargoWidthMeters } = vehicle
  if (
    hasMeasure(cargoLengthMeters) &&
    hasMeasure(cargoWidthMeters) &&
    hasMeasure(cargoHeightMeters)
  ) {
    parts.push(`${cargoLengthMeters} × ${cargoWidthMeters} × ${cargoHeightMeters} m`)
  }
  if (hasMeasure(vehicle.capacityCubicMeters)) parts.push(`${vehicle.capacityCubicMeters} m³`)
  if (hasMeasure(vehicle.capacityKilograms)) parts.push(`${vehicle.capacityKilograms} kg`)

  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * ⚠️ **Zero é ausência, nunca medida.** A spec 088 é explícita: baú de volume zero não existe, e
 * `0.00` é o vocabulário que o resolvedor de capacidade já lê como "ninguém mediu". Imprimir
 * `0.00 × 0.00 × 0.00 m` seria afirmar uma ficha que ninguém preencheu.
 */
function hasMeasure(value: null | string): boolean {
  return value !== null && Number.parseFloat(value) > 0
}
