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
import { OccurrenceConversationIdempotencyKeyReusedError } from '../domain/occurrence-conversation.error.js'
import type {
  ConversationAttachmentStoragePort,
  ConversationAttachmentView,
  ConversationUploadRepositoryPort,
  ConversationUploadTarget,
} from './conversation-attachment.port.js'
import {
  attachConversationUploads,
  normalizeConversationMessageBody,
  requestConversationUpload,
  type RequestConversationUploadResult,
  signConversationAttachments,
} from './conversation-attachment.service.js'
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

/** O anexo como o portal vê: sem id — só o que baixar e como mostrar. */
export type PortalConversationAttachmentView = {
  readonly contentType: string
  readonly fileName: string
  readonly sizeBytes: number
  /** URL temporária (cinco minutos); a chave do objeto é um token, sem id interno. */
  readonly url: string
}

export type PortalConversationMessageView = {
  readonly attachments: readonly PortalConversationAttachmentView[]
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
    /** Spec 183 T702a (RF10): pedidos de upload desta conta para esta conversa. */
    readonly attachmentIds?: readonly string[]
    readonly bodyText: string
    readonly context: CompanyContext
    readonly idempotencyKey: string
    readonly ref: string
  }): Promise<{ readonly createdAt: string }>
}

function isRef(value: string): boolean {
  return REF_PATTERN.test(value) && !UUID_SHAPE.test(value)
}

/** Sem o id do anexo: o portal não vê id interno. */
function toPortalAttachment(view: ConversationAttachmentView): PortalConversationAttachmentView {
  return {
    contentType: view.contentType,
    fileName: view.fileName,
    sizeBytes: view.sizeBytes,
    url: view.url,
  }
}

function toView(
  record: PortalConversationMessageRecord,
  userId: string,
  attachments: readonly PortalConversationAttachmentView[],
): PortalConversationMessageView {
  return {
    attachments,
    body: record.bodyText,
    channel: record.channel,
    createdAt: record.createdAt.toISOString(),
    mine: record.channel === 'portal' && record.authorUserId === userId,
    side: record.direction === 'outbound' ? 'carrier' : 'contractor',
  }
}

type FoundPortalConversation = NonNullable<
  Awaited<ReturnType<ContractorPortalConversationTransactionPort['findConversation']>>
>

/** Recorte primeiro, conversa depois; referência inválida é o mesmo 404, sem tocar o banco. */
async function withPortalConversation<TResult>(
  dependencies: {
    readonly scopes: ContractorPortalScopePort
    readonly unitOfWork: ContractorPortalConversationUnitOfWorkPort
  },
  input: { readonly context: CompanyContext; readonly ref: string },
  work: (
    transaction: ContractorPortalConversationTransactionPort,
    conversation: FoundPortalConversation,
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
    return work(transaction, conversation)
  })
}

/** O anexo do portal é sempre da conversa com a contratante, pelo canal portal, pedido pela conta. */
function portalUploadTarget(
  context: CompanyContext,
  conversation: FoundPortalConversation,
): ConversationUploadTarget {
  return {
    channel: 'portal',
    companyId: context.companyId,
    occurrenceId: conversation.occurrenceId,
    occurrenceKind: conversation.occurrenceKind,
    participant: 'contractor',
    requestedByUserId: context.userId,
  }
}

export function createContractorPortalConversationUseCase(dependencies: {
  readonly clock: () => Date
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly newRef: () => string
  readonly scopes: ContractorPortalScopePort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: ContractorPortalConversationUnitOfWorkPort
}): ContractorPortalConversationUseCase {
  const withConversation = <TResult>(
    input: { readonly context: CompanyContext; readonly ref: string },
    work: (
      transaction: ContractorPortalConversationTransactionPort,
      conversation: FoundPortalConversation,
    ) => Promise<TResult>,
  ) => withPortalConversation(dependencies, input, work)

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
      await withConversation(input, (transaction, conversation) =>
        transaction.markRead({
          at: dependencies.clock(),
          companyId: input.context.companyId,
          conversationId: conversation.id,
          userId: input.context.userId,
        }),
      )
    },

    async read(input) {
      return withConversation(input, async (transaction, conversation) => {
        const target = { companyId: input.context.companyId, conversationId: conversation.id }
        const [messages, unreadCount] = await Promise.all([
          transaction.listMessages(target),
          transaction.unreadCount({ ...target, userId: input.context.userId }),
        ])
        const attachments = await signConversationAttachments(
          dependencies.storage,
          await transaction.listAttachments({
            companyId: input.context.companyId,
            messageIds: messages.map((message) => message.id),
          }),
        )
        return {
          messages: messages.map((message) =>
            toView(
              message,
              input.context.userId,
              (attachments.get(message.id) ?? []).map(toPortalAttachment),
            ),
          ),
          unreadCount,
        }
      })
    },

    async send(input) {
      const attachmentIds = input.attachmentIds ?? []
      const bodyText = normalizeConversationMessageBody(input.bodyText, attachmentIds)
      const { companyId, userId } = input.context
      return withConversation(input, async (transaction, conversation) => {
        const fingerprint = await dependencies.fingerprintService.create({
          fields: [companyId, input.ref, userId, bodyText, attachmentIds.join(',')].map((value) =>
            ENCODER.encode(value),
          ),
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
        const now = dependencies.clock()
        const message = await transaction.insertPortalMessage({
          authorUserId: userId,
          bodyText,
          companyId,
          conversationId: conversation.id,
          createdAt: now,
        })
        await attachConversationUploads({
          messageId: message.id,
          now,
          storage: dependencies.storage,
          target: portalUploadTarget(input.context, conversation),
          transaction: transaction.attachments,
          uploadIds: attachmentIds,
        })
        const response = { createdAt: message.createdAt.toISOString() }
        await transaction.saveIdempotency({ ...key, fingerprint, response })
        return response
      })
    },
  }
}

/**
 * Spec 183 T702a (RF10): a contratante pede a URL de subida pela referência da conversa. A resposta
 * leva só o pedido dela (o id que ela mesma vai devolver no envio), o prazo e a URL — a chave dentro
 * da URL é um token, sem id interno.
 */
export function createRequestPortalConversationUploadUseCase(dependencies: {
  readonly bucket: string
  readonly clock: () => Date
  readonly newId: () => string
  readonly repository: ConversationUploadRepositoryPort
  readonly scopes: ContractorPortalScopePort
  readonly storage: ConversationAttachmentStoragePort
  readonly unitOfWork: ContractorPortalConversationUnitOfWorkPort
}) {
  return {
    async request(input: {
      readonly contentType: string
      readonly context: CompanyContext
      readonly fileName: string
      readonly ref: string
      readonly sizeBytes: number
    }): Promise<RequestConversationUploadResult> {
      const conversation = await withPortalConversation(
        dependencies,
        input,
        async (_, found) => found,
      )
      return requestConversationUpload({
        bucket: dependencies.bucket,
        contentType: input.contentType,
        fileName: input.fileName,
        newId: dependencies.newId,
        now: dependencies.clock(),
        repository: dependencies.repository,
        sizeBytes: input.sizeBytes,
        storage: dependencies.storage,
        target: portalUploadTarget(input.context, conversation),
      })
    },
  }
}
