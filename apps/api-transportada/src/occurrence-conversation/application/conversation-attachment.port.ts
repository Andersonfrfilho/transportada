/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): as portas do anexo da conversa — o pedido de upload (URL assinada, o
 * arquivo nunca passa pela API na subida), a conferência pelos bytes no envio da mensagem e a URL
 * temporária de leitura.
 */
import type {
  OccurrenceConversationChannel,
  OccurrenceConversationKind,
  OccurrenceConversationParticipant,
} from '../../database/occurrence-conversation.schema.js'

/** A conversa e o canal a que o anexo vai, e quem pediu. Tudo vem do contexto, nunca do corpo. */
export type ConversationUploadTarget = {
  readonly channel: OccurrenceConversationChannel
  readonly companyId: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceConversationKind
  readonly participant: OccurrenceConversationParticipant
  readonly requestedByUserId: string
}

export type PendingConversationUpload = {
  readonly bucket: string
  readonly declaredContentType: string
  readonly expiresAt: Date
  readonly fileName: string
  readonly id: string
  readonly objectKey: string
}

export type ConversationAttachmentStoragePort = {
  createSignedDownload(input: {
    readonly bucket: string
    readonly disposition: 'attachment' | 'inline'
    readonly expiresInSeconds: number
    readonly filename: string
    readonly key: string
  }): Promise<URL>
  createSignedUpload(input: {
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly expiresInSeconds: number
    readonly key: string
  }): Promise<URL>
  getObjectStream(input: {
    readonly bucket: string
    readonly key: string
  }): Promise<ReadableStream<Uint8Array>>
  headObject(input: {
    readonly bucket: string
    readonly key: string
  }): Promise<{ readonly contentLength: number } | undefined>
  /**
   * Spec 183 T903 (S1): a cópia final dos bytes conferidos, numa chave que nenhuma URL assinada
   * alcança, e a remoção da chave da subida (ou da cópia, quando a ligação falha).
   */
  storeObject(input: {
    readonly body: Uint8Array
    readonly bucket: string
    readonly contentLength: number
    readonly contentType: string
    readonly key: string
    readonly sha256: string
  }): Promise<unknown>
  deleteObject(input: { readonly bucket: string; readonly key: string }): Promise<void>
}

export type ConversationUploadRepositoryPort = {
  insertUpload(
    input: ConversationUploadTarget & {
      readonly bucket: string
      readonly declaredContentType: string
      readonly declaredSizeBytes: number
      readonly expiresAt: Date
      readonly fileName: string
      readonly id: string
      readonly objectKey: string
    },
  ): Promise<void>
}

/** Dentro da transação da mensagem: o anexo só existe se a mensagem existir (FK `message_id`). */
export type ConversationAttachmentTransactionPort = {
  /**
   * Trava e devolve os pedidos `pending` **deste** alvo (empresa, ocorrência, participante, canal e
   * quem pediu). Pedido de outra pessoa, de outra conversa ou já usado simplesmente não volta.
   */
  lockPendingUploads(input: {
    readonly ids: readonly string[]
    readonly target: ConversationUploadTarget
  }): Promise<readonly PendingConversationUpload[]>
  /** Grava o objeto final, o anexo da mensagem e fecha o pedido como `attached`. */
  attachUpload(input: {
    readonly bucket: string
    readonly companyId: string
    readonly contentType: string
    readonly fileName: string
    readonly messageId: string
    readonly now: Date
    readonly objectKey: string
    readonly sha256: string
    readonly sizeBytes: number
    readonly uploadId: string
  }): Promise<void>
}

/** O anexo como as leituras o devolvem, antes de assinar a URL. */
export type ConversationAttachmentRecord = {
  readonly bucket: string
  readonly contentType: string
  readonly fileName: string
  readonly id: string
  readonly messageId: string
  readonly objectKey: string
  readonly sizeBytes: number
}

export type ConversationAttachmentView = {
  readonly contentType: string
  readonly fileName: string
  readonly id: string
  readonly sizeBytes: number
  /** URL temporária (5 min), assinada na leitura. */
  readonly url: string
}
