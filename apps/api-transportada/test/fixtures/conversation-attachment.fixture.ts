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
  deleteObject: async () => unexpected('deleteObject'),
  getObjectStream: async () => unexpected('getObjectStream'),
  headObject: async () => unexpected('headObject'),
  storeObject: async () => unexpected('storeObject'),
}

/** Para as suítes com anexo: a URL assinada é fixa por chave, e é só isso que a leitura pede ao storage. */
export const SIGNING_ATTACHMENT_STORAGE: ConversationAttachmentStoragePort = {
  ...UNUSED_ATTACHMENT_STORAGE,
  createSignedDownload: async (input) => new URL(`https://storage.test/${input.key}`),
}
