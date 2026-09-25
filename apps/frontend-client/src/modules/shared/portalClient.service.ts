/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ChargeBatch,
  ChargeDecision,
  Delivery,
  DeliveryLocation,
  DeliverySchedule,
  Occurrence,
  OccurrenceDecisionInput,
  OccurrenceDecisionResult,
  PortalConversation,
  PortalConversationMessageInput,
  ScheduleInput,
} from './portal.types'
import {
  toChargeBatches,
  toConversation,
  toDeliveries,
  toDeliveryLocation,
  toDeliverySchedule,
  toOccurrenceDecisionResult,
  toOccurrences,
  toSingleChargeBatch,
} from './portalResponse.validation'

const DELIVERIES_PATH = '/client/me/deliveries'
const BATCHES_PATH = '/client/me/extra-charge-batches'
const OCCURRENCES_PATH = '/client/me/occurrences'
/** Spec 183 T653: a conversa é nomeada pela referência opaca que a listagem devolveu. */
const CONVERSATIONS_PATH = '/client/me/occurrence-conversations'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type PortalClient = Readonly<{
  decideBatch: (input: {
    readonly batchId: string
    readonly decisions: readonly ChargeDecision[]
  }) => Promise<ChargeBatch | null>
  decideOccurrence: (input: OccurrenceDecisionInput) => Promise<OccurrenceDecisionResult | null>
  listBatches: () => Promise<readonly ChargeBatch[]>
  listDeliveries: () => Promise<readonly Delivery[]>
  listOccurrences: () => Promise<readonly Occurrence[]>
  markConversationRead: (ref: string) => Promise<void>
  readConversation: (ref: string) => Promise<PortalConversation>
  readLocation: (accessKey: string) => Promise<DeliveryLocation | null>
  schedule: (input: ScheduleInput) => Promise<DeliverySchedule | null>
  sendConversationMessage: (input: PortalConversationMessageInput) => Promise<void>
}>

export class PortalRequestError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code)
    this.name = 'PortalRequestError'
  }
}

/**
 * ⚠️ Um cliente por app, como no painel — e aqui ele é **pequeno de propósito**, e
 * nenhuma delas aceita filtro por documento. A superfície que o portal alcança é a superfície que a
 * API publica em `/client/me/*`, e não há caminho neste arquivo para outra.
 */
export function createPortalClient(dependencies: ClientDependencies): PortalClient {
  async function request(input: {
    readonly body?: unknown
    readonly idempotencyKey?: string
    readonly method: string
    readonly path: string
  }): Promise<unknown> {
    const token = await dependencies.getAccessToken()
    const response = await dependencies.fetch(`${dependencies.apiUrl}${input.path}`, {
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      headers: {
        authorization: `Bearer ${token}`,
        ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(input.idempotencyKey === undefined ? {} : { 'idempotency-key': input.idempotencyKey }),
      },
      method: input.method,
    })

    if (!response.ok) {
      throw new PortalRequestError(await readErrorCode(response), response.status)
    }

    return response.status === 204 ? null : response.json()
  }

  return {
    async decideOccurrence({ kind, note, occurrenceId }) {
      return toOccurrenceDecisionResult(
        await request({
          body: { kind, ...(note === undefined ? {} : { note }) },
          method: 'POST',
          path: `${OCCURRENCES_PATH}/${encodeURIComponent(occurrenceId)}/decision`,
        }),
      )
    },
    async decideBatch({ batchId, decisions }) {
      return toSingleChargeBatch(
        await request({
          body: { decisions },
          method: 'POST',
          path: `${BATCHES_PATH}/${batchId}/decisions`,
        }),
      )
    },
    async listBatches() {
      return toChargeBatches(await request({ method: 'GET', path: BATCHES_PATH }))
    },
    async listDeliveries() {
      return toDeliveries(await request({ method: 'GET', path: DELIVERIES_PATH }))
    },
    async listOccurrences() {
      return toOccurrences(await request({ method: 'GET', path: OCCURRENCES_PATH }))
    },
    async markConversationRead(ref) {
      await request({
        method: 'POST',
        path: `${CONVERSATIONS_PATH}/${encodeURIComponent(ref)}/read`,
      })
    },
    async readConversation(ref) {
      return toConversation(
        await request({ method: 'GET', path: `${CONVERSATIONS_PATH}/${encodeURIComponent(ref)}` }),
      )
    },
    async readLocation(accessKey) {
      return toDeliveryLocation(
        await request({
          method: 'GET',
          path: `${DELIVERIES_PATH}/${encodeURIComponent(accessKey)}/location`,
        }),
      )
    },
    async schedule({ accessKey, notes, protocol, scheduledAt, status }) {
      return toDeliverySchedule(
        await request({
          body: {
            ...(notes === undefined ? {} : { notes }),
            ...(protocol === undefined ? {} : { protocol }),
            scheduledAt,
            status,
          },
          method: 'POST',
          path: `${DELIVERIES_PATH}/${encodeURIComponent(accessKey)}/schedule`,
        }),
      )
    },
    async sendConversationMessage({ body, idempotencyKey, ref }) {
      await request({
        body: { body },
        idempotencyKey,
        method: 'POST',
        path: `${CONVERSATIONS_PATH}/${encodeURIComponent(ref)}/messages`,
      })
    },
  }
}

/**
 * O código do erro é o que a tela mostra — `CONTRACTOR_NOT_BOUND` vira "sua conta ainda não está
 * ligada a um CNPJ". Corpo ilegível vira código genérico: um `catch` que engolisse a resposta
 * deixaria a tela sem o que dizer.
 */
async function readErrorCode(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const { error } = payload
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const { code } = error
        if (typeof code === 'string' && code !== '') return code
      }
    }
  } catch {
    /* corpo que não é JSON não muda o que a tela pode dizer */
  }

  return 'PORTAL_REQUEST_FAILED'
}
