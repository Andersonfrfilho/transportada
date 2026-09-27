/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): o que o cliente declara ao pedir o upload de um anexo, e a lista de anexos
 * que acompanha o envio. O teto de verdade (tipo e tamanho por canal) é da política de domínio; aqui
 * só a forma — nada de empresa, ocorrência ou participante no corpo.
 */
import { z } from 'zod'

import { CONVERSATION_ATTACHMENTS_PER_MESSAGE } from '../domain/conversation-attachment.policy.js'

/** O maior teto da política (documento pelo WhatsApp, 100 MB); a política decide o do canal. */
const MAX_DECLARED_BYTES = 100 * 1024 * 1024
/** O nome do sistema de arquivos; a política apara para 200 ao gravar. */
const MAX_DECLARED_FILE_NAME = 255

export const conversationUploadFields = {
  contentType: z.string().min(1).max(100),
  fileName: z.string().min(1).max(MAX_DECLARED_FILE_NAME),
  sizeBytes: z.number().int().positive().max(MAX_DECLARED_BYTES),
}

export const conversationUploadSchema = z.object(conversationUploadFields).strict()

export const conversationAttachmentIdsSchema = z
  .array(z.string().uuid())
  .max(CONVERSATION_ATTACHMENTS_PER_MESSAGE)
  .optional()
