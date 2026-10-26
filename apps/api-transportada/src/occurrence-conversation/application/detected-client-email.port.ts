/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF8 (T4b): o que o reconhecimento do e-mail na conversa lê e grava. Tudo pela empresa do contexto; o
 * endereço em claro só passa entre o banco e o trilho de envio, nunca em log, evento ou resposta.
 */
import type {
  ClientEmailSendMode,
  ClientEmailType,
} from '../../shared/delivery-client-email.constant.js'

/** O que decide se o e-mail da conversa vale: o boleto aceito e o tipo da ocorrência (RF9/RF10). */
export type DetectedClientEmailSendState = {
  readonly boletoAccepted: boolean
  readonly clientEmailSendMode: ClientEmailSendMode
  readonly clientEmailType: ClientEmailType
}

export type DetectedClientEmailRecord = {
  readonly address: string
  readonly conversationId: string
  readonly createdAt: Date
  readonly messageId: string
  readonly sentAt: Date | null
}

export type DetectedClientEmailStorePort = {
  /** A ocorrência da conversa do **motorista** sobre uma ocorrência; `null` em qualquer outra conversa. */
  findDriverOccurrence(params: {
    readonly companyId: string
    readonly conversationId: string
  }): Promise<null | string>
  readSendState(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<DetectedClientEmailSendState | null>
  markDetected(params: {
    readonly address: string
    readonly companyId: string
    readonly messageId: string
  }): Promise<void>
  markSent(params: {
    readonly companyId: string
    readonly messageId: string
    readonly sentAt: Date
  }): Promise<void>
  /** O mais recente ainda não enviado, das conversas do motorista sobre a ocorrência. */
  findPending(params: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<DetectedClientEmailRecord | null>
  findDetected(params: {
    readonly companyId: string
    readonly messageId: string
    readonly occurrenceId: string
  }): Promise<DetectedClientEmailRecord | null>
  /** O aviso do WhatsApp fica na conversa com o id da Meta: a resposta "1" a ele volta para a mesma conversa. */
  recordWhatsAppPrompt(params: {
    readonly bodyText: string
    readonly companyId: string
    readonly conversationId: string
    readonly providerMessageId: null | string
    readonly sentAt: Date
  }): Promise<void>
}
