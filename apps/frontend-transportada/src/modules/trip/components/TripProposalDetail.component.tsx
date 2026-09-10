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
import { buildProposalStopOrder, type ProposalVehicleView } from '../shared/proposalView.service'
import type { TripCandidateDocument } from '../shared/trip.types'
import { TripAssemblyMap } from './TripAssemblyMap.component'
import { TripCargoPanel } from './TripCargoPanel.component'
import styles from '../styles/trip.module.css'

type TripProposalDetailProps = Readonly<{
  /**
   * O maço que gerou a proposta. ⚠️ Ele é a **única** fonte de endereço, destinatário e telefone
   * aqui: a parada que a API manda tem `label` (a cidade) e os ids das notas, e nada mais — quem
   * sabe onde o caminhão encosta é a nota, que a tela já carregou para montar o pedido.
   */
  documents: readonly TripCandidateDocument[]
  onRemoveStop: (nfeDocumentIds: readonly string[]) => void
  onUndoRemoveStop: (nfeDocumentIds: readonly string[]) => void
  pendingRemovals: ReadonlySet<string>
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
  onRemoveStop,
  onUndoRemoveStop,
  pendingRemovals,
  permissions,
  valuation,
  vehicle,
  view,
}: TripProposalDetailProps) {
  const { t } = useTranslation('trip')
  const documentIds = [...new Set(view.stops.flatMap((stop) => stop.nfeDocumentIds))]
  const documentById = new Map(documents.map((document) => [document.id, document]))
  /**
   * ⚠️ **A ordem do roteiro, em chave de parada.** Ela alimenta o mapa e a prévia de carga, e os
   * dois ranqueiam por `cidade|CEP|número`. Enquanto isto era `view.cities` — rótulo —, nada casava
   * e a planta desenhava o baú na ordem em que as notas chegaram.
   */
  const stopOrder = buildProposalStopOrder({
    documentsById: new Map(
      documents.map((document) => [
        document.id,
        {
          cityCode: document.recipientCityCode,
          number: document.recipientAddressNumber,
          postalCode: document.recipientPostalCode,
        },
      ]),
    ),
    stops: view.stops,
  })
  const cargo = useTripCargoPreview({
    driverIds: valuation?.driverId === null || valuation === null ? [] : [valuation.driverId],
    nfeDocumentIds: documentIds,
    permissions,
    stopOrder,
    vehicleId: view.vehicleId,
  })

  /**
   * ⚠️ **As notas desta viagem, na ordem do roteiro.** Sem elas o expandido mostrava cidade e
   * contagem — "SAO JOAQUIM DA BARRA · 1 nota" —, e quem confere a viagem não tinha endereço,
   * cliente nem telefone: exatamente o que o mapa da criação manual imprime ao lado de cada parada.
   */
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
          onStopUndoRemove={onUndoRemoveStop}
          order={stopOrder}
          /** Spec 110 D6: a parada marcada fica **riscada com "Desfazer"**, nunca some. */
          removedNoteIds={pendingRemovals}
          revenueLines={valuation?.valuation.revenueLines}
          selected={mapNotes}
          vehicleId={view.vehicleId}
        />
      )}

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
