/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF8 (T4b): a extração única do e-mail que o motorista escreve na conversa da ocorrência ("manda pra
 * fulano@mercado.com"). Só o texto da mensagem, nunca anexo; só o **primeiro** endereço válido, pela mesma régua do
 * endereço informado da 248 (um endereço, até 254, sem `\r\n,;<>`). Endereço mascarado ("a***@m***.com") não passa.
 * No WhatsApp, o motorista confirma o envio respondendo "1" ao aviso.
 */
import { parseContractorReplyEmailAddress } from './contractor-reply-email-address.policy.js'

/** Um pedaço sem espaço com `@` no meio; a pontuação de borda sai antes da validação. */
const CANDIDATE = /[^\s<>()[\]{}"'`,;]+@[^\s<>()[\]{}"'`,;]+/gu
const LEADING_NOISE = /^(?:mailto:|[.:!?*_-]+)/iu
const TRAILING_NOISE = /[.:!?…*_-]+$/u

export const DETECTED_EMAIL_CONFIRMATION = '1'

/** `null` quando o texto não traz um endereço válido; senão o primeiro, como foi escrito (sem a pontuação de borda). */
export function detectClientEmailAddress(text: string): null | string {
  for (const match of text.matchAll(CANDIDATE)) {
    const candidate = match[0].replace(LEADING_NOISE, '').replace(TRAILING_NOISE, '')
    const address = parseContractorReplyEmailAddress(candidate)
    if (address !== null) return address
  }
  return null
}

/** A resposta "1" ao aviso do WhatsApp; qualquer outro texto não confirma nada. */
export function isDetectedEmailConfirmation(text: string): boolean {
  return text.trim() === DETECTED_EMAIL_CONFIRMATION
}

/** O aviso do WhatsApp leva só a forma mascarada: o motorista reconhece o que escreveu, o canal não leva o endereço. */
export function buildDetectedEmailWhatsAppPrompt(addressMasked: string): string {
  return [
    `Enviar o boleto para ${addressMasked}?`,
    `Responda a esta mensagem com ${DETECTED_EMAIL_CONFIRMATION} para enviar.`,
  ].join('\n')
}
