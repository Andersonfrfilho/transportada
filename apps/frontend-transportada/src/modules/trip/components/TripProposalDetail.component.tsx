/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { VehicleIdentityBand } from '@/modules/fleet/components/VehicleIdentityBand.component'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import {
  formatDistance,
  formatDuration,
} from '@/modules/routing/shared/suggestionValuation.service'
import type { SuggestionVehicleValuation } from '@/modules/routing/shared/suggestionValuation.service'
import { useTripValuationPreview } from '@/modules/trip-financials/hooks/useTripValuationPreview.hook'

import { useTripCargoPreview } from '../hooks/useTripCargoPreview.hook'
import { toAssemblyMapNote } from '../shared/assemblyMapNote.service'
import { buildProposalStopOrder, type ProposalVehicleView } from '../shared/proposalView.service'
import type { TripCandidateDocument } from '../shared/trip.types'
import { TripAssemblyMap } from './TripAssemblyMap.component'
import { TripValuationPreview } from './TripValuationPreview.component'
import { TripCargoPanel } from './TripCargoPanel.component'
import styles from '../styles/trip.module.css'

type TripProposalDetailProps = Readonly<{
  /**
   * O maço que gerou a proposta. ⚠️ Ele é a **única** fonte de endereço, destinatário e telefone
   * aqui: a parada que a API manda tem `label` (a cidade) e os ids das notas, e nada mais — quem
   * sabe onde o caminhão encosta é a nota, que a tela já carregou para montar o pedido.
   */
  documents: readonly TripCandidateDocument[]
  /** A ordem escolhida à mão para esta viagem. `null` é ninguém mexeu, e vale a do roteirizador. */
  manualOrder: null | readonly string[]
  onOrderChange: (order: readonly string[]) => void
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
  manualOrder,
  onOrderChange,
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
  const proposedOrder = buildProposalStopOrder({
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
  /** A escolhida à mão vence; sem ela, a do roteirizador. É esta que o mapa, a carga e a conta leem. */
  const stopOrder = manualOrder ?? proposedOrder
  const cargo = useTripCargoPreview({
    driverIds: valuation?.driverId === null || valuation === null ? [] : [valuation.driverId],
    nfeDocumentIds: documentIds,
    permissions,
    stopOrder,
    vehicleId: view.vehicleId,
  })

  /**
   * ⚠️ **A conta desta viagem sai da mesma rota que o mapa desenha** — a prévia da criação manual,
   * alimentada pela mesma ordem. Ela era a conta da sugestão, medida na matriz do solver: sem os
   * nós do OSRM, e por isso sem pedágio, enquanto o mapa logo acima já imprimia o pedágio da rota.
   * Duas contas na mesma tela, e só a de baixo mentia. Reordenar recalcula as duas juntas.
   */
  const valuationPreview = useTripValuationPreview({
    driverIds: valuation === null || valuation.driverId === null ? [] : [valuation.driverId],
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
          /**
           * ⚠️ Tempo e rodagem são **do roteirizador**, na ordem dele. Com a ordem trocada à mão eles
           * descreveriam outro caminho — saem daqui, e o mapa abaixo mede a ordem nova e os imprime.
           */
          ...(manualOrder === null
            ? [
                {
                  label: t('proposal.time'),
                  value: formatDuration(view.durationSeconds) ?? t('proposal.unknown'),
                },
                {
                  label: t('proposal.totalDistance'),
                  value: formatDistance(view.distanceMeters) ?? t('proposal.unknown'),
                },
              ]
            : []),
        ]}
        label={view.vehicleLabel}
        plate={view.plate}
        specification={describeVehicle(vehicle)}
        vehicleType={view.vehicleType}
      />

      {/*
        ⚠️ **As setas reordenam e recalculam.** A D6 da spec 110 as recusou porque a conta ao lado
        era a do roteirizador e não acompanharia a ordem nova. Hoje a conta é a prévia desta viagem,
        alimentada pela mesma `stopOrder` do mapa e da carga: reordenar mede o caminho novo, o
        pedágio dele e a arrumação do baú. Remover parada continua sendo outra coisa — ela muda o
        maço, e o aceite fica travado até o recálculo da proposta.
      */}
      {mapNotes.length === 0 ? null : (
        <TripAssemblyMap
          nearby={[]}
          onOrderChange={onOrderChange}
          onStopRemove={onRemoveStop}
          onStopUndoRemove={onUndoRemoveStop}
          order={stopOrder}
          /** Spec 110 D6: a parada marcada fica **riscada com "Desfazer"**, nunca some. */
          removedNoteIds={pendingRemovals}
          revenueLines={valuationPreview.valuation?.revenueLines}
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
        <TripValuationPreview preview={valuationPreview} />
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
