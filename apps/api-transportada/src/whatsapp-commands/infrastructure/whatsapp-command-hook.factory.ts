/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MetaWhatsAppModule } from '@adatechnology/meta-whatsapp-module'

import type { RateLimiter } from '../../http/rate-limiter.service.js'
import type { AuthorizationService } from '../../identity/application/authorization.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from '../application/resolve-whatsapp-actor.use-case.js'
import type { VerifyWhatsAppPhone } from '../application/verify-whatsapp-phone.use-case.js'
import {
  createWhatsAppCommandDriver,
  type WhatsAppMessageHandler,
} from '../application/whatsapp-command-driver.service.js'
import type { WhatsAppFlowGraphProviderPort } from '../application/whatsapp-command-driver.port.js'
import type { WhatsAppSharedLocationStore } from '../application/whatsapp-shared-location.service.js'
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
  readonly authorization: Pick<AuthorizationService, 'authorize'>
  readonly clock: () => Date
  readonly flowActions: readonly WhatsAppFlowActionDefinition[]
  readonly graphs: WhatsAppFlowGraphProviderPort
  readonly logger: ApiLogger
  readonly rateLimiter: RateLimiter
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
  readonly sharedLocations?: WhatsAppSharedLocationStore
  readonly verifyPhone?: VerifyWhatsAppPhone
}

/**
 * O que é da instalação (ator, grafo, teto por número, log) é montado uma vez; o que é da empresa
 * (canal, interpretador, sessões, token dos botões) sai da instância do módulo daquela empresa.
 */
export function createWhatsAppCommandHookFactory(
  params: CreateWhatsAppCommandHookFactoryParams,
): WhatsAppCommandHookFactory {
  const withAuthorizedActor = createWithAuthorizedActor(params)

  return ({ module }) => {
    const { flows } = module
    if (flows === undefined)
      throw new Error('The WhatsApp module was built without the flow engine')

    registerWhatsAppFlowActions({
      definitions: params.flowActions,
      registerFlowAction: flows.registerFlowAction,
      withAuthorizedActor,
    })
    return createWhatsAppCommandDriver({
      channel: module.channel,
      clock: params.clock,
      graphs: params.graphs,
      interpreter: flows.interpreter,
      logger: params.logger,
      rateLimiter: params.rateLimiter,
      resolveActor: params.resolveActor,
      sender: createMetaWhatsAppMessageSender({ channel: module.channel }),
      sessions: module.conversations.repository,
      ...(params.sharedLocations === undefined ? {} : { sharedLocations: params.sharedLocations }),
      ...(params.verifyPhone === undefined ? {} : { verifyPhone: params.verifyPhone }),
    })
  }
}
