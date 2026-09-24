/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import type { DeliveryProof } from '../shared/deliveryProof.service'
import type { RouteChoice, RouteGeometry } from '../shared/routeGeometry.service'
import type { OccurrenceRedeliveryPolicy, OccurrenceType } from '../shared/occurrence.constant'
import type { OccurrenceQuantityUnit } from '../shared/trip.constant'
import type {
  RegisteredOccurrence,
  TripDocumentProduct,
  TripOccurrence,
} from '../shared/trip.types'
import { reduceImageFileToJpeg } from '../shared/fieldDeliveryImage.service'
import {
  buildOccurrencePhotoSendState,
  hasOccurrencePhotoSendFailure,
  isSameOccurrencePhotoQueue,
  markOccurrencePhotoFailed,
  markOccurrencePhotoSending,
  markOccurrencePhotoSent,
  type OccurrencePhotoSendItem,
  resolveOccurrencePhotoIdempotencyKey,
  resolveOccurrencePhotoSendQueue,
  sendOccurrencePhotosSequentially,
} from '../shared/occurrencePhotoSend.service'
import { resolveTripRefetchInterval } from '../shared/tripPolling.service'
import {
  type CargoLayoutPendingEpisode,
  resolveCargoLayoutView,
  trackCargoLayoutPendingEpisode,
} from '../shared/cargoLayoutPolling.service'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import {
  canReadTrip,
  CTE_SUBMIT_PERMISSION,
  MDFE_MANAGE_PERMISSION,
  NFSE_ISSUE_PERMISSION,
  TRIP_MANAGE_PERMISSION,
  TRIP_ON_THE_ROAD_REFETCH_MS,
  TRIP_QUERY_KEY,
  TRIP_READ_PERMISSION,
  TRIP_REPORT_ON_BEHALF_PERMISSION,
} from '../shared/trip.constant'
import type {
  AttachFieldProofInput,
  BatchStatusInput,
  BatchStatusResult,
  CancelTripResult,
  ConfirmLoadTripInput,
  CreateTripBody,
  DeliveryAddressHistoryInput,
  DeliveryAddressOverride,
  DispatchTripInput,
  DispatchTripResult,
  FieldDeliverDocumentInput,
  FieldOccurrenceType,
  FieldReportIdResult,
  FieldReturnDocumentInput,
  FieldSettlementResult,
  FieldTripStepResult,
  FindNfeDocumentByAccessKeyInput,
  LinkTripDocumentInput,
  OverrideDeliveryAddressInput,
  PlanTripRouteResult,
  RegisterFieldOccurrencesInput,
  ReorderTripStopsInput,
  ReorderTripStopsResult,
  ReportFieldDeliveryInput,
  ReportFieldDeliveryResult,
  ReportStopArrivalInput,
  ReportStopOccurrenceInput,
  ScannedNfeDocument,
  StartFieldTripInput,
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
import { useTripAllowedActions } from './useTripAllowedActions.hook'
import { createTripClient, type TripClient } from '../shared/tripClient.service'
import { runFieldActionQueue } from '../shared/tripFieldActionQueue.service'

export type TripController = Readonly<{
  batchStatus: (input: BatchStatusInput) => Promise<BatchStatusResult>
  cancelTrip: (input: Readonly<{ tripId: string }>) => Promise<CancelTripResult>
  canManageTrips: boolean
  canReadTrips: boolean
  /**
   * Spec 156 D11: `fleet.read` propriamente dito — geometria, agendamento, prontidão fiscal e
   * produtos continuam só nele (`TRIP_READ_POLICY` no backend, nunca a variante `anyPermission`).
   * `canReadTrips` (a variante larga) abre as cinco leituras do D11; este é o recorte estrito que
   * decide se esses painéis aparecem, para o `finance` não bater 403 contra eles.
   */
  canReadTripFleetDetails: boolean
  /** Spec 156 D1: `trip.report-on-behalf` — a baixa do escritório em nome do motorista. */
  canReportOnBehalf: boolean
  canManageMdfe: boolean
  canSubmitCte: boolean
  /** Spec 175 RF7: gate próprio da linha — `nfse.issue`, a mesma que a rota de emissão exige. */
  canIssueNfse: boolean
  closeTrip: (input: Readonly<{ reason: string | null; tripId: string }>) => Promise<TripDetail>
  confirmLoadTrip: (input: ConfirmLoadTripInput) => Promise<FieldTripStepResult>
  createTrip: (input: CreateTripBody) => Promise<TripDetail>
  createTripCteBatch: (
    input: Readonly<{ tripDocumentIds?: readonly string[]; tripId: string }>,
  ) => Promise<TripCteBatchResult>
  /** Spec 156 T8b, ADR-0067: entrega com autoria, `trip.report-on-behalf`. */
  fieldDeliverDocument: (input: FieldDeliverDocumentInput) => Promise<FieldSettlementResult>
  /** Spec 156 T8b, ADR-0067: devolução com autoria, `trip.report-on-behalf`. */
  fieldReturnDocument: (input: FieldReturnDocumentInput) => Promise<FieldSettlementResult>
  readDeliveryProofs: (input: TripDocumentActionInput) => Promise<readonly DeliveryProof[]>
  readTripAllowedActions: (
    input: Readonly<{ documentIds: readonly string[]; stopIds: readonly string[]; tripId: string }>,
  ) => ReturnType<TripClient['readTripAllowedActions']>
  reportStopArrival: (input: ReportStopArrivalInput) => Promise<FieldReportIdResult>
  reportStopOccurrence: (input: ReportStopOccurrenceInput) => Promise<FieldReportIdResult>
  startFieldTrip: (input: StartFieldTripInput) => Promise<FieldTripStepResult>
  /** Spec 156 T9: `GET /trips/occurrence-types/field` — o catálogo do lote de ocorrência de nota. */
  readFieldOccurrenceTypes: () => Promise<readonly FieldOccurrenceType[]>
  /** Spec 156 T9: `POST /trips/:id/documents/field-occurrences`, uma nota ou o lote da seleção. */
  registerFieldOccurrences: (
    input: RegisterFieldOccurrencesInput,
  ) => Promise<readonly Readonly<{ documentId: string; id: string }>[]>
  /** Spec 156 T12: `POST /trips/:id/documents/:documentId/field-delivery`, uma chamada por nota. */
  reportFieldDelivery: (input: ReportFieldDeliveryInput) => Promise<ReportFieldDeliveryResult>
  /** Spec 184 D5: `POST .../field-proof` — a foto da carga sobe depois da baixa da nota. */
  attachFieldProof: (input: AttachFieldProofInput) => Promise<FieldReportIdResult>
  readRouteGeometry: (input: Readonly<{ tripId: string }>) => Promise<RouteGeometry>
  readTripOccurrences: (input: TripDocumentActionInput) => Promise<readonly TripOccurrence[]>
  correctGeocodedAddress: (
    input: Readonly<{ addressKey: string; latitude: string; longitude: string }>,
  ) => Promise<void>
  listOccurrenceTypes: () => Promise<readonly OccurrenceType[]>
  saveOccurrenceType: (
    input: Readonly<{
      active: boolean
      /** Spec 166 RF3/RF9: padrão `true` — cadastro novo continua aceitando vários itens. */
      allowsMultipleItems: boolean
      emailTemplateKey: null | string
      name: string
      notifies: boolean
      occurrenceTypeId: null | string
      /** Spec 164 RF1: conjunto completo — ausente aqui é a própria chamada regravando `unset`. */
      redeliveryPolicy: OccurrenceRedeliveryPolicy
      stage: 'delivery' | 'separation'
    }>,
  ) => Promise<OccurrenceType>
  /** Spec 161 T22 (RF29/RF31): multipart — `file` é sempre exigido, `thumbnail` é opcional. */
  registerTripOccurrence: (
    input: TripDocumentActionInput & {
      readonly file: Blob
      readonly idempotencyKey: string
      readonly note: string
      readonly occurrenceTypeId: string
      readonly productCodes: readonly string[]
      /**
       * Spec 166 RF4/RF7: alinhadas por índice a `productCodes`. Ausente ou item vazio é "sem
       * contagem" — a quantidade nunca é obrigatória.
       */
      readonly productQuantities?: readonly (null | string)[]
      readonly productQuantityUnits?: readonly (null | OccurrenceQuantityUnit)[]
      readonly thumbnail?: Blob
    },
  ) => Promise<RegisteredOccurrence>
  /** Spec 161 T22 (RF6/RF31): a 2ª a 5ª foto de uma ocorrência já registrada. */
  attachOccurrencePhoto: (
    input: TripDocumentActionInput & {
      readonly file: Blob
      readonly idempotencyKey: string
      readonly occurrenceId: string
      readonly thumbnail?: Blob
    },
  ) => Promise<Readonly<{ id: string; position: number }>>
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
  /** Spec 178 RF2: a troca de critério manda `routeChoice` — ausente segue o default do servidor. */
  planTripRoute: (
    input: Readonly<{ routeChoice?: RouteChoice; tripId: string }>,
  ) => Promise<PlanTripRouteResult>
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
  const canReadTrips = canReadTrip(input.permissions)
  const canReadTripFleetDetails = input.permissions.includes(TRIP_READ_PERMISSION)
  const canManageTrips = input.permissions.includes(TRIP_MANAGE_PERMISSION)
  const canReportOnBehalf = input.permissions.includes(TRIP_REPORT_ON_BEHALF_PERMISSION)
  /** Cadastrar tipo é configuração da empresa, e configuração é `settings.manage`. */
  const canManageSettings = input.permissions.includes('settings.manage')
  const canSubmitCte = input.permissions.includes(CTE_SUBMIT_PERMISSION)
  const canManageMdfe = input.permissions.includes(MDFE_MANAGE_PERMISSION)
  const canIssueNfse = input.permissions.includes(NFSE_ISSUE_PERMISSION)

  return {
    batchStatus: (body) => (canManageTrips ? input.client.batchStatus(body) : forbidden()),
    cancelTrip: (body) => (canManageTrips ? input.client.cancelTrip(body) : forbidden()),
    canIssueNfse,
    canManageMdfe,
    canManageTrips,
    canReadTripFleetDetails,
    canReadTrips,
    canReportOnBehalf,
    canSubmitCte,
    // Spec 156 T8c (ADR-0067): encerrar deixou de ser `trip.manage` — é o escritório que confirma.
    closeTrip: (body) => (canReportOnBehalf ? input.client.closeTrip(body) : forbidden()),
    confirmLoadTrip: (body) =>
      canReportOnBehalf ? input.client.confirmLoadTrip(body) : forbidden(),
    createTrip: (body) => (canManageTrips ? input.client.createTrip(body) : forbidden()),
    createTripCteBatch: (body) =>
      canSubmitCte ? input.client.createTripCteBatch(body) : forbidden(),
    fieldDeliverDocument: (body) =>
      canReportOnBehalf ? input.client.fieldDeliverDocument(body) : forbidden(),
    fieldReturnDocument: (body) =>
      canReportOnBehalf ? input.client.fieldReturnDocument(body) : forbidden(),
    readDeliveryProofs: (body) =>
      canReadTrips ? input.client.readDeliveryProofs(body) : forbidden(),
    readTripAllowedActions: (body) =>
      canReadTrips ? input.client.readTripAllowedActions(body) : forbidden(),
    reportStopArrival: (body) =>
      canReportOnBehalf ? input.client.reportStopArrival(body) : forbidden(),
    reportStopOccurrence: (body) =>
      canReportOnBehalf ? input.client.reportStopOccurrence(body) : forbidden(),
    startFieldTrip: (body) => (canReportOnBehalf ? input.client.startFieldTrip(body) : forbidden()),
    readFieldOccurrenceTypes: () =>
      canReportOnBehalf ? input.client.readFieldOccurrenceTypes() : forbidden(),
    registerFieldOccurrences: (body) =>
      canReportOnBehalf ? input.client.registerFieldOccurrences(body) : forbidden(),
    reportFieldDelivery: (body) =>
      canReportOnBehalf ? input.client.reportFieldDelivery(body) : forbidden(),
    attachFieldProof: (body) =>
      canReportOnBehalf ? input.client.attachFieldProof(body) : forbidden(),
    readRouteGeometry: (body) =>
      canReadTripFleetDetails ? input.client.readRouteGeometry(body) : forbidden(),
    readTripOccurrences: (body) =>
      canReadTrips ? input.client.readTripOccurrences(body) : forbidden(),
    correctGeocodedAddress: (body) =>
      canManageTrips ? input.client.correctGeocodedAddress(body) : forbidden(),
    listOccurrenceTypes: () => input.client.listOccurrenceTypes(),
    saveOccurrenceType: (body) =>
      canManageSettings ? input.client.saveOccurrenceType(body) : forbidden(),
    registerTripOccurrence: (body) =>
      canManageTrips ? input.client.registerTripOccurrence(body) : forbidden(),
    attachOccurrencePhoto: (body) =>
      canManageTrips ? input.client.attachOccurrencePhoto(body) : forbidden(),
    readTripDocumentProducts: (body) =>
      canReadTripFleetDetails ? input.client.readTripDocumentProducts(body) : forbidden(),
    dispatchTrip: (body) => (canManageTrips ? input.client.dispatchTrip(body) : forbidden()),
    findNfeDocumentByAccessKey: (query) =>
      canManageTrips ? input.client.findNfeDocumentByAccessKey(query) : forbidden(),
    getTrip: (query) => (canReadTrips ? input.client.getTrip(query) : forbidden()),
    readFiscalReadiness: (query) =>
      canReadTripFleetDetails ? input.client.readFiscalReadiness(query) : forbidden(),
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
  const client = getTripClient()
  const controller = createTripController({ client, permissions })
  const queryClient = useQueryClient()
  const tripKey = [TRIP_QUERY_KEY, input.companyId, input.tripId] as const
  /** Prefixo compartilhado: invalidar `['trips']` alcança o detalhe e a tabela paginada. */
  const listKey = [TRIP_QUERY_KEY] as const

  /** Qual nota está com o comprovante aberto — `null` fecha a consulta e não busca nada. */
  const [openProofDocumentId, setOpenProofDocumentId] = useState<null | string>(null)
  /**
   * Qual nota está com o diálogo de ocorrência de separação aberto (botão da linha, sem passar
   * pelo comprovante). Mesmo padrão de `openProofDocumentId` — as consultas de ocorrência abaixo
   * usam `activeOccurrenceDocumentId`, que resolve para qualquer um dos dois painéis abertos.
   */
  const [openSeparationOccurrenceDocumentId, setOpenSeparationOccurrenceDocumentId] = useState<
    null | string
  >(null)
  const activeOccurrenceDocumentId = openProofDocumentId ?? openSeparationOccurrenceDocumentId

  /** Spec 145 D16: quando começou o `pending` atual da planta — o teto de 10 min conta daqui. */
  const [cargoLayoutEpisode, setCargoLayoutEpisode] = useState<
    CargoLayoutPendingEpisode | undefined
  >(undefined)
  const cargoLayoutKey = input.tripId ?? ''

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
    /** Spec 145 T12: a planta `pending` também faz perguntar, a cada 3 s e até o teto. */
    refetchInterval: (query) => {
      const cargoStatus = query.state.data?.cargoLayoutState?.status
      const now = query.state.dataUpdatedAt
      const episode = trackCargoLayoutPendingEpisode({
        key: cargoLayoutKey,
        now,
        previous: cargoLayoutEpisode,
        status: cargoStatus,
      })
      return resolveTripRefetchInterval({
        cargoLayout: { episode, now, status: cargoStatus },
        documents: query.state.data?.documents ?? [],
        status: query.state.data?.status,
      })
    },
  })

  const nextCargoLayoutEpisode = trackCargoLayoutPendingEpisode({
    key: cargoLayoutKey,
    now: tripQuery.dataUpdatedAt,
    previous: cargoLayoutEpisode,
    status: tripQuery.data?.cargoLayoutState?.status,
  })
  if (nextCargoLayoutEpisode !== cargoLayoutEpisode) setCargoLayoutEpisode(nextCargoLayoutEpisode)
  /** ⚠️ O relógio é o `dataUpdatedAt` da consulta: é ele que avança a cada resposta. */
  const cargoLayoutView = resolveCargoLayoutView({
    episode: nextCargoLayoutEpisode,
    layout: tripQuery.data?.cargoLayout ?? null,
    now: tripQuery.dataUpdatedAt,
    state: tripQuery.data?.cargoLayoutState,
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
    enabled:
      controller.canReadTripFleetDetails && input.tripId !== undefined && input.tripId !== '',
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

  /**
   * Os itens seguem o mesmo painel: comprovante **ou** ocorrência de separação, uma abertura, duas
   * consultas, nenhuma antes.
   */
  const documentProductsQuery = useQuery({
    enabled:
      controller.canReadTripFleetDetails &&
      activeOccurrenceDocumentId !== null &&
      input.tripId !== undefined &&
      input.tripId !== '',
    queryFn: () =>
      controller.readTripDocumentProducts({
        documentId: activeOccurrenceDocumentId ?? '',
        tripId: input.tripId ?? '',
      }),
    queryKey: [...tripKey, 'document-products', activeOccurrenceDocumentId] as const,
  })

  /** Os tipos cadastrados: o painel da nota precisa deles para oferecer a escolha. */
  const occurrenceTypesQuery = useQuery({
    enabled: controller.canReadTrips,
    queryFn: () => controller.listOccurrenceTypes(),
    queryKey: ['trip', 'occurrence-types'] as const,
  })

  const occurrencesQuery = useQuery({
    enabled:
      activeOccurrenceDocumentId !== null && input.tripId !== undefined && input.tripId !== '',
    queryFn: () =>
      controller.readTripOccurrences({
        documentId: activeOccurrenceDocumentId ?? '',
        tripId: input.tripId ?? '',
      }),
    queryKey: [...tripKey, 'occurrences', activeOccurrenceDocumentId] as const,
  })

  const fiscalReadinessQuery = useQuery({
    enabled:
      controller.canReadTripFleetDetails &&
      input.tripId !== undefined &&
      input.tripId !== '' &&
      (tripQuery.data?.documents.length ?? 0) > 0,
    queryFn: () => controller.readFiscalReadiness({ tripId: input.tripId ?? '' }),
    queryKey: [...tripKey, 'fiscal-readiness'] as const,
    refetchInterval: (query) =>
      query.state.data?.state === 'incomplete' ? TRIP_ON_THE_ROAD_REFETCH_MS : false,
  })

  /**
   * Spec 156 T8: `GET /trips/:id/allowed-actions`, em rota própria (t7-design §2.6, ressalva M1).
   *
   * ⚠️ **Spec 156 T12, achado no smoke da entrega em massa.** A chave desta consulta
   * (`useTripAllowedActions.hook.ts`) não leva `documentIds`/`stopIds`, e `parseTripAllowedActions`
   * recusa (`RESPONSE_INVALID`, fail-closed) qualquer id que não esteja na lista que ela recebeu.
   * Sem o `tripQuery.data !== undefined` aqui, as duas consultas disparam **juntas** assim que a
   * permissão chega: `documentIds`/`stopIds` ainda são `[]` (a viagem não carregou), a função que a
   * consulta chama já fica presa a esse `[]` para sempre (o padrão do app é `retry: false`, e a
   * chave não muda quando a viagem chega), e a resposta real do servidor — com os ids de verdade —
   * é sempre recusada. Reproduzido: com `allowed-actions` liberando `fieldDelivery` para 5 notas
   * reais, nenhum botão de baixa do escritório aparecia, nem por nota nem em lote, sem erro visível
   * na tela (é exatamente o "falha fechada" que o comentário do hook já previa — só que disparando
   * sempre, não só na resposta malformada). Esperar a viagem carregar antes de perguntar torna as
   * duas consultas sequenciais só nesta tela (custo aceitável: é uma consulta rápida, e closed by
   * design já tolerava não ter capacidade nenhuma até a viagem chegar).
   */
  const fieldActionCapabilities = useTripAllowedActions({
    canRead: controller.canReadTrips && tripQuery.data !== undefined,
    client,
    documentIds: tripQuery.data?.documents.map((document) => document.id) ?? [],
    stopIds: tripQuery.data?.stops.map((stop) => stop.id) ?? [],
    tripId: input.tripId,
  })

  function invalidate(): Promise<void> {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: tripKey }),
      queryClient.invalidateQueries({ queryKey: listKey }),
    ]).then(() => undefined)
  }

  /**
   * Prender e soltar a nota numa viagem mexe no vínculo dela (efeito compartilhado com NFS-e e
   * lote de CT-e) e recongela rota, pedágio, planta de carga e valuation no servidor — só esta
   * tela produz o segundo efeito.
   */
  async function invalidateDocumentLink(): Promise<void> {
    await invalidate()
    await invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
    await invalidateMutationEffect({ effect: MUTATION_EFFECT.tripCargoLink, queryClient })
  }

  /**
   * Spec 156 T12: a baixa em massa muda o estado das notas/paradas (viagem), o que pode entregar
   * (allowed-actions) e, no caso da nota já ter ocorrência registrada, a lista de ocorrências —
   * `useFieldDelivery` chama isto ao fim do lote inteiro, não a cada nota.
   */
  function invalidateFieldDeliveryEffects(): Promise<void> {
    return Promise.all([
      invalidate(),
      queryClient.invalidateQueries({ queryKey: ['trips', input.tripId, 'allowed-actions'] }),
      queryClient.invalidateQueries({ queryKey: [...tripKey, 'occurrences'] }),
    ]).then(() => undefined)
  }

  const createMutation = useMutation({ mutationFn: controller.createTrip, onSuccess: invalidate })
  const closeMutation = useMutation({ mutationFn: controller.closeTrip, onSuccess: invalidate })
  const linkDocumentMutation = useMutation({
    mutationFn: controller.linkTripDocument,
    onSuccess: invalidateDocumentLink,
  })
  /**
   * Spec 161 T22 (RF31, CA16): a foto do galpão vai **uma requisição por foto**, nunca o lote
   * inteiro — a primeira cria a ocorrência (`registerTripOccurrence`), a segunda em diante anexa
   * (`attachOccurrencePhoto`). `occurrencePhotoOccurrenceIdRef` é o que faz o reenvio depois de uma
   * falha continuar anexando à mesma ocorrência, em vez de criar uma segunda; a chave de
   * idempotência por foto (`occurrencePhotoKeysRef`) segue o mesmo molde de `resolveFieldReportKey`
   * acima — nasce na primeira tentativa e é reusada em todo reenvio da mesma foto.
   */
  const [occurrencePhotoSendState, setOccurrencePhotoSendState] = useState<
    readonly OccurrencePhotoSendItem[]
  >([])
  const [isSendingOccurrencePhotos, setIsSendingOccurrencePhotos] = useState(false)
  const [lastOccurrenceEmail, setLastOccurrenceEmail] = useState<null | Readonly<{
    body: string
    subject: string
  }>>(null)
  const occurrencePhotoKeysRef = useRef<Record<string, string>>({})
  const occurrencePhotoOccurrenceIdRef = useRef<string | undefined>(undefined)

  function resetSeparationOccurrencePhotoSend(): void {
    occurrencePhotoKeysRef.current = {}
    occurrencePhotoOccurrenceIdRef.current = undefined
    setOccurrencePhotoSendState([])
    setLastOccurrenceEmail(null)
  }

  async function sendSeparationOccurrencePhotos(
    input_: TripDocumentActionInput &
      Readonly<{
        note: string
        occurrenceTypeId: string
        photos: readonly Readonly<{
          original: Blob
          photoId: string
          thumbnail: Blob | undefined
        }>[]
        productCodes: readonly string[]
        productQuantities?: readonly (null | string)[]
        productQuantityUnits?: readonly (null | OccurrenceQuantityUnit)[]
      }>,
  ): Promise<Readonly<{ hasFailure: boolean }>> {
    const photoById = new Map(input_.photos.map((photo) => [photo.photoId, photo] as const))
    const photoIds = input_.photos.map((photo) => photo.photoId)
    /**
     * B2 (revisão spec 161): a identidade certa da fila é o **conjunto de `photoId`**, nunca o
     * comprimento — um segundo registro com o mesmo número de fotos (mas fotos diferentes) herdava
     * a fila anterior e, se ela já tinha item `sent`, o envio virava no-op silencioso.
     */
    let state = isSameOccurrencePhotoQueue(occurrencePhotoSendState, photoIds)
      ? occurrencePhotoSendState
      : buildOccurrencePhotoSendState(photoIds)
    setOccurrencePhotoSendState(state)

    function resolveKey(photoId: string): string {
      const resolved = resolveOccurrencePhotoIdempotencyKey(
        occurrencePhotoKeysRef.current,
        photoId,
        () => crypto.randomUUID(),
      )
      occurrencePhotoKeysRef.current = resolved.keys
      return resolved.key
    }

    setIsSendingOccurrencePhotos(true)
    try {
      await sendOccurrencePhotosSequentially({
        occurrenceId: occurrencePhotoOccurrenceIdRef.current,
        onFailed: (photoId, error) => {
          state = markOccurrencePhotoFailed(
            state,
            photoId,
            error instanceof Error ? error.message : String(error),
          )
          setOccurrencePhotoSendState(state)
        },
        onSending: (photoId) => {
          state = markOccurrencePhotoSending(state, photoId)
          setOccurrencePhotoSendState(state)
        },
        onSent: (photoId, occurrenceId) => {
          occurrencePhotoOccurrenceIdRef.current = occurrenceId
          state = markOccurrencePhotoSent(state, photoId)
          setOccurrencePhotoSendState(state)
        },
        photoIds: resolveOccurrencePhotoSendQueue(state),
        port: {
          attach: async ({ occurrenceId, photoId }) => {
            const photo = photoById.get(photoId)
            if (photo === undefined) throw new Error('OCCURRENCE_PHOTO_MISSING')
            await controller.attachOccurrencePhoto({
              documentId: input_.documentId,
              file: photo.original,
              idempotencyKey: resolveKey(photoId),
              occurrenceId,
              tripId: input_.tripId,
              ...(photo.thumbnail === undefined ? {} : { thumbnail: photo.thumbnail }),
            })
          },
          registerFirst: async ({ photoId }) => {
            const photo = photoById.get(photoId)
            if (photo === undefined) throw new Error('OCCURRENCE_PHOTO_MISSING')
            const registered = await controller.registerTripOccurrence({
              documentId: input_.documentId,
              file: photo.original,
              idempotencyKey: resolveKey(photoId),
              note: input_.note,
              occurrenceTypeId: input_.occurrenceTypeId,
              productCodes: input_.productCodes,
              tripId: input_.tripId,
              ...(input_.productQuantities === undefined
                ? {}
                : { productQuantities: input_.productQuantities }),
              ...(input_.productQuantityUnits === undefined
                ? {}
                : { productQuantityUnits: input_.productQuantityUnits }),
              ...(photo.thumbnail === undefined ? {} : { thumbnail: photo.thumbnail }),
            })
            setLastOccurrenceEmail(registered.email)
            return { occurrenceId: registered.id }
          },
        },
      })
    } finally {
      setIsSendingOccurrencePhotos(false)
    }

    void queryClient.invalidateQueries({
      queryKey: [...tripKey, 'occurrences', activeOccurrenceDocumentId],
    })
    void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY, 'occurrence-feed'] })

    return { hasFailure: hasOccurrencePhotoSendFailure(state) }
  }

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

  /**
   * Spec 156 T8: `Idempotency-Key` gerada por ação e reusada no retry da **mesma** ação — a chave
   * só se apaga quando a chamada termina (sucesso ou erro que não deve repetir a mesma tentativa),
   * nunca a cada clique. `mutationFn: false` na app inteira (CLAUDE.md), então "retry" aqui é o
   * usuário clicando de novo, não o TanStack tentando sozinho.
   */
  const fieldReportKeysRef = useRef<Record<string, string>>({})
  function resolveFieldReportKey(scope: string): string {
    const existing = fieldReportKeysRef.current[scope]
    if (existing !== undefined) return existing
    const key = crypto.randomUUID()
    fieldReportKeysRef.current[scope] = key
    return key
  }
  function clearFieldReportKey(scope: string): void {
    delete fieldReportKeysRef.current[scope]
  }
  /**
   * M13h (spec 156 T15): a chave só se apaga em sucesso — fechar o diálogo depois de um erro (ou
   * sem enviar) e reabri-lo para o mesmo maço de notas reusaria a mesma `Idempotency-Key` com um
   * corpo talvez diferente (outro tipo, outra observação). Fechar o diálogo é o sinal de que aquele
   * envio acabou; a próxima abertura é sempre um lote novo.
   */
  function resetFieldOccurrenceIdempotency(documentIds: readonly string[]): void {
    clearFieldReportKey(`field-occurrence:${[...documentIds].toSorted().join(',')}`)
  }

  const confirmLoadTripMutation = useMutation({
    mutationFn: controller.confirmLoadTrip,
    onSuccess: invalidate,
  })
  const startFieldTripMutation = useMutation({
    mutationFn: controller.startFieldTrip,
    onSuccess: invalidate,
  })
  const reportStopArrivalMutation = useMutation({
    mutationFn: (body: Omit<ReportStopArrivalInput, 'idempotencyKey'>) =>
      controller.reportStopArrival({
        ...body,
        idempotencyKey: resolveFieldReportKey(`arrive:${body.stopId}`),
      }),
    onSuccess: (_result, variables) => {
      clearFieldReportKey(`arrive:${variables.stopId}`)
      return invalidate()
    },
  })
  const reportStopOccurrenceMutation = useMutation({
    mutationFn: (body: Omit<ReportStopOccurrenceInput, 'idempotencyKey'>) =>
      controller.reportStopOccurrence({
        ...body,
        idempotencyKey: resolveFieldReportKey(`occurrence:${body.stopId}`),
      }),
    onSuccess: (_result, variables) => {
      clearFieldReportKey(`occurrence:${variables.stopId}`)
    },
  })

  /** Spec 156 T9: `GET /trips/occurrence-types/field` — o catálogo do lote de ocorrência de nota. */
  const fieldOccurrenceTypesQuery = useQuery({
    enabled: controller.canReportOnBehalf,
    queryFn: () => controller.readFieldOccurrenceTypes(),
    queryKey: [TRIP_QUERY_KEY, 'field-occurrence-types'] as const,
  })

  /**
   * Spec 156 T9: a chave por escopo é o mesmo lote (a lista de notas ordenada) — reusada enquanto o
   * diálogo não fecha com sucesso, do jeito que `arrive`/`occurrence` já fazem por parada.
   */
  const registerFieldOccurrencesMutation = useMutation({
    mutationFn: async (body: Omit<RegisterFieldOccurrencesInput, 'idempotencyKey'>) =>
      controller.registerFieldOccurrences({
        ...body,
        idempotencyKey: resolveFieldReportKey(
          `field-occurrence:${[...body.documentIds].toSorted().join(',')}`,
        ),
        /**
         * M7 (spec 156 T15): a foto da ocorrência ia crua para a API, sem teto de tamanho nem
         * remoção de EXIF — mesma redução da foto do canhoto (`reduceImageFileToJpeg`).
         */
        ...(body.file === undefined ? {} : { file: await reduceImageFileToJpeg(body.file) }),
      }),
    onSuccess: (_result, variables) => {
      clearFieldReportKey(`field-occurrence:${[...variables.documentIds].toSorted().join(',')}`)
      void queryClient.invalidateQueries({ queryKey: [...tripKey, 'occurrences'] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_QUERY_KEY, 'occurrence-feed'] })
    },
  })

  const fieldDeliverDocumentMutation = useMutation({
    mutationFn: (body: Omit<FieldDeliverDocumentInput, 'idempotencyKey'>) =>
      controller.fieldDeliverDocument({
        ...body,
        idempotencyKey: resolveFieldReportKey(`fieldDeliver:${body.documentId}`),
      }),
    onSuccess: (_result, variables) => {
      clearFieldReportKey(`fieldDeliver:${variables.documentId}`)
      return invalidate()
    },
  })
  const fieldReturnDocumentMutation = useMutation({
    mutationFn: (body: Omit<FieldReturnDocumentInput, 'idempotencyKey'>) =>
      controller.fieldReturnDocument({
        ...body,
        idempotencyKey: resolveFieldReportKey(`fieldReturn:${body.documentId}`),
      }),
    onSuccess: (_result, variables) => {
      clearFieldReportKey(`fieldReturn:${variables.documentId}`)
      return invalidate()
    },
  })
  /**
   * Spec 156 T8b: "Devolver" em massa dispara uma `field-return` por nota — a rota do escritório é
   * individual, não há lote com autoria. Concorrência 3, cada nota gera a própria chave (a mesma
   * função de escopo do resto do painel), e uma falha isolada não impede as outras.
   */
  const batchFieldReturnMutation = useMutation({
    mutationFn: async (body: {
      readonly documentIds: readonly string[]
      readonly driverId?: string
      readonly reason: FieldReturnDocumentInput['reason']
      readonly tripId: string
    }) =>
      runFieldActionQueue({
        concurrency: 3,
        items: body.documentIds,
        run: (documentId) =>
          controller
            .fieldReturnDocument({
              documentId,
              ...(body.driverId === undefined ? {} : { driverId: body.driverId }),
              idempotencyKey: resolveFieldReportKey(`fieldReturn:${documentId}`),
              reason: body.reason,
              tripId: body.tripId,
            })
            .then((result) => {
              clearFieldReportKey(`fieldReturn:${documentId}`)
              return result
            }),
      }),
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
    batchFieldReturnMutation,
    batchStatusMutation,
    cancelMutation,
    cargoLayoutView,
    closeMutation,
    confirmLoadTripMutation,
    controller,
    createCteBatchMutation,
    createMutation,
    correctAddressMutation,
    deliveryProofsQuery,
    fieldActionCapabilities,
    fieldDeliverDocumentMutation,
    fieldOccurrenceTypesQuery,
    fieldReturnDocumentMutation,
    registerFieldOccurrencesMutation,
    resetFieldOccurrenceIdempotency,
    invalidateFieldDeliveryEffects,
    reportStopArrivalMutation,
    reportStopOccurrenceMutation,
    routeGeometryQuery,
    startFieldTripMutation,
    refetchTrip: () => void tripQuery.refetch(),
    documentProductsQuery,
    occurrenceTypesQuery,
    occurrencesQuery,
    isSendingOccurrencePhotos,
    lastOccurrenceEmail,
    occurrencePhotoSendState,
    resetSeparationOccurrencePhotoSend,
    sendSeparationOccurrencePhotos,
    openProofDocumentId,
    setOpenProofDocumentId,
    openSeparationOccurrenceDocumentId,
    setOpenSeparationOccurrenceDocumentId,
    fiscalReadiness: fiscalReadinessQuery.data,
    refetchFiscalReadiness: () => void fiscalReadinessQuery.refetch(),
    /** O par que o componente de ação de outro módulo exige; `permissions` já vem vazio sem empresa. */
    companyId: input.companyId,
    permissions,
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
