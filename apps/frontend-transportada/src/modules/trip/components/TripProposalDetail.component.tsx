/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { SelectOption } from '@/components/ui/select'
import { VehicleIdentityBand } from '@/modules/fleet/components/VehicleIdentityBand.component'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import {
  formatDistance,
  formatDuration,
} from '@/modules/routing/shared/suggestionValuation.service'
import type { SuggestionVehicleValuation } from '@/modules/routing/shared/suggestionValuation.service'
import { formatWeightKilograms } from '@/modules/shared/decimalAmount.service'
import { useTripValuationPreview } from '@/modules/trip-financials/hooks/useTripValuationPreview.hook'

import { useTripCargoPreview } from '../hooks/useTripCargoPreview.hook'
import { toAssemblyMapNote } from '../shared/assemblyMapNote.service'
import type { AssemblyMapPoint } from '../shared/assemblyMap.service'
import { isSameOrder, moveCity, reconcileCityOrder } from '../shared/assemblyOrder.service'
import { sumStopWeight, type MoveTarget } from '../shared/proposalStopMove.service'
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
  /** A ordem que as setas estão montando e ninguém salvou. `null` é nenhum rascunho aberto. */
  draftOrder: null | readonly string[]
  /** Este caminhão ganhou ou perdeu parada num movimento ainda não salvo (spec 112). */
  hasDraftMove: boolean
  /** A ordem salva à mão. `null` é ninguém salvou, e vale a do roteirizador. */
  manualOrder: null | readonly string[]
  /** Para onde uma parada deste peso pode ir — só caminhão com sobra de peso na ficha. */
  moveTargetsFor: (stopWeightKilograms: null | string) => readonly MoveTarget[]
  onDiscardEdits: () => void
  onDiscardOrder: () => void
  onDraftOrderChange: (order: readonly string[]) => void
  onMoveStop: (nfeDocumentIds: readonly string[], vehicleId: string) => void
  onRemoveStop: (nfeDocumentIds: readonly string[]) => void
  onSaveEdits: () => void
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
  draftOrder,
  hasDraftMove,
  manualOrder,
  moveTargetsFor,
  onDiscardEdits,
  onDiscardOrder,
  onDraftOrderChange,
  onMoveStop,
  onRemoveStop,
  onSaveEdits,
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
  /** A salva à mão vence; sem ela, a do roteirizador. É esta que a carga, a conta e a rota medem. */
  const stopOrder =
    manualOrder === null
      ? proposedOrder
      : /** Parada que chegou por movimento depois de salva a ordem vai para o fim, como na API. */
        reconcileCityOrder({ cityCodes: proposedOrder, order: manualOrder })
  /**
   * O que a lista mostra: o rascunho, quando há. ⚠️ Ele **não** vai às prévias — carreta e conta
   * seguem a ordem salva até "Salvar ordem", e o mapa desenha o rascunho sem remedir a rota.
   */
  const displayOrder = draftOrder ?? stopOrder
  /**
   * ⚠️ Rascunho de ordem ou de movimento **pausa as três medições** — carga, conta e rota —, e elas
   * seguram o último número medido até alguém salvar. Cada toque ia ao servidor.
   */
  const isMeasurementPaused = draftOrder !== null || hasDraftMove
  const cargo = useTripCargoPreview({
    driverIds: valuation?.driverId === null || valuation === null ? [] : [valuation.driverId],
    isPaused: isMeasurementPaused,
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
    isPaused: isMeasurementPaused,
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

  /**
   * Para onde esta parada pode ir, como opções do select.
   *
   * ⚠️ Parada de endereço sem CEP utilizável **não se move**: a chave dela é o degrau `cidade:` da
   * tela, que a API ignora — o movimento sumiria no aceite sem aviso nenhum.
   */
  function resolveStopMoveOptions(point: AssemblyMapPoint): readonly SelectOption[] {
    if (point.stopKey.startsWith('cidade:')) return []
    const weight = sumStopWeight(point.notes.map((note) => note.cargoGrossWeight))
    return moveTargetsFor(weight).map((target) => ({
      label: t('proposal.moveTargetLabel', {
        ceiling: formatWeightKilograms(target.ceilingKilograms),
        load: formatWeightKilograms(target.loadKilograms),
        vehicle: target.plate ?? target.vehicleLabel ?? '',
      }),
      value: target.vehicleId,
    }))
  }

  /**
   * Seta da ficha de carga: muda a posição de **carregamento**, que é a ordem de entrega vista do
   * outro lado. ⚠️ No baú que abre só atrás (arranjo em profundidade) carregar **antes** é entregar
   * **depois** — a primeira caixa a entrar vai ao fundo. Em faixas as duas ordens andam juntas.
   *
   * O número da ficha é a posição na ordem **medida** (`stopOrder`, a que a prévia de carga recebeu);
   * a troca entra no rascunho, como as setas do mapa, e só "Salvar alterações" refaz o desenho.
   */
  function handleLoadingMove(stopSequence: number, direction: -1 | 1): void {
    const key = stopOrder[stopSequence - 1]
    if (key === undefined) return
    const arrangement = cargo.preview?.cargoLayout?.stopArrangement ?? 'depth'
    const deliveryDirection = arrangement === 'lanes' ? direction : direction === -1 ? 1 : -1
    handleOrderChange(moveCity({ code: key, direction: deliveryDirection, order: displayOrder }))
  }

  function handleOrderChange(order: readonly string[]): void {
    /** Voltar à ordem salva não é rascunho: a faixa de "não salva" se apaga, e nada precisa ser medido. */
    if (isSameOrder(order, stopOrder)) onDiscardOrder()
    else onDraftOrderChange(order)
  }

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
        ⚠️ **As setas trocam de lugar na tela; quem mede é "Salvar ordem".** Cada troca refazia três
        consultas — a conta, a carreta e a rota do mapa, as duas últimas no OSRM. Hoje o rascunho só
        reordena a lista, e salvar mede uma vez: o caminho novo, o pedágio dele e a arrumação do baú.
        Remover parada continua sendo outra coisa — ela muda o maço, e pede o recálculo da proposta.
      */}
      {!isMeasurementPaused ? null : (
        <p className={styles.proposalEditedBanner} role="status">
          <Icon aria-hidden="true" name="alert" />
          <span>{t('proposal.orderDraftNotice')}</span>
          <Button onClick={onSaveEdits} size="sm" type="button" variant="secondary">
            <Icon name="refresh" />
            {t('proposal.saveOrder')}
          </Button>
          <Button onClick={onDiscardEdits} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('proposal.discardOrder')}
          </Button>
        </p>
      )}
      {mapNotes.length === 0 ? null : (
        <TripAssemblyMap
          isMeasurementPaused={isMeasurementPaused}
          measuredOrder={stopOrder}
          nearby={[]}
          onOrderChange={handleOrderChange}
          onStopMove={onMoveStop}
          onStopRemove={onRemoveStop}
          onStopUndoRemove={onUndoRemoveStop}
          order={displayOrder}
          /** Spec 110 D6: a parada marcada fica **riscada com "Desfazer"**, nunca some. */
          removedNoteIds={pendingRemovals}
          resolveMoveTargets={resolveStopMoveOptions}
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
          onLoadingMove={handleLoadingMove}
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
