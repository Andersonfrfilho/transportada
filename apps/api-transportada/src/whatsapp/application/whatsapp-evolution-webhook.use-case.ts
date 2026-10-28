/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (RF4, D6): o webhook do Evolution — apontá-lo para a API e receber o que ele entrega.
 *
 * O Evolution **não assina o corpo**: o que ele faz é repetir, em toda entrega, os cabeçalhos com que
 * o webhook da instância foi criado. A prova de origem é então um segredo por empresa, gerado aqui,
 * selado no banco e comparado em tempo constante (`verifyEvolutionWebhookSecret` do SDK). A URL leva
 * só o `webhookId` opaco, que acha a empresa; sem o segredo certo a resposta é 401, igual para id que
 * não existe, envelope que não abre e segredo errado.
 *
 * Anti-replay: sem carimbo de tempo assinado, a repetição é neutralizada pelo efeito — mensagem grava
 * uma vez só pelo id do provedor (`unique` no canal), status só avança, e conexão é o último estado.
 * Uma entrega capturada e reenviada não cria nada que a primeira não tenha criado.
 *
 * ⚠️ Nada de número, texto, segredo ou URL em log: só empresa, contagens e motivo.
 */
import {
  evolutionWebhookInstance,
  parseEvolutionWebhook,
  verifyEvolutionWebhookSecret,
} from '@adatechnology/evolution-whatsapp-provider'

import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { EvolutionConversationInbound } from '../../occurrence-conversation/application/evolution-conversation-inbound.service.js'
import { API_PUBLIC_WHATSAPP_EVOLUTION_WEBHOOK_PATH } from '../../shared/api.constant.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  WhatsAppEvolutionDisabledError,
  WhatsAppEvolutionNotConfiguredError,
  WhatsAppEvolutionUnreachableError,
  WhatsAppEvolutionWebhookUrlMissingError,
} from '../domain/whatsapp-evolution.error.js'
import type { WhatsAppEvolutionSecretService } from './whatsapp-evolution-secret.service.js'
import type {
  WhatsAppEvolutionWebhookGatewayPort,
  WhatsAppEvolutionWebhookRegistration,
  WhatsAppEvolutionWebhookRepositoryPort,
} from './whatsapp-evolution-webhook.port.js'
import type { WhatsAppEvolutionWebhookSecretService } from './whatsapp-evolution-webhook-secret.service.js'

/** O cabeçalho que o Evolution repete em toda entrega; o valor é o segredo da empresa. */
export const EVOLUTION_WEBHOOK_TOKEN_HEADER = 'x-transportada-webhook-token'

const WEBHOOK_REGISTERED_ACTION = 'whatsapp-evolution.webhook.registered'
/** Segredo é base64url de 32 bytes (43 caracteres); qualquer coisa muito maior nem chega ao banco. */
const MAX_TOKEN_LENGTH = 256
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export const WHATSAPP_EVOLUTION_WEBHOOK_LOG = {
  disabled: 'whatsapp_evolution.webhook.disabled',
  instanceMismatch: 'whatsapp_evolution.webhook.instance_mismatch',
  received: 'whatsapp_evolution.webhook.received',
  registerFailed: 'whatsapp_evolution.webhook.register_failed',
  rejected: 'whatsapp_evolution.webhook.rejected',
} as const

export type WhatsAppEvolutionWebhookReceipt = {
  readonly outcome: 'accepted' | 'ignored' | 'unauthorized'
}

export type WhatsAppEvolutionWebhookUseCase = {
  /** Chamado pelo fluxo do QR: aponta o webhook uma vez, sem trocar segredo; falha não derruba o QR. */
  ensureRegistered(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
  }): Promise<void>
  receive(input: {
    readonly correlationId: string
    readonly rawBody: string
    readonly token: null | string
    readonly webhookId: string
  }): Promise<WhatsAppEvolutionWebhookReceipt>
  /** A rota do dono: aponta de novo e troca o segredo (`rotate`), por exemplo depois de um vazamento. */
  register(input: {
    readonly context: CompanyContext
    readonly correlationId: string
  }): Promise<{ readonly registeredAt: string }>
}

export function createWhatsAppEvolutionWebhookUseCase(dependencies: {
  /** `API_PUBLIC_URL`; ausente, receber continua funcionando, mas apontar o webhook é recusado. */
  readonly apiPublicUrl: string | undefined
  readonly apiKeySecrets: Pick<WhatsAppEvolutionSecretService, 'decrypt'>
  readonly gateway: WhatsAppEvolutionWebhookGatewayPort
  readonly inbound: EvolutionConversationInbound
  readonly logger: ApiLogger
  readonly repository: WhatsAppEvolutionWebhookRepositoryPort
  readonly webhookSecrets: WhatsAppEvolutionWebhookSecretService
}): WhatsAppEvolutionWebhookUseCase {
  const { gateway, logger, repository, webhookSecrets } = dependencies

  async function point(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly registration: WhatsAppEvolutionWebhookRegistration
    readonly rotate: boolean
  }): Promise<Date> {
    const { companyId, registration } = input
    if (dependencies.apiPublicUrl === undefined) throw new WhatsAppEvolutionWebhookUrlMissingError()
    const scope = { companyId, settingsId: registration.settingsId }

    let webhookToken: string
    if (input.rotate || registration.webhookEnvelope === null) {
      webhookToken = webhookSecrets.generate()
      await repository.storeSecret({
        ...scope,
        envelope: await webhookSecrets.encrypt({ ...scope, webhookToken }),
      })
    } else {
      ;({ webhookToken } = await webhookSecrets.decrypt({
        ...scope,
        envelope: registration.webhookEnvelope,
      }))
    }

    const { apiKey } = await dependencies.apiKeySecrets.decrypt({
      ...scope,
      envelope: registration.apiKeyEnvelope,
    })
    try {
      await gateway.setWebhook({
        apiKey,
        baseUrl: registration.baseUrl,
        headers: { [EVOLUTION_WEBHOOK_TOKEN_HEADER]: webhookToken },
        instanceName: registration.instanceName,
        url: webhookUrl(dependencies.apiPublicUrl, registration.webhookId),
      })
    } catch {
      throw new WhatsAppEvolutionUnreachableError()
    }

    return repository.markRegistered({
      audit: {
        action: WEBHOOK_REGISTERED_ACTION,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
      },
      companyId,
      rotated: input.rotate || registration.webhookEnvelope === null,
      settingsId: registration.settingsId,
    })
  }

  return {
    async ensureRegistered({ actorUserId, companyId, correlationId }) {
      if (dependencies.apiPublicUrl === undefined) return
      try {
        const registration = await repository.findRegistration({ companyId })
        if (
          registration === null ||
          registration.status !== 'active' ||
          registration.registeredAt !== null
        ) {
          return
        }
        await point({ actorUserId, companyId, correlationId, registration, rotate: false })
      } catch (error) {
        logger.warn(WHATSAPP_EVOLUTION_WEBHOOK_LOG.registerFailed, {
          companyId,
          correlationId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
      }
    },

    async receive({ correlationId, rawBody, token, webhookId }) {
      const unauthorized = (reason: string): WhatsAppEvolutionWebhookReceipt => {
        logger.warn(WHATSAPP_EVOLUTION_WEBHOOK_LOG.rejected, { correlationId, reason })
        return { outcome: 'unauthorized' }
      }
      // Rejeição barata primeiro: sem cabeçalho, ou com id que nem é uuid, não há consulta ao banco.
      if (token === null || token === '' || token.length > MAX_TOKEN_LENGTH) {
        return unauthorized('missing_token')
      }
      if (!UUID_PATTERN.test(webhookId)) return unauthorized('unknown_webhook')

      const target = await repository.findByWebhookId({ webhookId })
      if (target === null || target.webhookEnvelope === null) return unauthorized('unknown_webhook')

      let expected: string
      try {
        ;({ webhookToken: expected } = await webhookSecrets.decrypt({
          companyId: target.companyId,
          envelope: target.webhookEnvelope,
          settingsId: target.settingsId,
        }))
      } catch {
        // Envelope que não abre (chave do keyring trocada) é fail-closed, como segredo ausente.
        return unauthorized('secret_unavailable')
      }
      if (!verifyEvolutionWebhookSecret(token, expected)) return unauthorized('bad_token')

      // Daqui em diante a entrega é do Evolution desta empresa: só agora o corpo vira dado.
      const payload = parseJson(rawBody)
      const { companyId } = target
      if (evolutionWebhookInstance(payload) !== target.instanceName) {
        logger.warn(WHATSAPP_EVOLUTION_WEBHOOK_LOG.instanceMismatch, { companyId, correlationId })
        return { outcome: 'ignored' }
      }
      if (target.status !== 'active') {
        logger.info(WHATSAPP_EVOLUTION_WEBHOOK_LOG.disabled, { companyId, correlationId })
        await repository.recordDelivery({ companyId })
        return { outcome: 'ignored' }
      }

      const counts = { conversation: 0, ignored: 0, statuses: 0, unassigned: 0 }
      let connectionState: 'close' | 'connecting' | 'open' | undefined
      for (const event of parseEvolutionWebhook(payload)) {
        if (event.type === 'connection') {
          connectionState = event.state
        } else if (event.type === 'status') {
          await dependencies.inbound.receiveStatus({
            companyId,
            providerMessageId: event.externalMessageId,
            status: event.status,
          })
          counts.statuses += 1
        } else if (event.type === 'message' && !event.fromMe && event.chat === 'user') {
          const outcome = await dependencies.inbound.receiveMessage({
            companyId,
            message: {
              from: event.from,
              providerMessageId: event.externalMessageId,
              replyToProviderMessageId: event.replyToExternalMessageId,
              text: event.text,
            },
          })
          if (outcome === 'conversation' || outcome === 'unassigned') counts[outcome] += 1
          else counts.ignored += 1
        } else {
          // A própria mensagem enviada pelo celular, grupo, status ou evento que não lemos.
          counts.ignored += 1
        }
      }
      await repository.recordDelivery({
        companyId,
        ...(connectionState === undefined ? {} : { connectionState }),
      })

      logger.info(WHATSAPP_EVOLUTION_WEBHOOK_LOG.received, { companyId, correlationId, ...counts })
      return { outcome: 'accepted' }
    },

    async register({ context, correlationId }) {
      const registration = await repository.findRegistration({ companyId: context.companyId })
      if (registration === null) throw new WhatsAppEvolutionNotConfiguredError()
      if (registration.status !== 'active') throw new WhatsAppEvolutionDisabledError()

      const registeredAt = await point({
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        registration,
        rotate: true,
      })
      return { registeredAt: registeredAt.toISOString() }
    },
  }
}

export function webhookUrl(apiPublicUrl: string, webhookId: string): string {
  return `${apiPublicUrl.replace(/\/+$/u, '')}${API_PUBLIC_WHATSAPP_EVOLUTION_WEBHOOK_PATH.replace(':webhookId', webhookId)}`
}

/** Corpo que não é JSON vira `undefined`, e o leitor do SDK o devolve como evento ignorado. */
function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown
  } catch {
    return undefined
  }
}
