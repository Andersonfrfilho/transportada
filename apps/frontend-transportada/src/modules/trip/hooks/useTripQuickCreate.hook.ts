/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import { loadAvailableTripDocuments } from '../shared/availableTripDocuments.service'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import { buildStopAddressKey } from '../shared/stopAddressKey.service'
import {
  moveCity,
  reconcileCityOrder,
  resolveStopOrder,
  type AssemblyCityOrder,
} from '../shared/assemblyOrder.service'
import { resolveBoundVehicleIds } from '../shared/driverBoundVehicles.service'
import { useDriverVehicleBindings } from './useDriverVehicleBindings.hook'
import type { ScannedNfeDocument, TripDetail } from '../shared/trip.types'
import {
  acceptQuickCreateScan,
  EMPTY_QUICK_CREATE_QUEUE,
  refuseQuickCreateEntry,
  removeQuickCreateEntry,
  resolveQuickCreateEntry,
  stageQuickCreateDocuments,
  stagedDocumentIds,
  stagedDocuments,
  validateQuickCreate,
  type TripQuickCreateQueue,
} from '../shared/tripQuickCreate.service'
import { getTripClient } from './useTripWorkspace.hook'

export type TripQuickCreateController = ReturnType<typeof useTripQuickCreate>

export function useTripQuickCreate(
  input: Readonly<{
    companyId?: string
    onCreated: (trip: TripDetail) => void
    permissions: readonly string[]
    selectableDriverIds: readonly string[]
    selectableVehicleIds: readonly string[]
  }>,
) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [queue, setQueue] = useState<TripQuickCreateQueue>(EMPTY_QUICK_CREATE_QUEUE)
  const [driverIds, setDriverIds] = useState<readonly string[]>([])
  const [vehicleId, setVehicleId] = useState('')
  /**
   * A ordem das cidades que o operador arranja no mapa. Ela vive aqui, e não no mapa, porque é ela
   * que vira `PATCH /stops/order` no fim da criação — no componente ela morreria ao fechar o modal.
   */
  const [cityOrder, setCityOrder] = useState<AssemblyCityOrder>([])
  /** A câmera não aparece no meio da sessão: reler `navigator` a cada render não diria nada novo. */
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))
  /**
   * Duas leituras do mesmo quadro veem o mesmo estado renderizado, e o veredito de uma nota chega
   * enquanto outra ainda resolve: a fila autoritativa é a referência, não o instantâneo do render.
   */
  const queueRef = useRef<TripQuickCreateQueue>(EMPTY_QUICK_CREATE_QUEUE)

  /** Só busca quando o modal abre: a lista inteira de notas não se carrega para uma tela fechada. */
  const documentsQuery = useQuery({
    enabled: isOpen,
    queryFn: loadAvailableTripDocuments,
    queryKey: [TRIP_QUERY_KEY, 'quick-create', 'documents'],
  })

  function updateQueue(next: TripQuickCreateQueue): void {
    queueRef.current = next
    setQueue(next)
  }

  async function lookupAccessKey(accessKey: string): Promise<void> {
    try {
      const document = await getTripClient().findNfeDocumentByAccessKey({ accessKey })
      updateQueue(resolveQuickCreateEntry({ accessKey, document, queue: queueRef.current }))
    } catch {
      updateQueue(
        refuseQuickCreateEntry({ accessKey, queue: queueRef.current, refusal: 'lookupFailed' }),
      )
    }
  }

  /** A câmera fica aberta entre leituras: confirmar nota a nota mata o ritmo de quem separa. */
  function acceptScan(text: string): void {
    const acceptance = acceptQuickCreateScan({ queue: queueRef.current, text })
    if (acceptance.accessKey === undefined) return
    updateQueue(acceptance.queue)
    void lookupAccessKey(acceptance.accessKey)
  }

  function reset(): void {
    setCityOrder([])
    updateQueue(EMPTY_QUICK_CREATE_QUEUE)
    setDriverIds([])
    setVehicleId('')
  }

  /**
   * O veículo do agregado vem junto com ele, e o vínculo é buscado **antes** da escolha — o mesmo
   * caminho do outro modal. Antes daqui a consulta só disparava depois do clique, e o campo ficava
   * vazio por segundos: tempo suficiente para o operador concluir que a tela não faz isso.
   */
  const bindings = useDriverVehicleBindings({
    enabled: input.permissions.length > 0,
    selectableDriverIds: input.selectableDriverIds,
    selectedDriverIds: driverIds,
  })
  const boundVehicleIds = resolveBoundVehicleIds({
    bindings,
    selectableVehicleIds: input.selectableVehicleIds,
    selectedDriverIds: driverIds,
  })
  const [suggestedVehicleId] = boundVehicleIds

  useEffect(() => {
    /** Nunca por cima de escolha feita: sugerir sobre o que o operador escolheu desfaz trabalho. */
    if (vehicleId !== '' || suggestedVehicleId === undefined) return
    if (!input.selectableVehicleIds.includes(suggestedVehicleId)) return
    setVehicleId(suggestedVehicleId)
  }, [input.selectableVehicleIds, suggestedVehicleId, vehicleId])

  const staged = useMemo(() => stagedDocuments(queue), [queue])

  /**
   * A ordem converge com a fila: cidade nova entra no fim, cidade cuja última nota saiu da fila sai
   * da ordem. Recalcular do zero apagaria o arranjo a cada bipe.
   */
  useEffect(() => {
    setCityOrder((current) =>
      reconcileCityOrder({
        cityCodes: staged.flatMap((document) => [
          buildStopAddressKey({
            cityCode: document.recipientCityCode,
            number: document.recipientAddressNumber,
            postalCode: document.recipientPostalCode,
          }) ?? `cidade:${document.recipientCityCode ?? ''}`,
        ]),
        order: current,
      }),
    )
  }, [staged])

  const issues = validateQuickCreate({ driverIds, queue, vehicleId })

  /**
   * A viagem e os vínculos são um passo só do ponto de vista de quem clica, mas não são atômicos no
   * servidor: se um vínculo falhar, a viagem fica criada com o que entrou, e é isso que o operador
   * vê ao ser levado para ela. Desfazer aqui apagaria trabalho que já é válido.
   */
  const createMutation = useMutation({
    mutationFn: async (): Promise<TripDetail> => {
      const client = getTripClient()
      const trip = await client.createTrip({ driverIds, vehicleId })
      /**
       * Uma requisição para o maço inteiro. O laço de antes pagava uma ida ao servidor por nota, e
       * uma viagem de trezentas notas falhava no meio com a viagem já criada.
       */
      await client.linkTripDocumentsBatch({
        nfeDocumentIds: stagedDocumentIds(queueRef.current),
        tripId: trip.id,
      })
      await client.planTripRoute({ tripId: trip.id })
      /**
       * A ordem do mapa só pode ser aplicada **aqui**: as paradas nascem do endereço normalizado no
       * vínculo, e antes disso não existe id de parada para reordenar. Falha na reordenação não
       * desfaz a viagem — ela já é válida, e a ordem se corrige no detalhe.
       */
      const detail = await client.getTrip({ tripId: trip.id })
      const stopIds = resolveStopOrder({ order: cityOrder, stops: detail.stops })
      if (stopIds.length > 1) {
        await client.reorderTripStops({ stopIds, tripId: trip.id })
      }
      return trip
    },
    onSuccess: (trip) => {
      void invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
      void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY] })
      setIsOpen(false)
      reset()
      input.onCreated(trip)
    },
  })

  return {
    bindings,
    cityOrder,
    moveCityUp: (code: string) => setCityOrder(moveCity({ code, direction: -1, order: cityOrder })),
    setCityOrder,
    stagedDocuments: staged,
    availableDocuments: documentsQuery.data ?? [],
    documentsQuery,
    acceptScan,
    canScan,
    close: () => setIsOpen(false),
    closeScanner: () => setIsScannerOpen(false),
    createMutation,
    driverIds,
    isOpen,
    isScannerOpen,
    issues,
    open: () => setIsOpen(true),
    openScanner: () => setIsScannerOpen(true),
    queue,
    stageDocuments: (documents: readonly ScannedNfeDocument[]) =>
      updateQueue(stageQuickCreateDocuments({ documents, queue: queueRef.current })),
    removeEntry: (accessKey: string) =>
      updateQueue(removeQuickCreateEntry({ accessKey, queue: queueRef.current })),
    reset,
    setDriverIds,
    setVehicleId,
    stagedCount: stagedDocumentIds(queue).length,
    vehicleId,
  }
}
