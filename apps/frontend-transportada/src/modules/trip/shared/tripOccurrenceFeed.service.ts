/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  TableColumnPreferences,
  TableColumnStorage,
} from '@/modules/shared/tableColumnPreferences.service'
import {
  readTableColumnPreferences,
  reorderTableColumns,
  writeTableColumnPreferences,
} from '@/modules/shared/tableColumnPreferences.service'

import type { ContractorReplySummary } from '@/modules/occurrence-conversation/shared/contractorReply.types'

import type {
  DeclaredAmountScope,
  OccurrenceAttachmentMode,
  OccurrenceItemsMode,
} from './occurrence.constant'
import type {
  OccurrenceAttachment,
  OccurrenceCancellation,
  OccurrenceCorrection,
} from './trip.types'

/**
 * A listagem de ocorrências do escritório (leitura pura): une o que houve com a nota e o que houve
 * na parada, servida por `GET /trip-occurrences` com cursor keyset. Cópia por valor do vocabulário
 * da API — o bundle não carrega código dela.
 */
export const TRIP_OCCURRENCE_STAGES = ['separation', 'delivery', 'stop'] as const
export type TripOccurrenceFeedStage = (typeof TRIP_OCCURRENCE_STAGES)[number]

/**
 * Spec 164 D3/RF4: a máquina da tratativa. Cópia por valor do vocabulário da API
 * (`occurrence-case-state.policy.ts`) — o bundle não carrega código do servidor.
 */
export const TRIP_OCCURRENCE_CASE_STATUSES = [
  'recorded',
  'under_review',
  'returned_to_warehouse',
  'awaiting_contractor',
  'decided',
  'closed',
  'cancelled',
] as const
/** Spec 266 T1.1: estado que este bundle não conhece (API mais nova) — degrada, nunca reprova o feed. */
export const TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS = 'unknown'
export type TripOccurrenceCaseStatus =
  | (typeof TRIP_OCCURRENCE_CASE_STATUSES)[number]
  | typeof TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS

/** `none` é "sem tratativa aberta" — RF11 exige o filtro incluir esta opção. */
export const TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES = [
  'none',
  ...TRIP_OCCURRENCE_CASE_STATUSES,
] as const
export type TripOccurrenceCaseStatusFilterValue =
  (typeof TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES)[number]

export const TRIP_OCCURRENCE_CASE_DECISION_KINDS = [
  'redelivery_authorized',
  'goods_paid',
  'other',
] as const
export type TripOccurrenceCaseDecisionKind = (typeof TRIP_OCCURRENCE_CASE_DECISION_KINDS)[number]

export type TripOccurrenceCaseTakenBy = Readonly<{
  displayName: null | string
  takenAt: string
}>

/** RF10: o que a API devolve por ocorrência — `null` quando ela não abriu tratativa. */
export type TripOccurrenceCaseView = Readonly<{
  decision: null | Readonly<{
    decidedAt: null | string
    kind: TripOccurrenceCaseDecisionKind
    note: string
  }>
  redeliveryPolicy: 'allowed' | 'blocked'
  /**
   * A API só devolve `null` hoje (T8) — o total por acerto chega numa spec futura. Achado B6 da
   * revisão: o tipo já aceita o valor (`string`, dinheiro) para o dia em que a API o preencher —
   * um guard que continuasse exigindo `null` literal reprovaria o feed inteiro nesse dia.
   */
  settlementTotal: null | string
  status: TripOccurrenceCaseStatus
  /**
   * Quem pegou a tratativa (quem iniciou a validação interna). `null` enquanto ninguém pegou — e
   * API anterior a este campo, que não o manda. Só o nome do perfil; nunca e-mail nem telefone.
   */
  takenBy: null | TripOccurrenceCaseTakenBy
  updatedAt: string
}>

/** Spec 164 T23 (RF22): quem pagou o item — só `driver` carrega `payerId`. */
export const OCCURRENCE_SETTLEMENT_PAYER_KINDS = [
  'driver',
  'carrier',
  'contractor',
  'insurer',
] as const
export type OccurrenceSettlementPayerKind = (typeof OCCURRENCE_SETTLEMENT_PAYER_KINDS)[number]

export const OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES = ['nfe', 'manual'] as const
export type OccurrenceSettlementAmountSource = (typeof OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES)[number]

export type OccurrenceSettlementItem = Readonly<{
  amount: string
  amountSource: OccurrenceSettlementAmountSource
  payerId?: string
  payerKind: OccurrenceSettlementPayerKind
  productCode: string
}>

export type OccurrenceSettlementResult = Readonly<{
  items: readonly OccurrenceSettlementItem[]
  total: string
}>

/**
 * `GET /trip-occurrences/:id/case/settlement`: mesmo formato do item que o `PUT` aceita, com
 * `reimbursedAt` a mais — a marca de ressarcido que só a leitura carrega.
 */
export type OccurrenceSettlementItemView = OccurrenceSettlementItem &
  Readonly<{ reimbursedAt: null | string }>

export type OccurrenceSettlementView = Readonly<{
  items: readonly OccurrenceSettlementItemView[]
  total: string
}>

/** Spec 266 T3.2: andamento que a API grava; ausente ou `null` é em aberto, nunca um estado inventado. */
export const TRIP_OCCURRENCE_RESOLUTION_STATES = ['resolved', 'reopened', 'cancelled'] as const
export type TripOccurrenceResolutionState = (typeof TRIP_OCCURRENCE_RESOLUTION_STATES)[number]

export const TRIP_OCCURRENCE_RESOLUTION_ACTOR_KINDS = ['internal', 'driver', 'system'] as const
export type TripOccurrenceResolutionActorKind =
  (typeof TRIP_OCCURRENCE_RESOLUTION_ACTOR_KINDS)[number]

export type TripOccurrenceResolution = Readonly<{
  /** `null` quando a API manda um ator que este bundle não conhece — o estado continua valendo. */
  actorKind: null | TripOccurrenceResolutionActorKind
  at: string
  state: TripOccurrenceResolutionState
}>

/** Estados que a API aceita em `resolutionStateIn`, na ordem em que vão à consulta. */
export const TRIP_OCCURRENCE_RESOLUTION_QUERY_STATES = [
  'open',
  'resolved',
  'reopened',
  'cancelled',
] as const
export type TripOccurrenceResolutionQueryState =
  (typeof TRIP_OCCURRENCE_RESOLUTION_QUERY_STATES)[number]

/** Opções do filtro "Andamento". "Em aberto" cobre a aberta e a reaberta (ver `RESOLUTION_FILTER_QUERY_STATES`). */
export const TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES = [
  'open',
  'reopened',
  'resolved',
  'cancelled',
] as const
export type TripOccurrenceResolutionFilterValue =
  (typeof TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES)[number]

const RESOLUTION_FILTER_QUERY_STATES: Readonly<
  Record<TripOccurrenceResolutionFilterValue, readonly TripOccurrenceResolutionQueryState[]>
> = {
  cancelled: ['cancelled'],
  open: ['open', 'reopened'],
  reopened: ['reopened'],
  resolved: ['resolved'],
}

export type TripOccurrenceFeedItem = Readonly<{
  /** Spec 240 RF9: `null` é "não foi cancelada"; a cancelada continua na leitura, marcada. */
  cancellation?: null | OccurrenceCancellation
  case: null | TripOccurrenceCaseView
  /** Spec 248 RF13: o selo do retorno da contratante; `null` sem retorno e na API anterior. */
  contractorReply?: ContractorReplySummary | null
  /** Spec 183 RF4: estado da conversa; ausente na API anterior vira `EMPTY_OCCURRENCE_CONVERSATION`. */
  conversation: TripOccurrenceConversationSummary
  createdAt: string
  description: string
  /** Spec 183 RF2: `null` na ocorrência de parada sem nota e na API anterior à 183. */
  document: null | TripOccurrenceDocument
  driverName: string
  hasAttachment: boolean
  id: string
  invoiceNumber: null | string
  invoiceSeries: null | string
  /** Spec 269 D8: o tipo avisa a contratante e não há modelo efetivo. Ausente é API anterior ao campo. */
  missingNotificationTemplate?: boolean
  notifies: boolean
  /** Spec 241 RF5: ausente é API anterior ao campo. */
  occurrenceTypeId?: null | string
  /** Spec 266 T3.2: `null` é em aberto; ausente é API anterior ao andamento. */
  resolution?: null | TripOccurrenceResolution
  source: 'document' | 'stop'
  stage: 'delivery' | 'separation' | null
  stopLabel: null | string
  tripId: string
  /** Spec 241 RF5: ausente é API anterior ao campo e lê `true`. */
  typeAllowsMultipleItems?: boolean | null
  /** Spec 241 RF5: o tipo **atual** carrega itens? Ausente é API anterior ao campo e lê `optional`. */
  typeItemsMode?: OccurrenceItemsMode | null
  typeName: string
  /** Spec 277 RF2: a ficha do veículo da viagem; ausente é API anterior ao campo. `color` é o código do cadastro. */
  vehicle?: TripOccurrenceVehicle
  vehiclePlate: string
}>

/** Spec 277 RF2: `modelYear` `null` é cadastro sem ano; `color` vazio é sem cor. */
export type TripOccurrenceVehicle = Readonly<{
  brand: string
  color: string
  model: string
  modelYear: null | number
}>

export const OCCURRENCE_CONTRACTOR_CONVERSATION_STATES = ['none', 'awaiting', 'replied'] as const

export type OccurrenceContractorConversationState =
  (typeof OCCURRENCE_CONTRACTOR_CONVERSATION_STATES)[number]

/**
 * Spec 183 RF4: a conversa com a contratante (`awaiting` = a última mensagem é nossa; `replied` = é
 * dela) e as mensagens do motorista ainda não lidas **por quem está vendo**.
 */
export type TripOccurrenceConversationSummary = Readonly<{
  contractorState: OccurrenceContractorConversationState
  driverUnreadCount: number
}>

export const EMPTY_OCCURRENCE_CONVERSATION: TripOccurrenceConversationSummary = {
  contractorState: 'none',
  driverUnreadCount: 0,
}

/**
 * Spec 183 RF2: de quem é a carga, para onde ia e quanto vale. `totalValue` é string decimal —
 * dinheiro nunca vira `number` na tela. `destination` é o destino físico (onde o caminhão para).
 */
export type TripOccurrenceDocument = Readonly<{
  contractor: Readonly<{ contractorId: null | string; name: string; taxId: null | string }> | null
  destination: Readonly<{
    city: string
    label: string
    origin: 'delivery' | 'recipient'
    postalCode: null | string
    recipientName: string
    state: string
  }> | null
  nfeDocumentId: string
  /** Spec 277 RF2: o cliente (destinatário da nota); ausente é API anterior ao campo, `null` é nota sem destinatário. */
  recipient?: null | Readonly<{ name: string; taxId: null | string }>
  /** Spec 277 RF2: peso bruto (kg) e volumes da nota, strings decimais; ausente é API anterior ao campo. */
  cargo?: Readonly<{ grossWeightKg: string; volumeCount: string }>
  totalValue: string
  /**
   * Spec 183 T702d: a nota **da viagem** (`trip_documents.id`), que a rota da foto da ocorrência pede
   * no caminho. Ausente na API anterior — sem ela, "Anexar à ocorrência" não aparece.
   */
  tripDocumentId?: null | string
}>

/** Spec 183 RF3: o motorista da viagem, para o escritório falar com ele. */
export type TripOccurrenceDetailDriver = Readonly<{
  driverId: string
  email: string
  name: string
  phone: string
  /** Caminho público da foto na API (`/public/company-users/:token/picture`), ou `null`. */
  picturePath: null | string
  /** Só o telefone **verificado** do WhatsApp (ADR-0063). */
  whatsappPhone: null | string
}>

/** Spec 183 T207: o item atingido (specs 166/172); quantidade é string decimal. */
export type TripOccurrenceDetailItem = Readonly<{
  code: string
  /** Spec 247 (ADR-0081 §9): o valor pago da linha; ausente é API anterior ao campo, `null` é não digitado. */
  declaredAmount?: null | string
  description: string
  quantity: null | string
  unit: null | string
}>

/**
 * Spec 247 R2: o que o registro gravou por linha, no nível da ocorrência. `quantity` tem 3 casas, `unitValue`
 * (a cópia do `vUnCom`) tem 4 e `declaredAmount` tem 2 (`null` é não digitado). Dinheiro é sempre texto.
 */
export type TripOccurrenceItemValue = Readonly<{
  declaredAmount: null | string
  productCode: string
  quantity: string
  unitValue: string
}>

/**
 * Spec 247 T7.2b: o requisito **efetivo** do tipo da ocorrência (já resolvido pela API, com o padrão do
 * catálogo onde o tipo não escolheu). Quem corrige lê daqui — o catálogo é de quem tem `settings.manage`.
 */
export type TripOccurrenceRequirements = Readonly<{
  declaredAmountLabel: string
  declaredAmountMode: OccurrenceAttachmentMode
  declaredAmountScope: DeclaredAmountScope
  itemsMode: OccurrenceAttachmentMode
  referenceNumberLabel: string
  referenceNumberMode: OccurrenceAttachmentMode
}>

/** Spec 183 RF1: a linha da listagem, com autoria, nota e o motorista. */
export type TripOccurrenceDetail = TripOccurrenceFeedItem &
  Readonly<{
    actorName: null | string
    channel: string
    /** Spec 247 R2: o valor pago da ocorrência (2 casas; `"0.00"` é valor). Ausente é API/ocorrência antiga. */
    declaredAmount?: null | string
    /** Spec 247 R2: um por linha gravada, na ordem de `position`. Ausente é API anterior ao campo. */
    itemValues?: readonly TripOccurrenceItemValue[]
    /** Spec 247 R2: o número do documento do cliente. Ausente é API anterior ao campo. */
    referenceNumber?: null | string
    /** Spec 247 T7.2b: ausente ou `null` é ocorrência antiga, API anterior ou parada sem nota — rótulos genéricos. */
    requirements?: null | TripOccurrenceRequirements
    driver: null | TripOccurrenceDetailDriver
    /** Spec 240 RF9: mais antiga primeiro; `[]` quando a ocorrência nunca foi corrigida. */
    corrections?: readonly OccurrenceCorrection[]
    items: readonly TripOccurrenceDetailItem[]
    onBehalfOfDriverName: null | string
  }>

export type TripOccurrenceFeedPage = Readonly<{
  items: readonly TripOccurrenceFeedItem[]
  nextCursor: null | string
}>

/** Spec 161 T24: mesmo formato de `OccurrenceAttachment` (RF8) — o feed lê a mesma forma que o
 * painel da nota, sem uma segunda definição para divergir dela. */
export type TripOccurrenceAttachment = OccurrenceAttachment

export type TripOccurrenceFeedOrder = 'asc' | 'desc'

export type TripOccurrenceFeedFilters = Readonly<{
  /** RF11: estado da tratativa, incluindo `none` ("sem tratativa"). Todos selecionados = sem filtro. */
  caseStatuses: readonly TripOccurrenceCaseStatusFilterValue[]
  /** Spec 266 T3.2: andamento da ocorrência ("Andamento"). Todos selecionados = sem filtro. */
  resolutionStates: readonly TripOccurrenceResolutionFilterValue[]
  /** Spec 248 RF5: só as ocorrências cujo retorno da contratante está atrasado (`contractorReplyStatusIn=overdue`). */
  contractorReplyOverdue: boolean
  createdFrom: string
  createdUntil: string
  /** Placas digitadas, separadas por vírgula — multi-valor por campo. */
  platesQuery: string
  stages: readonly TripOccurrenceFeedStage[]
  /** Spec 277 RF1: a busca rápida; só viaja com 2 caracteres ou mais, depois de aparada. */
  search: string
  /** Nomes de tipo (ou kind de parada), separados por vírgula. */
  typesQuery: string
}>

export const EMPTY_TRIP_OCCURRENCE_FILTERS: TripOccurrenceFeedFilters = {
  caseStatuses: TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES,
  contractorReplyOverdue: false,
  resolutionStates: TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES,
  createdFrom: '',
  createdUntil: '',
  platesQuery: '',
  search: '',
  stages: TRIP_OCCURRENCE_STAGES,
  typesQuery: '',
}

export const TRIP_OCCURRENCE_COLUMN_KEYS = [
  'createdAt',
  'stage',
  'typeName',
  'vehiclePlate',
  'driverName',
  'stopLabel',
  'invoice',
  'contractor',
  'client',
  'destination',
  'city',
  'invoiceValue',
  'cargo',
  'resolvedIn',
  'conversation',
  'takenBy',
  'notified',
] as const

export type TripOccurrenceColumnKey = (typeof TRIP_OCCURRENCE_COLUMN_KEYS)[number]

export type TripOccurrenceColumnPreferences = TableColumnPreferences<TripOccurrenceColumnKey>

export const TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY = 'trip.occurrences.columns.v1'

export const TRIP_OCCURRENCE_PER_PAGE = 25

export function readTripOccurrenceColumnPreferences(
  storage: null | TableColumnStorage,
): TripOccurrenceColumnPreferences {
  return readTableColumnPreferences({
    columns: TRIP_OCCURRENCE_COLUMN_KEYS,
    storage,
    storageKey: TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY,
  })
}

export function writeTripOccurrenceColumnPreferences(
  storage: null | TableColumnStorage,
  preferences: TripOccurrenceColumnPreferences,
): void {
  writeTableColumnPreferences({
    preferences,
    storage,
    storageKey: TRIP_OCCURRENCE_COLUMNS_STORAGE_KEY,
  })
}

export function reorderTripOccurrenceColumns(
  order: readonly TripOccurrenceColumnKey[],
  column: TripOccurrenceColumnKey,
  direction: 'down' | 'up',
): readonly TripOccurrenceColumnKey[] {
  return reorderTableColumns(order, column, direction)
}

/** Cabeçalho de hora alterna asc/desc — ordenação no servidor, nunca no cliente. */
export function toggleTripOccurrenceOrder(order: TripOccurrenceFeedOrder): TripOccurrenceFeedOrder {
  return order === 'desc' ? 'asc' : 'desc'
}

export function toggleTripOccurrenceStage(
  filters: TripOccurrenceFeedFilters,
  stage: TripOccurrenceFeedStage,
): TripOccurrenceFeedFilters {
  const selected = filters.stages.includes(stage)
    ? filters.stages.filter((current) => current !== stage)
    : [...filters.stages, stage]
  return {
    ...filters,
    stages: TRIP_OCCURRENCE_STAGES.filter((current) => selected.includes(current)),
  }
}

/** O parâmetro de consulta da API e o único valor que o filtro "Atrasadas" manda (spec 248 RF5). */
const CONTRACTOR_REPLY_STATUS_QUERY_KEY = 'contractorReplyStatusIn'
const CONTRACTOR_REPLY_OVERDUE_STATUS = 'overdue'

export function setTripOccurrenceContractorReplyOverdue(
  filters: TripOccurrenceFeedFilters,
  isOverdueOnly: boolean,
): TripOccurrenceFeedFilters {
  return { ...filters, contractorReplyOverdue: isOverdueOnly }
}

export function setTripOccurrenceCaseStatuses(
  filters: TripOccurrenceFeedFilters,
  statuses: readonly TripOccurrenceCaseStatusFilterValue[],
): TripOccurrenceFeedFilters {
  return {
    ...filters,
    caseStatuses: TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.filter((value) =>
      statuses.includes(value),
    ),
  }
}

export function setTripOccurrenceResolutionStates(
  filters: TripOccurrenceFeedFilters,
  states: readonly TripOccurrenceResolutionFilterValue[],
): TripOccurrenceFeedFilters {
  return {
    ...filters,
    resolutionStates: TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES.filter((value) =>
      states.includes(value),
    ),
  }
}

function toResolutionQueryStates(
  values: readonly TripOccurrenceResolutionFilterValue[],
): readonly TripOccurrenceResolutionQueryState[] {
  return TRIP_OCCURRENCE_RESOLUTION_QUERY_STATES.filter((state) =>
    values.some((value) => RESOLUTION_FILTER_QUERY_STATES[value].includes(state)),
  )
}

function parseListQuery(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/** Spec 277 RF1: a API recusa busca com menos de 2 ou mais de 80 caracteres — a tela nem pergunta. */
export const TRIP_OCCURRENCE_SEARCH_MIN_LENGTH = 2
export const TRIP_OCCURRENCE_SEARCH_MAX_LENGTH = 80

export function normalizeTripOccurrenceSearch(value: string): null | string {
  const trimmed = value.trim().slice(0, TRIP_OCCURRENCE_SEARCH_MAX_LENGTH).trim()
  return trimmed.length >= TRIP_OCCURRENCE_SEARCH_MIN_LENGTH ? trimmed : null
}

/** Fim do dia inclusivo: o filtro "até 02/09" cobre o dia inteiro, não a meia-noite dele. */
function toDayEnd(day: string): string {
  return `${day}T23:59:59.999Z`
}

function toDayStart(day: string): string {
  return `${day}T00:00:00.000Z`
}

/**
 * Chave vazia não é serializada — a API rejeita com 400 chave fora da allowlist, e filtro no
 * default não restringe nada, então não viaja.
 */
export function serializeTripOccurrenceQuery(
  input: Readonly<{
    cursor: null | string
    filters: TripOccurrenceFeedFilters
    order: TripOccurrenceFeedOrder
    perPage: number
  }>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('perPage', String(input.perPage))
  if (input.order !== 'desc') search.set('order', input.order)
  if (input.filters.createdFrom.length > 0) {
    search.set('createdFrom', toDayStart(input.filters.createdFrom))
  }
  if (input.filters.createdUntil.length > 0) {
    search.set('createdUntil', toDayEnd(input.filters.createdUntil))
  }
  const quickSearch = normalizeTripOccurrenceSearch(input.filters.search)
  if (quickSearch !== null) search.set('search', quickSearch)
  const plates = parseListQuery(input.filters.platesQuery)
  if (plates.length > 0) search.set('plateIn', plates.join(','))
  const types = parseListQuery(input.filters.typesQuery)
  if (types.length > 0) search.set('typeIn', types.join(','))
  if (
    input.filters.stages.length > 0 &&
    input.filters.stages.length < TRIP_OCCURRENCE_STAGES.length
  ) {
    search.set('stageIn', input.filters.stages.join(','))
  }
  if (
    input.filters.caseStatuses.length > 0 &&
    input.filters.caseStatuses.length < TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.length
  ) {
    search.set('caseStatusIn', input.filters.caseStatuses.join(','))
  }
  const resolutionStates = toResolutionQueryStates(input.filters.resolutionStates)
  if (
    resolutionStates.length > 0 &&
    resolutionStates.length < TRIP_OCCURRENCE_RESOLUTION_QUERY_STATES.length
  ) {
    search.set('resolutionStateIn', resolutionStates.join(','))
  }
  if (input.filters.contractorReplyOverdue) {
    search.set(CONTRACTOR_REPLY_STATUS_QUERY_KEY, CONTRACTOR_REPLY_OVERDUE_STATUS)
  }
  return search.toString()
}

export type OccurrenceDocumentCells = Readonly<{
  contractorName: string
  contractorTaxId: string
  destination: string
  /** String decimal, formatada na célula por `formatAmount`; `null` sem nota. */
  totalValue: null | string
}>

/**
 * Spec 183 T205: as três colunas da nota. Ausência vira célula vazia, nunca "null" — a ocorrência de
 * parada não tem nota, e o emitente pode não ter destino físico lido.
 */
export function describeOccurrenceDocumentCells(
  document: null | TripOccurrenceDocument,
): OccurrenceDocumentCells {
  return {
    contractorName: document?.contractor?.name ?? '',
    contractorTaxId: document?.contractor?.taxId ?? '',
    destination: document?.destination?.label ?? '',
    totalValue: document?.totalValue ?? null,
  }
}

export type OccurrenceConversationCell = Readonly<{
  driverUnreadCount: number
  state:
    | null
    | Readonly<{ kind: 'conversation'; value: 'awaiting' | 'replied' }>
    | Readonly<{ kind: 'decision'; value: TripOccurrenceCaseDecisionKind }>
}>

/**
 * Spec 183 T404 (RF4): a decisão da tratativa não é estado de conversa — com decisão, a célula mostra
 * a decisão (de `case`); sem ela, o estado da conversa com a contratante. As não lidas do motorista
 * vão ao lado em qualquer caso.
 */
export function describeOccurrenceConversationCell(
  item: Pick<TripOccurrenceFeedItem, 'case' | 'conversation'>,
): OccurrenceConversationCell {
  const decision = item.case?.decision ?? null
  const { contractorState, driverUnreadCount } = item.conversation
  if (decision !== null) {
    return { driverUnreadCount, state: { kind: 'decision', value: decision.kind } }
  }
  return {
    driverUnreadCount,
    state: contractorState === 'none' ? null : { kind: 'conversation', value: contractorState },
  }
}

/** Nota sem número (ocorrência de parada sem nota vinculada) imprime ausência, nunca "null/null". */
export function formatOccurrenceInvoice(
  invoiceNumber: null | string,
  invoiceSeries: null | string,
): string {
  if (invoiceNumber === null || invoiceNumber.length === 0) return ''
  if (invoiceSeries === null || invoiceSeries.length === 0) return invoiceNumber
  return `${invoiceNumber}/${invoiceSeries}`
}

/** O rótulo do tipo: cadastrado imprime o nome da empresa; relato de parada traduz o kind. */
export function resolveOccurrenceTypeLabel(
  item: Pick<TripOccurrenceFeedItem, 'source' | 'typeName'>,
): Readonly<{ labelKey: null | string; value: string }> {
  if (item.source === 'stop') {
    return { labelKey: `occurrenceFeed.kind.${item.typeName}`, value: item.typeName }
  }
  return { labelKey: null, value: item.typeName }
}

/**
 * Spec 277 RF3: o botão "Filtros avançados" conta só o que mora dentro dele. A busca e o andamento
 * (os chips) ficam à vista, então não entram na conta do botão.
 */
export function countAdvancedTripOccurrenceFilters(filters: TripOccurrenceFeedFilters): number {
  return (
    countActiveTripOccurrenceFilters(filters) -
    (normalizeTripOccurrenceSearch(filters.search) === null ? 0 : 1) -
    (filters.resolutionStates.length === TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES.length ? 0 : 1)
  )
}

export function countActiveTripOccurrenceFilters(filters: TripOccurrenceFeedFilters): number {
  const scalarFields = [
    filters.createdFrom,
    filters.createdUntil,
    filters.platesQuery,
    normalizeTripOccurrenceSearch(filters.search) ?? '',
    filters.typesQuery,
  ]
  const stagesChanged = filters.stages.length === TRIP_OCCURRENCE_STAGES.length ? 0 : 1
  const caseStatusesChanged =
    filters.caseStatuses.length === TRIP_OCCURRENCE_CASE_STATUS_FILTER_VALUES.length ? 0 : 1
  const resolutionStatesChanged =
    filters.resolutionStates.length === TRIP_OCCURRENCE_RESOLUTION_FILTER_VALUES.length ? 0 : 1
  const contractorReplyChanged = filters.contractorReplyOverdue ? 1 : 0
  return (
    scalarFields.filter((field) => field.trim().length > 0).length +
    stagesChanged +
    caseStatusesChanged +
    resolutionStatesChanged +
    contractorReplyChanged
  )
}

/** Spec 277 RF3: a ordem dos grupos da lista. "Em aberto" primeiro: é o que pede ação. */
export const TRIP_OCCURRENCE_GROUP_ORDER = ['open', 'reopened', 'resolved', 'cancelled'] as const
export type TripOccurrenceGroupState = (typeof TRIP_OCCURRENCE_GROUP_ORDER)[number]

export type TripOccurrenceGroup = Readonly<{
  items: readonly TripOccurrenceFeedItem[]
  state: TripOccurrenceGroupState
}>

/**
 * Spec 277 RF3: agrupa a lista por andamento sem mexer na ordem de dentro do grupo (a do servidor).
 * Sem andamento no item é em aberto (266); grupo vazio não existe. O estado que o bundle não conhece
 * cai em "em aberto" — nunca some da lista.
 */
export function groupTripOccurrencesByResolution(
  items: readonly TripOccurrenceFeedItem[],
): readonly TripOccurrenceGroup[] {
  const groups = new Map<TripOccurrenceGroupState, TripOccurrenceFeedItem[]>()
  for (const item of items) {
    const raw = item.resolution?.state
    const state = TRIP_OCCURRENCE_GROUP_ORDER.find((candidate) => candidate === raw) ?? 'open'
    groups.set(state, [...(groups.get(state) ?? []), item])
  }
  return TRIP_OCCURRENCE_GROUP_ORDER.flatMap((state) => {
    const grouped = groups.get(state)
    return grouped === undefined ? [] : [{ items: grouped, state }]
  })
}

export type OccurrenceVehicleCells = Readonly<{
  /** "Volvo FH 540 · 2022"; vazio quando o cadastro não tem marca, modelo nem ano. */
  description: string
  /** O código da cor do cadastro, ou `''`. */
  colorCode: string
  plate: string
}>

/** Spec 277 RF2: placa, marca/modelo/ano e a cor. Cadastro incompleto imprime só o que existe, nunca "0" nem "null". */
export function describeOccurrenceVehicleCells(
  item: Pick<TripOccurrenceFeedItem, 'vehicle' | 'vehiclePlate'>,
): OccurrenceVehicleCells {
  const vehicle = item.vehicle
  const name = [vehicle?.brand ?? '', vehicle?.model ?? ''].filter((part) => part.length > 0)
  const year = vehicle?.modelYear ?? null
  const description = [name.join(' '), year === null ? '' : String(year)]
    .filter((part) => part.length > 0)
    .join(' · ')
  return { colorCode: vehicle?.color ?? '', description, plate: item.vehiclePlate }
}

export type OccurrenceClientCells = Readonly<{
  city: string
  name: string
  taxId: string
}>

/** Spec 277 RF2: o cliente da nota e a cidade de entrega (`Cidade/UF`). Ausência é célula vazia. */
export function describeOccurrenceClientCells(
  document: null | TripOccurrenceDocument,
): OccurrenceClientCells {
  const destination = document?.destination ?? null
  const city =
    destination === null || destination.city.length === 0
      ? ''
      : destination.state.length === 0
        ? destination.city
        : `${destination.city}/${destination.state}`
  return {
    city,
    name: document?.recipient?.name ?? destination?.recipientName ?? '',
    taxId: document?.recipient?.taxId ?? '',
  }
}

/** Spec 277 RF2: peso e volumes da nota; `null` quando a API não manda a carga (nota ausente ou API anterior). */
export function describeOccurrenceCargoCells(
  document: null | TripOccurrenceDocument,
): null | Readonly<{ grossWeightKg: string; volumeCount: string }> {
  return document?.cargo ?? null
}
