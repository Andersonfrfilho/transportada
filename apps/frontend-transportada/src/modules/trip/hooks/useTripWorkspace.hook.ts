/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { DeliveryProof } from '../shared/deliveryProof.service'
import type { RouteGeometry } from '../shared/routeGeometry.service'
import type { OccurrenceType } from '../shared/occurrence.constant'
import type {
  RegisteredOccurrence,
  TripDocumentProduct,
  TripOccurrence,
} from '../shared/trip.types'
import { resolveTripRefetchInterval } from '../shared/tripPolling.service'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import {
  CTE_SUBMIT_PERMISSION,
  MDFE_MANAGE_PERMISSION,
  TRIP_MANAGE_PERMISSION,
  TRIP_ON_THE_ROAD_REFETCH_MS,
  TRIP_QUERY_KEY,
  TRIP_READ_PERMISSION,
} from '../shared/trip.constant'
import type {
  BatchStatusInput,
  BatchStatusResult,
  CancelTripResult,
  CreateTripBody,
  DeliveryAddressHistoryInput,
  DeliveryAddressOverride,
  DispatchTripInput,
  DispatchTripResult,
  FindNfeDocumentByAccessKeyInput,
  LinkTripDocumentInput,
  OverrideDeliveryAddressInput,
  PlanTripRouteResult,
  ReorderTripStopsInput,
  ReorderTripStopsResult,
  ScannedNfeDocument,
  TripFiscalReadiness,
  TransitionTripDocumentInput,
  TransitionTripDocumentResult,
  TripDetail,
  TripDocument,
  SetTripMdfeRequirementInput,
  TripCteBatchResult,
  TripDocumentActionInput,
  TripMdfeRequirement,
} from '../shared/trip.types'
import { createTripClient, type TripClient } from '../shared/tripClient.service'

export type TripController = Readonly<{
  batchStatus: (input: BatchStatusInput) => Promise<BatchStatusResult>
  cancelTrip: (input: Readonly<{ tripId: string }>) => Promise<CancelTripResult>
  canManageTrips: boolean
  canReadTrips: boolean
  canManageMdfe: boolean
  canSubmitCte: boolean
  closeTrip: (input: Readonly<{ tripId: string }>) => Promise<TripDetail>
  createTrip: (input: CreateTripBody) => Promise<TripDetail>
  createTripCteBatch: (
    input: Readonly<{ tripDocumentIds?: readonly string[]; tripId: string }>,
  ) => Promise<TripCteBatchResult>
  deliverTripDocument: (input: TripDocumentActionInput) => Promise<TransitionTripDocumentResult>
  readDeliveryProofs: (input: TripDocumentActionInput) => Promise<readonly DeliveryProof[]>
  readRouteGeometry: (input: Readonly<{ tripId: string }>) => Promise<RouteGeometry>
  readTripOccurrences: (input: TripDocumentActionInput) => Promise<readonly TripOccurrence[]>
  correctGeocodedAddress: (
    input: Readonly<{ addressKey: string; latitude: string; longitude: string }>,
  ) => Promise<void>
  listOccurrenceTypes: () => Promise<readonly OccurrenceType[]>
  saveOccurrenceType: (
    input: Readonly<{
      active: boolean
      name: string
      notifies: boolean
      occurrenceTypeId: null | string
      stage: 'delivery' | 'separation'
    }>,
  ) => Promise<OccurrenceType>
  registerTripOccurrence: (
    input: TripDocumentActionInput & {
      readonly note: string
      readonly occurrenceTypeId: string
      readonly productCode: string
    },
  ) => Promise<RegisteredOccurrence>
  readTripDocumentProducts: (
    input: TripDocumentActionInput,
  ) => Promise<readonly TripDocumentProduct[]>
  dispatchTrip: (input: DispatchTripInput) => Promise<DispatchTripResult>
  findNfeDocumentByAccessKey: (
    input: FindNfeDocumentByAccessKeyInput,
  ) => Promise<null | ScannedNfeDocument>
  getTrip: (input: Readonly<{ tripId: string }>) => Promise<TripDetail>
  readFiscalReadiness: (input: Readonly<{ tripId: string }>) => Promise<TripFiscalReadiness>
  setTripMdfeRequirement: (input: SetTripMdfeRequirementInput) => Promise<TripMdfeRequirement>
  linkTripDocument: (input: LinkTripDocumentInput) => Promise<TripDocument>
  listDeliveryAddressHistory: (
    input: DeliveryAddressHistoryInput,
  ) => Promise<readonly DeliveryAddressOverride[]>
  overrideDeliveryAddress: (input: OverrideDeliveryAddressInput) => Promise<DeliveryAddressOverride>
  planTripRoute: (input: Readonly<{ tripId: string }>) => Promise<PlanTripRouteResult>
  releaseTripDocument: (input: TripDocumentActionInput) => Promise<TripDocument>
  reorderTripStops: (input: ReorderTripStopsInput) => Promise<ReorderTripStopsResult>
  transitionTripDocument: (
    input: TransitionTripDocumentInput,
  ) => Promise<TransitionTripDocumentResult>
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error('TRIP_FORBIDDEN'))
}

export function createTripController(
  input: Readonly<{ client: TripClient; permissions: readonly string[] }>,
): TripController {
  const canReadTrips = input.permissions.includes(TRIP_READ_PERMISSION)
  const canManageTrips = input.permissions.includes(TRIP_MANAGE_PERMISSION)
  /** Cadastrar tipo é configuração da empresa, e configuração é `settings.manage`. */
  const canManageSettings = input.permissions.includes('settings.manage')
  const canSubmitCte = input.permissions.includes(CTE_SUBMIT_PERMISSION)
  const canManageMdfe = input.permissions.includes(MDFE_MANAGE_PERMISSION)

  return {
    batchStatus: (body) => (canManageTrips ? input.client.batchStatus(body) : forbidden()),
    cancelTrip: (body) => (canManageTrips ? input.client.cancelTrip(body) : forbidden()),
    canManageMdfe,
    canManageTrips,
    canReadTrips,
    canSubmitCte,
    closeTrip: (body) => (canManageTrips ? input.client.closeTrip(body) : forbidden()),
    createTrip: (body) => (canManageTrips ? input.client.createTrip(body) : forbidden()),
    createTripCteBatch: (body) =>
      canSubmitCte ? input.client.createTripCteBatch(body) : forbidden(),
    deliverTripDocument: (body) =>
      canManageTrips ? input.client.deliverTripDocument(body) : forbidden(),
    readDeliveryProofs: (body) =>
      canReadTrips ? input.client.readDeliveryProofs(body) : forbidden(),
    readRouteGeometry: (body) =>
      canReadTrips ? input.client.readRouteGeometry(body) : forbidden(),
    readTripOccurrences: (body) =>
      canReadTrips ? input.client.readTripOccurrences(body) : forbidden(),
    correctGeocodedAddress: (body) =>
      canManageTrips ? input.client.correctGeocodedAddress(body) : forbidden(),
    listOccurrenceTypes: () => input.client.listOccurrenceTypes(),
    saveOccurrenceType: (body) =>
      canManageSettings ? input.client.saveOccurrenceType(body) : forbidden(),
    registerTripOccurrence: (body) =>
      canManageTrips ? input.client.registerTripOccurrence(body) : forbidden(),
    readTripDocumentProducts: (body) =>
      canReadTrips ? input.client.readTripDocumentProducts(body) : forbidden(),
    dispatchTrip: (body) => (canManageTrips ? input.client.dispatchTrip(body) : forbidden()),
    findNfeDocumentByAccessKey: (query) =>
      canManageTrips ? input.client.findNfeDocumentByAccessKey(query) : forbidden(),
    getTrip: (query) => (canReadTrips ? input.client.getTrip(query) : forbidden()),
    readFiscalReadiness: (query) =>
      canReadTrips ? input.client.readFiscalReadiness(query) : forbidden(),
    setTripMdfeRequirement: (body) =>
      canManageMdfe ? input.client.setTripMdfeRequirement(body) : forbidden(),
    linkTripDocument: (body) =>
      canManageTrips ? input.client.linkTripDocument(body) : forbidden(),
    listDeliveryAddressHistory: (query) =>
      canReadTrips ? input.client.listDeliveryAddressHistory(query) : forbidden(),
    overrideDeliveryAddress: (body) =>
      canManageTrips ? input.client.overrideDeliveryAddress(body) : forbidden(),
    planTripRoute: (body) => (canManageTrips ? input.client.planTripRoute(body) : forbidden()),
    releaseTripDocument: (body) =>
      canManageTrips ? input.client.releaseTripDocument(body) : forbidden(),
    reorderTripStops: (body) =>
      canManageTrips ? input.client.reorderTripStops(body) : forbidden(),
    transitionTripDocument: (body) =>
      canManageTrips ? input.client.transitionTripDocument(body) : forbidden(),
  }
}

export function getTripClient(): TripClient {
  return createTripClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Query desabilitada fica `isPending` para sempre no TanStack v5: sem tratar a permissão antes,
 * quem não tem `fleet.read` veria "carregando" eternamente em vez do aviso de acesso negado.
 */
export function resolveQueryStatus(
  input: Readonly<{ canRead: boolean; isError: boolean; isPending: boolean }>,
): 'error' | 'forbidden' | 'loading' | 'success' {
  if (!input.canRead) return 'forbidden'
  if (input.isError) return 'error'
  if (input.isPending) return 'loading'
  return 'success'
}

export type TripWorkspaceController = ReturnType<typeof useTripWorkspace>

export function useTripWorkspace(
  input: Readonly<{ companyId?: string; permissions: readonly string[]; tripId?: string }>,
) {
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createTripController({ client: getTripClient(), permissions })
  const queryClient = useQueryClient()
  const tripKey = [TRIP_QUERY_KEY, input.companyId, input.tripId] as const
  /** Prefixo compartilhado: invalidar `['trips']` alcança o detalhe e a tabela paginada. */
  const listKey = [TRIP_QUERY_KEY] as const

  /** Qual nota está com o comprovante aberto — `null` fecha a consulta e não busca nada. */
  const [openProofDocumentId, setOpenProofDocumentId] = useState<null | string>(null)

  const tripQuery = useQuery({
    enabled: controller.canReadTrips && input.tripId !== undefined && input.tripId !== '',
    queryFn: () => controller.getTrip({ tripId: input.tripId ?? '' }),
    queryKey: tripKey,
    /**
     * Spec 057 P2: o escritório vê a viagem andar sem apertar nada — e só enquanto ela está na rua.
     * Repetir a consulta numa viagem em rascunho seria bater no servidor por nada; um WebSocket
     * novo, um trilho inteiro por uma tela que atualiza a cada meio minuto.
     */
    /**
     * Spec 079: **duas condições, não uma.** A regra da 057 olhava só o estado da viagem, e uma
     * viagem despachada com tudo entregue seguia batendo no servidor para sempre.
     */
    refetchInterval: (query) =>
      resolveTripRefetchInterval({
        documents: query.state.data?.documents ?? [],
        status: query.state.data?.status,
      }),
  })

  /**
   * Spec 059 D1: a prontidão é **consulta**, e ela acompanha o mesmo relógio da viagem na rua — o
   * CT-e que autoriza enquanto o operador olha a tela acende o painel sem ele apertar nada.
   */
  /**
   * O comprovante é buscado **só quando o painel abre**: a URL assinada expira em cinco minutos, e
   * carregá-la para todas as notas da viagem produziria uma dezena de links já vencidos quando
   * alguém finalmente clicasse num deles.
   */
  /**
   * Spec 079: a linha da estrada. Consulta **própria**, e não um campo do detalhe — a chamada ao
   * OSRM custou 63 ms medidos, e o detalhe é a leitura que abre a tela inteira. O mapa desenha as
   * paradas primeiro e engrossa a linha depois; falha aqui deixa a reta tracejada, nunca a tela.
   */
  const routeGeometryQuery = useQuery({
    enabled: controller.canReadTrips && input.tripId !== undefined && input.tripId !== '',
    queryFn: () => controller.readRouteGeometry({ tripId: input.tripId ?? '' }),
    queryKey: [...tripKey, 'route-geometry'] as const,
  })

  const deliveryProofsQuery = useQuery({
    enabled: openProofDocumentId !== null && input.tripId !== undefined && input.tripId !== '',
    queryFn: () =>
      controller.readDeliveryProofs({
        documentId: openProofDocumentId ?? '',
        tripId: input.tripId ?? '',
      }),
    queryKey: [...tripKey, 'delivery-proofs', openProofDocumentId] as const,
  })

  /** Os itens seguem o mesmo painel do comprovante: uma abertura, duas consultas, nenhuma antes. */
  const documentProductsQuery = useQuery({
    enabled: openProofDocumentId !== null && input.tripId !== undefined && input.tripId !== '',
    queryFn: () =>
      controller.readTripDocumentProducts({
        documentId: openProofDocumentId ?? '',
        tripId: input.tripId ?? '',
      }),
    queryKey: [...tripKey, 'document-products', openProofDocumentId] as const,
  })

  /** Os tipos cadastrados: o painel da nota precisa deles para oferecer a escolha. */
  const occurrenceTypesQuery = useQuery({
    enabled: controller.canReadTrips,
    queryFn: () => controller.listOccurrenceTypes(),
    queryKey: ['trip', 'occurrence-types'] as const,
  })

  const occurrencesQuery = useQuery({
    enabled: openProofDocumentId !== null && input.tripId !== undefined && input.tripId !== '',
    queryFn: () =>
      controller.readTripOccurrences({
        documentId: openProofDocumentId ?? '',
        tripId: input.tripId ?? '',
      }),
    queryKey: [...tripKey, 'occurrences', openProofDocumentId] as const,
  })

  const fiscalReadinessQuery = useQuery({
    enabled:
      controller.canReadTrips &&
      input.tripId !== undefined &&
      input.tripId !== '' &&
      (tripQuery.data?.documents.length ?? 0) > 0,
    queryFn: () => controller.readFiscalReadiness({ tripId: input.tripId ?? '' }),
    queryKey: [...tripKey, 'fiscal-readiness'] as const,
    refetchInterval: (query) =>
      query.state.data?.state === 'incomplete' ? TRIP_ON_THE_ROAD_REFETCH_MS : false,
  })

  function invalidate(): Promise<void> {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: tripKey }),
      queryClient.invalidateQueries({ queryKey: listKey }),
    ]).then(() => undefined)
  }

  /** Prender e soltar a nota numa viagem mexe no vínculo dela: o alcance mora no registro. */
  async function invalidateDocumentLink(): Promise<void> {
    await invalidate()
    await invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
  }

  const createMutation = useMutation({ mutationFn: controller.createTrip, onSuccess: invalidate })
  const closeMutation = useMutation({ mutationFn: controller.closeTrip, onSuccess: invalidate })
  const linkDocumentMutation = useMutation({
    mutationFn: controller.linkTripDocument,
    onSuccess: invalidateDocumentLink,
  })
  /**
   * A ocorrência **só anota**: nada de invalidar a viagem inteira, porque o estado da nota não
   * mudou. Invalidar a chave da viagem aqui daria a impressão de que ela muda alguma coisa.
   */
  const registerOccurrenceMutation = useMutation({
    mutationFn: controller.registerTripOccurrence,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...tripKey, 'occurrences', openProofDocumentId],
      })
    },
  })

  /**
   * ⚠️ Corrigir o ponto muda o **endereço**, não a viagem — mas a viagem lê a coordenada dele para
   * desenhar o mapa, então a chave da viagem é invalidada para o pino andar sem recarregar a página.
   */
  const correctAddressMutation = useMutation({
    mutationFn: controller.correctGeocodedAddress,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tripKey })
    },
  })

  const deliverDocumentMutation = useMutation({
    mutationFn: controller.deliverTripDocument,
    onSuccess: invalidate,
  })
  const releaseDocumentMutation = useMutation({
    mutationFn: controller.releaseTripDocument,
    onSuccess: invalidateDocumentLink,
  })
  const reorderStopsMutation = useMutation({
    mutationFn: controller.reorderTripStops,
    onSuccess: invalidate,
  })
  const overrideDeliveryAddressMutation = useMutation({
    mutationFn: controller.overrideDeliveryAddress,
    onSuccess: invalidate,
  })
  const transitionDocumentMutation = useMutation({
    mutationFn: controller.transitionTripDocument,
    onSuccess: invalidate,
  })
  const batchStatusMutation = useMutation({
    mutationFn: controller.batchStatus,
    onSuccess: invalidate,
  })
  const dispatchMutation = useMutation({
    mutationFn: controller.dispatchTrip,
    onSuccess: invalidate,
  })
  const cancelMutation = useMutation({ mutationFn: controller.cancelTrip, onSuccess: invalidate })
  /**
   * Spec 065 D4bis: o lote urgente. Invalida a viagem **e** a prontidão — o que muda é o estado
   * fiscal das notas, e é ele que o painel mostra.
   */
  const createCteBatchMutation = useMutation({
    mutationFn: controller.createTripCteBatch,
    onSuccess: invalidate,
  })
  /**
   * Spec 065 D4c: mudar a exigência muda o que o portão do manifesto responde, e é a viagem que
   * carrega o campo — por isso invalida a viagem, não só a prontidão.
   */
  const setMdfeRequirementMutation = useMutation({
    mutationFn: controller.setTripMdfeRequirement,
    onSuccess: invalidate,
  })
  const planRouteMutation = useMutation({
    mutationFn: controller.planTripRoute,
    onSuccess: invalidate,
  })

  return {
    batchStatusMutation,
    cancelMutation,
    closeMutation,
    controller,
    createCteBatchMutation,
    createMutation,
    correctAddressMutation,
    deliverDocumentMutation,
    deliveryProofsQuery,
    routeGeometryQuery,
    refetchTrip: () => void tripQuery.refetch(),
    documentProductsQuery,
    occurrenceTypesQuery,
    occurrencesQuery,
    registerOccurrenceMutation,
    openProofDocumentId,
    setOpenProofDocumentId,
    fiscalReadiness: fiscalReadinessQuery.data,
    setMdfeRequirementMutation,
    dispatchMutation,
    linkDocumentMutation,
    overrideDeliveryAddressMutation,
    planRouteMutation,
    releaseDocumentMutation,
    reorderStopsMutation,
    transitionDocumentMutation,
    status: resolveQueryStatus({
      canRead: controller.canReadTrips,
      isError: tripQuery.isError,
      isPending: tripQuery.isPending,
    }),
    trip: tripQuery.data,
    tripQuery,
  }
}
