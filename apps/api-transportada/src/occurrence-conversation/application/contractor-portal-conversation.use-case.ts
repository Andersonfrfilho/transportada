/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651 (RF21, D9, ADR-0073): a contratante lê, escreve e marca como lida a conversa dela
 * pelo portal. O recorte sai do porto do escopo (`resolveContractorScope`) antes de qualquer leitura;
 * a referência é a `public_ref` aleatória — fora do formato, ou com cara de id interno, nem chega ao
 * banco. Os três "não é seu" (outra contratante, inexistente, ocorrência ainda não visível) viram o
 * mesmo 404 da 164. A resposta não carrega id, autor da transportadora nem endereço: só o lado, se
 * foi a própria conta, o canal e o texto. Nada aqui muda a tratativa (D4).
 */
import type { IdempotencyFingerprintPort } from '../../companies/application/company-settings.port.js'
import { ContractorOccurrenceNotFoundError } from '../../contractor-portal/domain/contractor-portal.error.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import {
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationMessageInvalidError,
} from '../domain/occurrence-conversation.error.js'
import type {
  ContractorPortalConversationTransactionPort,
  ContractorPortalConversationUnitOfWorkPort,
  ContractorPortalScopePort,
  PortalConversationMessageRecord,
  PortalConversationSummary,
} from './contractor-portal-conversation.port.js'

export const PORTAL_CONVERSATION_SEND_OPERATION = 'occurrence-conversation.portal.send'

/** O formato do CHECK de `occurrence_conversations.public_ref`. */
const REF_PATTERN = /^[A-Za-z0-9_-]{22,64}$/u
/** Um UUID também cabe no padrão acima; o id interno nunca é aceito no lugar da referência. */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

const ENCODER = new TextEncoder()

export type PortalConversationMessageView = {
  readonly body: string
  readonly channel: PortalConversationMessageRecord['channel']
  readonly createdAt: string
  /** A própria conta do portal escreveu esta — o portal a põe do lado de quem lê. */
  readonly mine: boolean
  /** A cor segue o participante (D9): a transportadora como empresa, a contratante como ela. */
  readonly side: 'carrier' | 'contractor'
}

export type PortalConversationView = {
  readonly messages: readonly PortalConversationMessageView[]
  readonly unreadCount: number
}

export type ContractorPortalConversationUseCase = {
  conversationRefs(input: {
    readonly context: CompanyContext
    readonly occurrenceIds: readonly string[]
  }): Promise<ReadonlyMap<string, PortalConversationSummary>>
  markRead(input: { readonly context: CompanyContext; readonly ref: string }): Promise<void>
  read(input: {
    readonly context: CompanyContext
    readonly ref: string
  }): Promise<PortalConversationView>
  send(input: {
    readonly bodyText: string
    readonly context: CompanyContext
    readonly idempotencyKey: string
    readonly ref: string
  }): Promise<{ readonly createdAt: string }>
}

function isRef(value: string): boolean {
  return REF_PATTERN.test(value) && !UUID_SHAPE.test(value)
}

function normalizeText(bodyText: string): string {
  const body = bodyText.trim()
  if (body === '' || body.length > OCCURRENCE_MAIL_LIMITS.body) {
    throw new OccurrenceConversationMessageInvalidError()
  }
  return body
}

function toView(
  record: PortalConversationMessageRecord,
  userId: string,
): PortalConversationMessageView {
  return {
    body: record.bodyText,
    channel: record.channel,
    createdAt: record.createdAt.toISOString(),
    mine: record.channel === 'portal' && record.authorUserId === userId,
    side: record.direction === 'outbound' ? 'carrier' : 'contractor',
  }
}

export function createContractorPortalConversationUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly newRef: () => string
  readonly scopes: ContractorPortalScopePort
  readonly unitOfWork: ContractorPortalConversationUnitOfWorkPort
}): ContractorPortalConversationUseCase {
  /** Recorte primeiro, conversa depois; referência inválida é o mesmo 404, sem tocar o banco. */
  async function withConversation<TResult>(
    input: { readonly context: CompanyContext; readonly ref: string },
    work: (
      transaction: ContractorPortalConversationTransactionPort,
      conversationId: string,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    if (!isRef(input.ref)) throw new ContractorOccurrenceNotFoundError()
    const scope = await dependencies.scopes.resolveScope({ context: input.context })
    return dependencies.unitOfWork.execute(async (transaction) => {
      const conversation = await transaction.findConversation({
        companyId: input.context.companyId,
        ref: input.ref,
        scope,
      })
      if (conversation === null) throw new ContractorOccurrenceNotFoundError()
      return work(transaction, conversation.id)
    })
  }

  return {
    async conversationRefs({ context, occurrenceIds }) {
      if (occurrenceIds.length === 0) return new Map()
      const scope = await dependencies.scopes.resolveScope({ context })
      return dependencies.unitOfWork.execute((transaction) =>
        transaction.ensureConversationRefs({
          companyId: context.companyId,
          newRef: dependencies.newRef,
          occurrenceIds,
          scope,
          userId: context.userId,
        }),
      )
    },

    async markRead(input) {
      await withConversation(input, (transaction, conversationId) =>
        transaction.markRead({
          at: dependencies.clock(),
          companyId: input.context.companyId,
          conversationId,
          userId: input.context.userId,
        }),
      )
    },

    async read(input) {
      return withConversation(input, async (transaction, conversationId) => {
        const target = { companyId: input.context.companyId, conversationId }
        const [messages, unreadCount] = await Promise.all([
          transaction.listMessages(target),
          transaction.unreadCount({ ...target, userId: input.context.userId }),
        ])
        return {
          messages: messages.map((message) => toView(message, input.context.userId)),
          unreadCount,
        }
      })
    },

    async send(input) {
      const bodyText = normalizeText(input.bodyText)
      const { companyId, userId } = input.context
      return withConversation(input, async (transaction, conversationId) => {
        const fingerprint = await dependencies.fingerprintService.create({
          fields: [companyId, input.ref, userId, bodyText].map((value) => ENCODER.encode(value)),
          operation: PORTAL_CONVERSATION_SEND_OPERATION,
        })
        const key = {
          companyId,
          idempotencyKey: input.idempotencyKey,
          operation: PORTAL_CONVERSATION_SEND_OPERATION,
        }
        const replay = await transaction.findIdempotency(key)
        if (replay !== null) {
          if (replay.fingerprint !== fingerprint) {
            throw new OccurrenceConversationIdempotencyKeyReusedError()
          }
          return replay.response as { readonly createdAt: string }
        }
        const message = await transaction.insertPortalMessage({
          authorUserId: userId,
          bodyText,
          companyId,
          conversationId,
          createdAt: dependencies.clock(),
        })
        const response = { createdAt: message.createdAt.toISOString() }
        await transaction.saveIdempotency({ ...key, fingerprint, response })
        return response
      })
    },
  }
}
