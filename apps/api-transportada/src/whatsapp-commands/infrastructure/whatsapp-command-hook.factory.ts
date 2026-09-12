/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MetaWhatsAppModule } from '@adatechnology/meta-whatsapp-module'
import { WhatsAppMessageProvider } from '@adatechnology/meta-whatsapp-provider'

import type { RateLimiter } from '../../http/rate-limiter.service.js'
import type { AuthorizationService } from '../../identity/application/authorization.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from '../application/resolve-whatsapp-actor.use-case.js'
import {
  createWhatsAppCommandDriver,
  type WhatsAppMessageHandler,
} from '../application/whatsapp-command-driver.service.js'
import type { WhatsAppFlowGraphProviderPort } from '../application/whatsapp-command-driver.port.js'
import {
  createWithAuthorizedActor,
  registerWhatsAppFlowActions,
  type WhatsAppFlowActionDefinition,
} from '../application/with-authorized-actor.service.js'
import { createMetaWhatsAppMessageSender } from './meta-whatsapp-message-sender.gateway.js'

export type WhatsAppCommandHookInstance = {
  readonly accessToken: string
  readonly module: MetaWhatsAppModule
  readonly phoneNumberId: string
}

export type WhatsAppCommandHookFactory = (
  instance: WhatsAppCommandHookInstance,
) => WhatsAppMessageHandler

export type CreateWhatsAppCommandHookFactoryParams = {
  readonly apiVersion: string
  readonly authorization: Pick<AuthorizationService, 'authorize'>
  readonly baseUrl: string | undefined
  readonly clock: () => Date
  readonly flowActions: readonly WhatsAppFlowActionDefinition[]
  readonly graphs: WhatsAppFlowGraphProviderPort
  readonly logger: ApiLogger
  readonly rateLimiter: RateLimiter
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
}

/**
 * O que é da instalação (ator, grafo, teto por número, log) é montado uma vez; o que é da empresa
 * (canal, interpretador, sessões, token dos botões) sai da instância do módulo daquela empresa.
 */
export function createWhatsAppCommandHookFactory(
  params: CreateWhatsAppCommandHookFactoryParams,
): WhatsAppCommandHookFactory {
  const withAuthorizedActor = createWithAuthorizedActor(params)

  return ({ accessToken, module, phoneNumberId }) => {
    registerWhatsAppFlowActions({
      definitions: params.flowActions,
      registerFlowAction: module.flows.registerFlowAction,
      withAuthorizedActor,
    })
    const buttons = new WhatsAppMessageProvider({
      accessToken,
      apiVersion: params.apiVersion,
      phoneNumberId,
      ...(params.baseUrl === undefined ? {} : { baseUrl: params.baseUrl }),
    })

    return createWhatsAppCommandDriver({
      channel: module.channel,
      clock: params.clock,
      graphs: params.graphs,
      interpreter: module.flows.interpreter,
      logger: params.logger,
      rateLimiter: params.rateLimiter,
      resolveActor: params.resolveActor,
      sender: createMetaWhatsAppMessageSender({ buttons, channel: module.channel }),
      sessions: module.conversations.repository,
    })
  }
}
