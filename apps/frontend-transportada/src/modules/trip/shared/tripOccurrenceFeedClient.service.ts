/* Copyright (c) 2026 Ada Technology. MIT License. */
import { toContractorReplySummary } from '@/modules/occurrence-conversation/shared/contractorReply.service'

import { OCCURRENCE_ITEMS_MODES } from './occurrence.constant'
import { TRIP_ERROR } from './trip.constant'
import { isOccurrenceAttachment, isOneOf, isRecord, isString } from './tripGuards.validation'
import { isOccurrenceRequirements } from './tripOccurrenceRequirements.validation'
import { isOccurrenceCancellation, isOccurrenceCorrection } from './tripResponse.validation'
import {
  EMPTY_OCCURRENCE_CONVERSATION,
  OCCURRENCE_CONTRACTOR_CONVERSATION_STATES,
  OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES,
  OCCURRENCE_SETTLEMENT_PAYER_KINDS,
  TRIP_OCCURRENCE_CASE_DECISION_KINDS,
  TRIP_OCCURRENCE_CASE_STATUSES,
  TRIP_OCCURRENCE_RESOLUTION_ACTOR_KINDS,
  TRIP_OCCURRENCE_RESOLUTION_STATES,
  TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS,
  type OccurrenceContractorConversationState,
  type OccurrenceSettlementItem,
  type OccurrenceSettlementItemView,
  type OccurrenceSettlementResult,
  type OccurrenceSettlementView,
  type TripOccurrenceAttachment,
  type TripOccurrenceCaseDecisionKind,
  type TripOccurrenceCaseTakenBy,
  type TripOccurrenceCaseStatus,
  type TripOccurrenceCaseView,
  type TripOccurrenceConversationSummary,
  type TripOccurrenceFeedFilters,
  type TripOccurrenceDetail,
  type TripOccurrenceDetailDriver,
  type TripOccurrenceDetailItem,
  type TripOccurrenceItemValue,
  type TripOccurrenceDocument,
  type TripOccurrenceFeedItem,
  type TripOccurrenceFeedOrder,
  type TripOccurrenceFeedPage,
  type TripOccurrenceResolution,
} from './tripOccurrenceFeed.service'
import { serializeTripOccurrenceQuery } from './tripOccurrenceFeed.service'
import type { OccurrenceTimeline } from './tripOccurrenceTimeline.service'
import type {
  OccurrenceResolutionKind,
  OccurrenceResolutionResult,
} from './occurrenceResolution.service'
import { parseOccurrenceTimeline } from './tripOccurrenceTimeline.validation'

const TRIP_OCCURRENCES_PATH = '/trip-occurrences'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ListTripOccurrencesInput = Readonly<{
  cursor: null | string
  filters: TripOccurrenceFeedFilters
  order: TripOccurrenceFeedOrder
  perPage: number
}>

type CaseActionInput = Readonly<{ occurrenceId: string }>
/** O corpo real das seis ações (`occurrence-case.routes.ts`); a visão completa vem do feed, que a ação invalida. */
type CaseActionResult = Readonly<{ kind: 'changed' | 'unchanged'; status: string }>
type CaseActionWithNoteInput = Readonly<{ note: string; occurrenceId: string }>
type CaseDecisionInput = Readonly<{
  kind: TripOccurrenceCaseDecisionKind
  note: string
  occurrenceId: string
}>

export type TripOccurrenceFeedClient = Readonly<{
  listAttachments: (
    input: Readonly<{ occurrenceId: string }>,
  ) => Promise<readonly TripOccurrenceAttachment[]>
  listOccurrences: (input: ListTripOccurrencesInput) => Promise<TripOccurrenceFeedPage>
  /** Spec 183 RF1: `GET /trip-occurrences/:id` — a linha, a nota e o motorista. */
  readOccurrence: (input: Readonly<{ occurrenceId: string }>) => Promise<TripOccurrenceDetail>
  /** Spec 183 RF19: `GET /trip-occurrences/:id/timeline` — os eventos em ordem e os três tempos. */
  readOccurrenceTimeline: (input: Readonly<{ occurrenceId: string }>) => Promise<OccurrenceTimeline>
  /** Spec 164 T7/RF8b: motivo obrigatório — ocorrência aberta por engano, só de `recorded`/`under_review`. */
  cancelOccurrenceCase: (input: CaseActionWithNoteInput) => Promise<CaseActionResult>
  /** Spec 266 RF7: `POST /trip-occurrences/:kind/:id/resolution` — nota obrigatória, 409 se já resolvida ou cancelada. */
  resolveTripOccurrence: (
    input: Readonly<{ kind: OccurrenceResolutionKind; note: string; occurrenceId: string }>,
  ) => Promise<OccurrenceResolutionResult>
  /** RF8: só sai de `decided`. */
  closeOccurrenceCase: (input: CaseActionInput) => Promise<CaseActionResult>
  /** RF7: recusa 422 quando `blocked` sem item para acertar. */
  submitOccurrenceCaseToContractor: (input: CaseActionInput) => Promise<CaseActionResult>
  /** RF5: `recorded` → `under_review`. */
  reviewOccurrenceCase: (input: CaseActionInput) => Promise<CaseActionResult>
  /** RF6: nota obrigatória — encerra dentro da transportadora, sem visibilidade externa. */
  returnOccurrenceCaseToWarehouse: (input: CaseActionWithNoteInput) => Promise<CaseActionResult>
  /**
   * Achado 1 da revisão (spec 164): decisão em nome do contratante que não respondeu, feita pelo
   * escritório. `actorKind: 'internal'` é constante da rota — nunca vem daqui —, e é isso que
   * impede um ator interno assinar como se fosse o cliente. Nota sempre obrigatória. Recusa `409`
   * (`OCCURRENCE_CASE_DECISION_CONFLICT`) sobre tratativa já decidida com decisão divergente, e
   * `422` (`OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED`) para reentrega sobre política `blocked`.
   */
  decideOccurrenceCaseOnBehalfOfContractor: (input: CaseDecisionInput) => Promise<CaseActionResult>
  /** RF23: substitui a lista inteira — só com a tratativa `decided` e decisão `goods_paid`. */
  recordOccurrenceSettlement: (
    input: Readonly<{ items: readonly OccurrenceSettlementItem[]; occurrenceId: string }>,
  ) => Promise<OccurrenceSettlementResult>
  /** Achado 2 da revisão: devolve o que o `PUT` gravou — a tela abre com o acerto que já existe. */
  findOccurrenceSettlement: (
    input: Readonly<{ occurrenceId: string }>,
  ) => Promise<OccurrenceSettlementView>
  /** RF31: idempotente; `payer_kind = 'carrier'` nunca chega aqui — a tela esconde o botão. */
  reimburseOccurrenceSettlementItem: (
    input: Readonly<{ occurrenceId: string; productCode: string }>,
  ) => Promise<Readonly<{ kind: 'changed' | 'unchanged' }>>
}>

class TripOccurrenceRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.code = code
  }
}

function requestError(code: string): TripOccurrenceRequestError {
  return new TripOccurrenceRequestError(code)
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

/**
 * Achados B5/B6 da revisão, mesma família da quebra de 22/09 (`trip.constant.ts`): campo novo
 * entra opcional no guard, e ausente degrada para o padrão — nunca derruba a resposta inteira.
 * `case` ausente é "sem tratativa aberta" (mesmo padrão de `null`, RF10); `settlementTotal`
 * ausente é o de hoje, `null`, até a API preencher o valor (T8).
 */
type RawCaseView = Omit<TripOccurrenceCaseView, 'settlementTotal' | 'status' | 'takenBy'> &
  Readonly<{ settlementTotal?: unknown; status: string; takenBy?: unknown }>

/** Spec 266 T1.1: estado novo da API vira `unknown` — a tratativa continua visível, sem rótulo inventado. */
function toCaseStatus(value: string): TripOccurrenceCaseStatus {
  const knownStatus = TRIP_OCCURRENCE_CASE_STATUSES.find((status) => status === value)
  return knownStatus ?? TRIP_OCCURRENCE_UNKNOWN_CASE_STATUS
}

/** RF10: `null` é "sem tratativa aberta" — nunca um estado inventado. */
function isCaseView(value: unknown): value is RawCaseView {
  if (!isRecord(value)) return false
  const decision = value.decision
  const isValidDecision =
    decision === null ||
    (isRecord(decision) &&
      (decision.decidedAt === null || isString(decision.decidedAt)) &&
      (TRIP_OCCURRENCE_CASE_DECISION_KINDS as readonly unknown[]).includes(decision.kind) &&
      isString(decision.note))
  return (
    isValidDecision &&
    (value.redeliveryPolicy === 'allowed' || value.redeliveryPolicy === 'blocked') &&
    (value.settlementTotal === undefined ||
      value.settlementTotal === null ||
      isString(value.settlementTotal)) &&
    isString(value.status) &&
    isString(value.updatedAt)
  )
}

/** Ausente ou malformado é "ninguém pegou" — o campo nunca reprova a tratativa (ADR-0081 §9). */
function toTakenBy(value: unknown): TripOccurrenceCaseTakenBy | null {
  if (!isRecord(value) || !isString(value.takenAt)) return null
  return {
    displayName: isString(value.displayName) ? value.displayName : null,
    takenAt: value.takenAt,
  }
}

function toCaseView(raw: RawCaseView): TripOccurrenceCaseView {
  const { settlementTotal, status, takenBy, ...rest } = raw
  return {
    ...rest,
    settlementTotal: isString(settlementTotal) ? settlementTotal : null,
    status: toCaseStatus(status),
    takenBy: toTakenBy(takenBy),
  }
}

type RawFeedItem = Omit<
  TripOccurrenceFeedItem,
  'case' | 'contractorReply' | 'conversation' | 'document' | 'resolution'
> &
  Readonly<{
    case?: unknown
    contractorReply?: unknown
    conversation?: unknown
    document?: unknown
    resolution?: unknown
  }>

/**
 * Spec 266 T3.2: ausente, nulo ou com `at` malformado é em aberto. Estado desconhecido também vira
 * `null` (a API mais nova pode ter outro andamento); ator desconhecido zera só o ator.
 */
function toResolution(value: unknown): null | TripOccurrenceResolution {
  if (!isRecord(value) || !isString(value.at)) return null
  const state = TRIP_OCCURRENCE_RESOLUTION_STATES.find((known) => known === value.state)
  if (state === undefined) return null
  const actorKind = TRIP_OCCURRENCE_RESOLUTION_ACTOR_KINDS.find(
    (known) => known === value.actorKind,
  )
  return { actorKind: actorKind ?? null, at: value.at, state }
}

/** Spec 183 RF4: ausente ou malformado é "sem conversa" — o campo nunca reprova o item. */
function toConversationSummary(value: unknown): TripOccurrenceConversationSummary {
  if (!isRecord(value)) return EMPTY_OCCURRENCE_CONVERSATION
  const contractorState = OCCURRENCE_CONTRACTOR_CONVERSATION_STATES.find(
    (state: OccurrenceContractorConversationState) => state === value.contractorState,
  )
  const driverUnreadCount = value.driverUnreadCount
  if (
    contractorState === undefined ||
    typeof driverUnreadCount !== 'number' ||
    !Number.isInteger(driverUnreadCount) ||
    driverUnreadCount < 0
  ) {
    return EMPTY_OCCURRENCE_CONVERSATION
  }
  return { contractorState, driverUnreadCount }
}

function isFeedItem(value: unknown): value is RawFeedItem {
  if (!isRecord(value)) return false
  return (
    (value.cancellation === undefined ||
      value.cancellation === null ||
      isOccurrenceCancellation(value.cancellation)) &&
    (value.case === undefined || value.case === null || isCaseView(value.case)) &&
    (value.document === undefined ||
      value.document === null ||
      isOccurrenceDocument(value.document)) &&
    isString(value.createdAt) &&
    isString(value.description) &&
    isString(value.driverName) &&
    typeof value.hasAttachment === 'boolean' &&
    isString(value.id) &&
    isNullableString(value.invoiceNumber) &&
    isNullableString(value.invoiceSeries) &&
    typeof value.notifies === 'boolean' &&
    (value.occurrenceTypeId === undefined || isNullableString(value.occurrenceTypeId)) &&
    (value.source === 'document' || value.source === 'stop') &&
    (value.stage === null || value.stage === 'delivery' || value.stage === 'separation') &&
    isNullableString(value.stopLabel) &&
    isString(value.tripId) &&
    (value.typeAllowsMultipleItems === undefined ||
      value.typeAllowsMultipleItems === null ||
      typeof value.typeAllowsMultipleItems === 'boolean') &&
    (value.typeItemsMode === undefined ||
      value.typeItemsMode === null ||
      isOneOf(value.typeItemsMode, OCCURRENCE_ITEMS_MODES)) &&
    isString(value.typeName) &&
    isString(value.vehiclePlate)
  )
}

function toFeedItem(raw: RawFeedItem): TripOccurrenceFeedItem {
  const {
    cancellation,
    case: rawCase,
    contractorReply,
    conversation,
    document,
    resolution,
    ...rest
  } = raw
  const replySummary = toContractorReplySummary(contractorReply)
  return {
    ...rest,
    ...(replySummary === null ? {} : { contractorReply: replySummary }),
    cancellation: isOccurrenceCancellation(cancellation) ? cancellation : null,
    case: isRecord(rawCase) && isCaseView(rawCase) ? toCaseView(rawCase) : null,
    conversation: toConversationSummary(conversation),
    document: isOccurrenceDocument(document) ? document : null,
    resolution: toResolution(resolution),
  }
}

/**
 * Spec 183 RF2: o bloco da nota é **estrito** — valor que não é string decimal é resposta
 * inválida, porque dinheiro nunca vira `number` na tela.
 */
function isOccurrenceDocument(value: unknown): value is TripOccurrenceDocument {
  if (!isRecord(value)) return false
  const { contractor, destination } = value
  const isContractor =
    contractor === null ||
    (isRecord(contractor) &&
      isNullableString(contractor.contractorId) &&
      isString(contractor.name) &&
      isNullableString(contractor.taxId))
  const isDestination =
    destination === null ||
    (isRecord(destination) &&
      isString(destination.city) &&
      isString(destination.label) &&
      (destination.origin === 'delivery' || destination.origin === 'recipient') &&
      isNullableString(destination.postalCode) &&
      isString(destination.recipientName) &&
      isString(destination.state))
  return (
    isContractor &&
    isDestination &&
    isString(value.nfeDocumentId) &&
    isString(value.totalValue) &&
    /^-?\d+(\.\d+)?$/u.test(value.totalValue) &&
    (value.tripDocumentId === undefined || isNullableString(value.tripDocumentId))
  )
}

function isDetailDriver(value: unknown): value is TripOccurrenceDetailDriver {
  return (
    isRecord(value) &&
    isString(value.driverId) &&
    isString(value.email) &&
    isString(value.name) &&
    isString(value.phone) &&
    isNullableString(value.picturePath) &&
    isNullableString(value.whatsappPhone)
  )
}

const DECIMAL_STRING = /^-?\d+(\.\d+)?$/u

function isDetailItem(value: unknown): value is TripOccurrenceDetailItem {
  return (
    isRecord(value) &&
    isString(value.code) &&
    isString(value.description) &&
    (value.quantity === null ||
      (isString(value.quantity) && DECIMAL_STRING.test(value.quantity))) &&
    isNullableString(value.unit) &&
    (value.declaredAmount === undefined ||
      value.declaredAmount === null ||
      (isString(value.declaredAmount) && DECIMAL_STRING.test(value.declaredAmount)))
  )
}

function isItemValue(value: unknown): value is TripOccurrenceItemValue {
  return (
    isRecord(value) &&
    isString(value.productCode) &&
    isString(value.quantity) &&
    DECIMAL_STRING.test(value.quantity) &&
    isString(value.unitValue) &&
    DECIMAL_STRING.test(value.unitValue) &&
    (value.declaredAmount === null ||
      (isString(value.declaredAmount) && DECIMAL_STRING.test(value.declaredAmount)))
  )
}

function isNullableDecimal(value: unknown): value is null | string {
  return value === null || (isString(value) && DECIMAL_STRING.test(value))
}

function readDetail(payload: unknown): TripOccurrenceDetail {
  if (!isRecord(payload) || !isFeedItem(payload.data)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  const raw = payload.data
  /** Os campos do detalhe ficam fora do guard da linha (que é tolerante, B5/B6) — conferidos aqui. */
  const fields: Readonly<Record<string, unknown>> = raw
  const { actorName, channel, corrections, document, driver, items, onBehalfOfDriverName } = fields
  const { declaredAmount, itemValues, referenceNumber, requirements } = fields
  /** O detalhe nasceu com a 183: aqui `document` ausente é resposta inválida, não API antiga. */
  if (
    document === undefined ||
    !(driver === null || isDetailDriver(driver)) ||
    !Array.isArray(items) ||
    !items.every(isDetailItem) ||
    !(
      corrections === undefined ||
      (Array.isArray(corrections) && corrections.every(isOccurrenceCorrection))
    ) ||
    !isNullableString(actorName) ||
    !isString(channel) ||
    !isNullableString(onBehalfOfDriverName) ||
    !(declaredAmount === undefined || isNullableDecimal(declaredAmount)) ||
    !(referenceNumber === undefined || isNullableString(referenceNumber)) ||
    !(
      requirements === undefined ||
      requirements === null ||
      isOccurrenceRequirements(requirements)
    ) ||
    !(itemValues === undefined || (Array.isArray(itemValues) && itemValues.every(isItemValue)))
  ) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return {
    ...toFeedItem(raw),
    actorName,
    channel,
    corrections: corrections ?? [],
    driver,
    items,
    onBehalfOfDriverName,
  }
}

function readPage(payload: unknown): TripOccurrenceFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.pagination)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isFeedItem)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  const nextCursor = payload.pagination.nextCursor
  if (!isNullableString(nextCursor)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  return { items: payload.data.map(toFeedItem), nextCursor }
}

function isSettlementItem(value: unknown): value is OccurrenceSettlementItem {
  if (!isRecord(value)) return false
  return (
    isString(value.amount) &&
    (OCCURRENCE_SETTLEMENT_AMOUNT_SOURCES as readonly unknown[]).includes(value.amountSource) &&
    (value.payerId === undefined || isString(value.payerId)) &&
    (OCCURRENCE_SETTLEMENT_PAYER_KINDS as readonly unknown[]).includes(value.payerKind) &&
    isString(value.productCode)
  )
}

function readSettlementResult(payload: unknown): OccurrenceSettlementResult {
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !Array.isArray(payload.data.items) ||
    !payload.data.items.every(isSettlementItem) ||
    !isString(payload.data.total)
  ) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return { items: payload.data.items, total: payload.data.total }
}

function isSettlementItemView(value: unknown): value is OccurrenceSettlementItemView {
  if (!isSettlementItem(value)) return false
  const reimbursedAt = (value as Readonly<{ reimbursedAt?: unknown }>).reimbursedAt
  return reimbursedAt === null || isString(reimbursedAt)
}

function readSettlementView(payload: unknown): OccurrenceSettlementView {
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !Array.isArray(payload.data.items) ||
    !payload.data.items.every(isSettlementItemView) ||
    !isString(payload.data.total)
  ) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return { items: payload.data.items, total: payload.data.total }
}

function readReimbursementResult(payload: unknown): Readonly<{ kind: 'changed' | 'unchanged' }> {
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    (payload.data.kind !== 'changed' && payload.data.kind !== 'unchanged')
  ) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return { kind: payload.data.kind }
}

function readCaseActionResult(payload: unknown): CaseActionResult {
  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    (payload.data.kind !== 'changed' && payload.data.kind !== 'unchanged') ||
    !isString(payload.data.status)
  ) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return { kind: payload.data.kind, status: payload.data.status }
}

function readAttachments(payload: unknown): readonly TripOccurrenceAttachment[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isOccurrenceAttachment)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  return payload.data
}

function readResolutionResult(payload: unknown): OccurrenceResolutionResult {
  if (!isRecord(payload) || !isRecord(payload.data)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  const { note, occurrenceId, occurrenceKind, resolvedAt, state } = payload.data
  if (
    !isString(note) ||
    !isString(occurrenceId) ||
    (occurrenceKind !== 'document' && occurrenceKind !== 'stop') ||
    !isString(resolvedAt) ||
    !isString(state)
  ) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return { note, occurrenceId, occurrenceKind, resolvedAt, state }
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return TRIP_ERROR.REQUEST_FAILED
}

async function requestJson(
  dependencies: ClientDependencies,
  path: string,
  init?: Readonly<{ body?: object; method?: 'GET' | 'POST' | 'PUT' }>,
): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${path}`, {
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: init?.method ?? 'GET',
      }),
    )
  } catch {
    throw requestError(TRIP_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw requestError(response.ok ? TRIP_ERROR.RESPONSE_INVALID : TRIP_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

export function createTripOccurrenceFeedClient(
  dependencies: ClientDependencies,
): TripOccurrenceFeedClient {
  return {
    async listAttachments(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/attachments`,
      )
      return readAttachments(payload)
    },
    async readOccurrence(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${encodeURIComponent(input.occurrenceId)}`,
      )
      return readDetail(payload)
    },
    async readOccurrenceTimeline(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${encodeURIComponent(input.occurrenceId)}/timeline`,
      )
      const timeline = isRecord(payload) ? parseOccurrenceTimeline(payload.data) : null
      if (timeline === null) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
      return timeline
    },
    async listOccurrences(input) {
      const search = serializeTripOccurrenceQuery(input)
      const payload = await requestJson(dependencies, `${TRIP_OCCURRENCES_PATH}?${search}`)
      return readPage(payload)
    },
    async reviewOccurrenceCase(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/review`,
        { method: 'POST' },
      )
      return readCaseActionResult(payload)
    },
    async returnOccurrenceCaseToWarehouse(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/warehouse-return`,
        { body: { note: input.note }, method: 'POST' },
      )
      return readCaseActionResult(payload)
    },
    async submitOccurrenceCaseToContractor(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/contractor-submission`,
        { method: 'POST' },
      )
      return readCaseActionResult(payload)
    },
    async closeOccurrenceCase(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/closure`,
        { method: 'POST' },
      )
      return readCaseActionResult(payload)
    },
    async resolveTripOccurrence(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.kind}/${encodeURIComponent(input.occurrenceId)}/resolution`,
        { body: { note: input.note }, method: 'POST' },
      )
      return readResolutionResult(payload)
    },
    async cancelOccurrenceCase(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/cancel`,
        { body: { note: input.note }, method: 'POST' },
      )
      return readCaseActionResult(payload)
    },
    async decideOccurrenceCaseOnBehalfOfContractor(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/decision`,
        { body: { kind: input.kind, note: input.note }, method: 'POST' },
      )
      return readCaseActionResult(payload)
    },
    async findOccurrenceSettlement(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/settlement`,
      )
      return readSettlementView(payload)
    },
    async recordOccurrenceSettlement(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/settlement`,
        { body: { items: input.items }, method: 'PUT' },
      )
      return readSettlementResult(payload)
    },
    async reimburseOccurrenceSettlementItem(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/settlement/reimbursement`,
        { body: { productCode: input.productCode }, method: 'POST' },
      )
      return readReimbursementResult(payload)
    },
  }
}
