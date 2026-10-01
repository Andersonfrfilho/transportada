/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import { loadAvailableTripDocuments } from '../shared/availableTripDocuments.service'
import { AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY, TRIP_QUERY_KEY } from '../shared/trip.constant'

import {
  moveCity,
  reconcileCityOrder,
  resolveStopKey,
  type AssemblyCityOrder,
} from '../shared/assemblyOrder.service'
import { readDailyAllowanceDaysInput } from '../shared/dailyAllowanceDaysField.service'
import { runQuickCreateTrip } from '../shared/quickCreateTrip.service'
import type { TripAssemblyDraftScope } from '../shared/tripAssemblyDraftStorage.service'
import { useQuickCreateDraft } from './useQuickCreateDraft.hook'
import type { RouteChoice } from '../shared/routeGeometry.service'
import { resolveBoundVehicleIds } from '../shared/driverBoundVehicles.service'
import { withoutSelectedDrivers } from '../shared/tripCrewHelpers.service'
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

const NO_INITIAL_DOCUMENT_IDS: readonly string[] = []

export function useTripQuickCreate(
  input: Readonly<{
    companyId?: string
    /** Empresa e usuário do rascunho da montagem (ver `useTripAssemblyDraftLifecycle`). */
    draftScope?: TripAssemblyDraftScope | undefined
    /** Notas que a seleção da tela de NF-e mandou montar: abrem o diálogo já com a fila preenchida. */
    initialDocumentIds?: readonly string[]
    onCreated: (trip: TripDetail) => void
    permissions: readonly string[]
    selectableDriverIds: readonly string[]
    /** Spec 149 D1: os motoristas ativos com "pode atuar como ajudante" na ficha. */
    selectableHelperIds: readonly string[]
    selectableVehicleIds: readonly string[]
  }>,
) {
  const queryClient = useQueryClient()
  const initialDocumentIds = input.initialDocumentIds ?? NO_INITIAL_DOCUMENT_IDS
  /** Quem chegou da seleção de notas não precisa clicar de novo no botão que ele acabou de clicar. */
  const [isOpen, setIsOpen] = useState(initialDocumentIds.length > 0)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [queue, setQueue] = useState<TripQuickCreateQueue>(EMPTY_QUICK_CREATE_QUEUE)
  const [driverIds, setDriverIds] = useState<readonly string[]>([])
  const [helperIds, setHelperIds] = useState<readonly string[]>([])
  const [vehicleId, setVehicleId] = useState('')
  /** `undefined` é "ninguém digitou ainda", e é o que deixa a sugestão da prévia aparecer no campo. */
  const [dailyAllowanceDaysInput, setDailyAllowanceDaysInput] = useState<string | undefined>(
    undefined,
  )
  const dailyAllowanceDaysReading = readDailyAllowanceDaysInput(dailyAllowanceDaysInput ?? '')
  const dailyAllowanceDays =
    dailyAllowanceDaysReading.of === 'informed' ? dailyAllowanceDaysReading.days : undefined
  /**
   * A ordem das cidades que o operador arranja no mapa. Ela vive aqui, e não no mapa, porque é ela
   * que vira `PATCH /stops/order` no fim da criação — no componente ela morreria ao fechar o modal.
   */
  const [cityOrder, setCityOrder] = useState<AssemblyCityOrder>([])
  /** Spec 153: a rota que o mapa da montagem mostra — a que a viagem congela ao planejar. */
  const [routeChoice, setRouteChoice] = useState<RouteChoice | undefined>(undefined)
  /** A câmera não aparece no meio da sessão: reler `navigator` a cada render não diria nada novo. */
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))
  /**
   * Duas leituras do mesmo quadro veem o mesmo estado renderizado, e o veredito de uma nota chega
   * enquanto outra ainda resolve: a fila autoritativa é a referência, não o instantâneo do render.
   */
  const queueRef = useRef<TripQuickCreateQueue>(EMPTY_QUICK_CREATE_QUEUE)

  /**
   * Este observador só liga com o modal aberto — mas a chave é a de toda a tela de viagens, e a
   * montagem automática a mantém carregada desde que a página monta. Quem abre o diálogo costuma
   * encontrar a lista pronta; o `isLoading` sobra para quem abre antes de a primeira busca voltar.
   */
  const documentsQuery = useQuery({
    enabled: isOpen,
    queryFn: loadAvailableTripDocuments,
    queryKey: AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY,
  })

  /**
   * Renova a lista no instante em que o ponteiro alcança o botão, antes do clique. A carga inicial
   * da tela já a trouxe; o que este adiantamento cobre é a tela aberta há tempo — passado o
   * `staleTime`, a espera voltaria a cair sobre o clique.
   *
   * O mesmo `staleTime` segura a repetição: passar o mouse dez vezes busca uma.
   */
  function prefetchDocuments(): void {
    void queryClient.prefetchQuery({
      queryFn: loadAvailableTripDocuments,
      queryKey: AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY,
    })
  }

  function updateQueue(next: TripQuickCreateQueue): void {
    queueRef.current = next
    setQueue(next)
  }

  /**
   * A fila só aceita nota carregada, e a lista chega depois do primeiro render: o enfileiramento
   * espera a busca voltar. Uma vez só — quem tirar uma nota da fila não a vê voltar no render
   * seguinte.
   */
  const hasStagedInitialRef = useRef(false)
  useEffect(() => {
    if (hasStagedInitialRef.current || initialDocumentIds.length === 0) return
    const documents = (documentsQuery.data ?? []).filter((document) =>
      initialDocumentIds.includes(document.id),
    )
    if (documents.length === 0) return
    hasStagedInitialRef.current = true
    updateQueue(stageQuickCreateDocuments({ documents, queue: queueRef.current }))
  }, [documentsQuery.data, initialDocumentIds])

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
    setRouteChoice(undefined)
    updateQueue(EMPTY_QUICK_CREATE_QUEUE)
    setDriverIds([])
    setHelperIds([])
    setVehicleId('')
    setDailyAllowanceDaysInput(undefined)
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
        cityCodes: staged.map((document) =>
          resolveStopKey({
            cityCode: document.recipientCityCode,
            number: document.recipientAddressNumber,
            postalCode: document.recipientPostalCode,
          }),
        ),
        order: current,
      }),
    )
  }, [staged])

  const draftStore = useQuickCreateDraft({
    form: {
      cityOrder,
      dailyAllowanceDaysInput,
      driverIds,
      helperIds,
      isOpen,
      queue,
      routeChoice,
      vehicleId,
    },
    onApply: (restored) => {
      updateQueue(
        stageQuickCreateDocuments({
          documents: restored.documents,
          queue: EMPTY_QUICK_CREATE_QUEUE,
        }),
      )
      setCityOrder(restored.cityOrder)
      setDriverIds(restored.driverIds)
      setHelperIds(restored.helperIds)
      setVehicleId(restored.vehicleId)
      setDailyAllowanceDaysInput(restored.dailyAllowanceDaysInput)
      setRouteChoice(restored.routeChoice)
      setIsOpen(restored.isOpen)
    },
    onReset: () => {
      setIsOpen(false)
      reset()
    },
    scope: input.draftScope,
    selectableDriverIds: input.selectableDriverIds,
    selectableHelperIds: input.selectableHelperIds,
    selectableVehicleIds: input.selectableVehicleIds,
  })

  /** Mexer é decidir: a restauração a caminho não aplica por cima, e o aviso da volta sai. */
  function touch(): void {
    draftStore.markTouched()
    draftStore.dismissNotice()
  }

  const issues = validateQuickCreate({
    dailyAllowanceDays: dailyAllowanceDaysReading,
    driverIds,
    helperIds,
    path: 'singleClick',
    queue,
    vehicleId,
  })
  /** Spec 217 (RF1/D5): "Salvar rascunho" só exige nota — a viagem pode nascer sem tripulação. */
  const draftIssues = validateQuickCreate({
    dailyAllowanceDays: dailyAllowanceDaysReading,
    driverIds,
    helperIds,
    path: 'draft',
    queue,
    vehicleId,
  })

  /**
   * A viagem e os vínculos são um passo só do ponto de vista de quem clica, mas não são atômicos no
   * servidor: depois de criada, a viagem é o destino do operador mesmo que um passo seguinte falhe
   * (`runQuickCreateTrip`). Desfazer aqui apagaria trabalho que já é válido.
   */
  const createMutation = useMutation({
    /**
     * Spec 217 (RF1/D5): `asDraft` decide se o quarto passo (planejar rota) roda. É a mesma
     * sequência para os dois botões — "Salvar rascunho" só passa o parâmetro adiante.
     */
    mutationFn: (variables: Readonly<{ asDraft: boolean }>): Promise<TripDetail> =>
      runQuickCreateTrip({
        cityOrder,
        client: getTripClient(),
        createBody: {
          /** Spec 143 D4: ausente sugere pela duração — nunca `dailyAllowanceDays: undefined`. */
          ...(dailyAllowanceDays === undefined ? {} : { dailyAllowanceDays }),
          driverIds,
          /** Spec 149: vazio fica fora do corpo — a viagem sem ajudante continua a de antes. */
          ...(helperIds.length === 0 ? {} : { helperIds }),
          /** Spec 217 (RF1/RF2): vazio é o rascunho sem veículo — nunca uma string vazia no corpo. */
          ...(vehicleId === '' ? {} : { vehicleId }),
        },
        nfeDocumentIds: stagedDocumentIds(queueRef.current),
        planRoute: !variables.asDraft,
        ...(routeChoice === undefined ? {} : { routeChoice }),
      }),
    onSuccess: (trip) => {
      void invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
      void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY] })
      setIsOpen(false)
      reset()
      draftStore.clear()
      input.onCreated(trip)
    },
  })

  return {
    bindings,
    cityOrder,
    moveCityUp: (code: string) => setCityOrder(moveCity({ code, direction: -1, order: cityOrder })),
    setCityOrder: (order: AssemblyCityOrder) => {
      draftStore.markTouched()
      setCityOrder(order)
    },
    setRouteChoice,
    stagedDocuments: staged,
    availableDocuments: documentsQuery.data ?? [],
    documentsQuery,
    acceptScan: (text: string) => {
      touch()
      acceptScan(text)
    },
    canScan,
    /** Cancelar guarda o rascunho; "Limpar rascunho" é o único caminho que o apaga antes de criar. */
    close: () => {
      draftStore.dismissNotice()
      setIsOpen(false)
    },
    discardDraft: () => {
      setIsOpen(false)
      reset()
      draftStore.clear()
    },
    draftStore,
    hasDraft: draftStore.hasDraft,
    routeChoice,
    closeScanner: () => setIsScannerOpen(false),
    createMutation,
    dailyAllowanceDays,
    dailyAllowanceDaysInput,
    draftIssues,
    driverIds,
    helperIds,
    isOpen,
    isScannerOpen,
    issues,
    open: () => setIsOpen(true),
    prefetchDocuments,
    openScanner: () => setIsScannerOpen(true),
    queue,
    stageDocuments: (documents: readonly ScannedNfeDocument[]) => {
      touch()
      updateQueue(stageQuickCreateDocuments({ documents, queue: queueRef.current }))
    },
    removeEntry: (accessKey: string) => {
      touch()
      updateQueue(removeQuickCreateEntry({ accessKey, queue: queueRef.current }))
    },
    reset,
    setDailyAllowanceDaysInput: (value: string) => {
      draftStore.markTouched()
      setDailyAllowanceDaysInput(value)
    },
    setDriverIds: (ids: readonly string[]) => {
      draftStore.markTouched()
      setDriverIds(ids)
      /** Quem passa a dirigir deixa de ser ajudante: a mesma pessoa não ocupa dois lugares. */
      setHelperIds((current) => withoutSelectedDrivers({ driverIds: ids, helperIds: current }))
    },
    setHelperIds: (ids: readonly string[]) => {
      draftStore.markTouched()
      setHelperIds(ids)
    },
    setVehicleId: (id: string) => {
      draftStore.markTouched()
      setVehicleId(id)
    },
    stagedCount: stagedDocumentIds(queue).length,
    vehicleId,
  }
}
