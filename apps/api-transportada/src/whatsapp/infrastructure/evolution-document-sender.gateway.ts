/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  EvolutionError,
  EvolutionWhatsAppChannel,
} from '@adatechnology/evolution-whatsapp-provider'

import {
  ContractorReplyWhatsAppSendError,
  type ContractorReplyWhatsAppSenderPort,
  type ContractorReplyWhatsAppSendFailure,
} from '../../occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import type { ClientReplyWhatsAppSenderPort } from '../../occurrence-conversation/application/send-client-reply.port.js'
import type { WhatsAppEvolutionRepositoryPort } from '../application/whatsapp-evolution.port.js'
import type { WhatsAppEvolutionSecretService } from '../application/whatsapp-evolution-secret.service.js'

/** O envio de um arquivo pode levar mais que o padrão de 15 s do SDK: o Evolution sobe o PDF ao WhatsApp antes de responder. */
const SEND_TIMEOUT_MS = 60_000

/**
 * Spec 281 T5: o envio do boleto pelo Evolution da empresa. A chave da instância (T4) é aberta por chamada e só vive
 * dentro dela; nada daqui vai a log. O erro do provedor vira um motivo fechado:
 *
 * - `400`: o Evolution recusa o número (no v2, "exists: false" — o número não tem WhatsApp) → `number_not_found`;
 * - `401`/`403`/`404`, rede ou tempo esgotado: a instância não está lá para falar → `disconnected`;
 * - o resto (`5xx`, resposta estranha) → `failed`.
 */
type EvolutionSenderDependencies = {
  readonly fetch?: typeof fetch
  readonly repository: Pick<WhatsAppEvolutionRepositoryPort, 'findCredential'>
  readonly secrets: Pick<WhatsAppEvolutionSecretService, 'decrypt'>
}

export function createEvolutionDocumentSender(
  dependencies: EvolutionSenderDependencies,
): ContractorReplyWhatsAppSenderPort & ClientReplyWhatsAppSenderPort {
  async function open(companyId: string): Promise<EvolutionWhatsAppChannel> {
    const credential = await dependencies.repository.findCredential({ companyId })
    if (credential === null || credential.status !== 'active') {
      throw new ContractorReplyWhatsAppSendError('disconnected')
    }
    const { apiKey } = await dependencies.secrets.decrypt({
      companyId,
      envelope: credential.envelope,
      settingsId: credential.settingsId,
    })
    return new EvolutionWhatsAppChannel({
      apiKey,
      baseUrl: credential.baseUrl,
      instance: credential.instanceName,
      timeoutMs: SEND_TIMEOUT_MS,
      ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
    })
  }

  return {
    async isConnected({ companyId }) {
      const channel = await open(companyId)
      return (await channel.getConnectionState()) === 'open'
    },

    async sendDocument(params) {
      const channel = await open(params.companyId)
      try {
        const sent = await channel.sendMedia({
          buffer: Buffer.from(params.bytes),
          caption: params.caption,
          filename: params.fileName,
          mimeType: params.mimeType,
          to: params.number,
        })
        return { providerMessageId: sent.externalMessageId }
      } catch (error) {
        throw new ContractorReplyWhatsAppSendError(classify(error))
      }
    },

    /** Spec 283 T5 (D6): a resposta do painel ao cliente, só texto. */
    async sendText(params) {
      const channel = await open(params.companyId)
      try {
        const sent = await channel.sendText(params.number, params.body)
        return { providerMessageId: sent.externalMessageId }
      } catch (error) {
        throw new ContractorReplyWhatsAppSendError(classify(error))
      }
    },
  }
}

function classify(error: unknown): ContractorReplyWhatsAppSendFailure {
  if (!(error instanceof EvolutionError)) return 'failed'
  const status = error.statusCode
  if (status === 400) return 'number_not_found'
  if (status === undefined || status === 401 || status === 403 || status === 404) {
    return 'disconnected'
  }
  return 'failed'
}
