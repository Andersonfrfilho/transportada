/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RabbitMqDisposition } from '@adatechnology/rabbitmq-provider'

import { WhatsAppRecipientInvalidError } from '../whatsapp/infrastructure/whatsapp-code-sender.gateway.js'

/**
 * Convite e recuperação de senha decidem a falha num lugar só, e por classe — nunca pela mensagem.
 *
 * Vai para a dead queue o que é defeito **do dado da mensagem**: contato que não é telefone
 * brasileiro continua não sendo na sexta tentativa, e cada uma reabriria o envelope do código.
 *
 * Fica em `retry` o que é defeito **do ambiente**: `InvitationChannelUnavailableError` (driver do
 * canal ausente) e `WhatsAppChannelNotConfiguredError` (empresa sem canal ativo) se corrigem por
 * configuração durante a janela, e a tentativa seguinte entrega sem ninguém reenviar o convite.
 * O resto — SMTP fora, Meta fora, banco fora — é transporte, e transporte é retry.
 */
export function resolveCodeDeliveryFailureDisposition(error: unknown): RabbitMqDisposition {
  if (error instanceof WhatsAppRecipientInvalidError) return { type: 'dead-letter' }

  return { type: 'retry' }
}
