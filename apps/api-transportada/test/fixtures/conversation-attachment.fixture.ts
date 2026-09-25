/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a: as portas de anexo para as suítes que não mexem em anexo. Enviar sem anexo não
 * chama nenhuma delas; se alguma for chamada, a suíte quebra em vez de passar em silêncio.
 */
import type {
  ConversationAttachmentStoragePort,
  ConversationAttachmentTransactionPort,
} from '../../src/occurrence-conversation/application/conversation-attachment.port.js'

function unexpected(name: string): never {
  throw new Error(`porta de anexo chamada sem anexo: ${name}`)
}

export const NO_ATTACHMENTS: ConversationAttachmentTransactionPort = {
  attachUpload: async () => unexpected('attachUpload'),
  lockPendingUploads: async () => unexpected('lockPendingUploads'),
}

/** A leitura sem anexo não assina nada; a lista vazia é a resposta de quem não tem anexo. */
export const listNoAttachments = async () => []

export const UNUSED_ATTACHMENT_STORAGE: ConversationAttachmentStoragePort = {
  createSignedDownload: async () => unexpected('createSignedDownload'),
  createSignedUpload: async () => unexpected('createSignedUpload'),
  getObjectStream: async () => unexpected('getObjectStream'),
  headObject: async () => unexpected('headObject'),
}
