/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ConversationSession, FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import { FlowInterpreter, toSessionContract } from '@adatechnology/meta-whatsapp-module'
import type { SessionRepository } from '@adatechnology/meta-whatsapp-module'

import type { RateLimiter } from '../../http/rate-limiter.service.js'
import type { AuthorizationService } from '../../identity/application/authorization.service.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from '../application/resolve-whatsapp-actor.use-case.js'
import {
  createEvolutionAssistant,
  type EvolutionAssistant,
} from '../application/evolution-assistant.service.js'
import type { WhatsAppFlowGraphProviderPort } from '../application/whatsapp-command-driver.port.js'
import { createWhatsAppCommandDriver } from '../application/whatsapp-command-driver.service.js'
import {
  createWithAuthorizedActor,
  registerWhatsAppFlowActions,
  type WhatsAppFlowActionDefinition,
} from '../application/with-authorized-actor.service.js'
import type { WhatsAppDirectAssistantPort } from '../../whatsapp/application/whatsapp-evolution-webhook.use-case.js'
import type { WhatsAppTurnReplies } from '../application/whatsapp-turn-replies.service.js'
import { createEvolutionAssistantTransport } from './evolution-assistant-channel.gateway.js'

/** O envio é do webhook do Evolution (fila por empresa, ritmo do número): a fábrica recebe como mandar. */
export type EvolutionAssistantFactory = (
  send: (input: {
    readonly companyId: string
    readonly phone: string
    readonly text: string
  }) => Promise<void> | void,
) => EvolutionAssistantRegistry

/**
 * O grafo publicado da empresa, quando existe; senão o do código (o mesmo que a republicação grava). O Evolution não
 * depende de a Meta ter sido configurada e republicada para a empresa.
 */
export function createEvolutionAssistantGraphProvider(input: {
  readonly published: WhatsAppFlowGraphProviderPort
  readonly rootGraph: FlowGraphData
}): WhatsAppFlowGraphProviderPort {
  return {
    async findGraph(lookup) {
      const published = await input.published.findGraph(lookup)
      if (published !== undefined) return published
      return lookup.flowKey === input.rootGraph.key ? input.rootGraph : undefined
    },
    rootFlowKey: input.published.rootFlowKey,
  }
}

export type EvolutionAssistantRegistry = {
  /** Um assistente por empresa, criado na primeira vez que alguém o pede. */
  forCompany(companyId: string): EvolutionAssistant
}

/**
 * O assistente do escritório no número Evolution. O que é da instalação (ator, grafo, ações, teto por número) é
 * recebido uma vez; o que é da empresa (interpretador, canal, memória das linhas oferecidas) nasce sob demanda.
 */
export function createEvolutionAssistantRegistry(deps: {
  readonly authorization: Pick<AuthorizationService, 'authorize'>
  readonly clock: () => Date
  readonly flowActions: readonly WhatsAppFlowActionDefinition[]
  readonly graphs: WhatsAppFlowGraphProviderPort
  readonly logger: ApiLogger
  readonly rateLimiter: RateLimiter
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
  readonly send: (input: {
    readonly companyId: string
    readonly phone: string
    readonly text: string
  }) => Promise<void> | void
  readonly sessions: SessionRepository
}): EvolutionAssistantRegistry {
  const withAuthorizedActor = createWithAuthorizedActor(deps)
  const byCompany = new Map<string, EvolutionAssistant>()

  return {
    forCompany(companyId) {
      const existing = byCompany.get(companyId)
      if (existing !== undefined) return existing

      const interpreter = new FlowInterpreter()
      registerWhatsAppFlowActions({
        definitions: deps.flowActions,
        registerFlowAction: (kind, handler) => interpreter.registerFlowAction(kind, handler),
        withAuthorizedActor,
      })
      const transport = createEvolutionAssistantTransport({
        clock: deps.clock,
        companyId,
        send: deps.send,
      })
      const handler = createWhatsAppCommandDriver({
        channel: transport.channel,
        clock: deps.clock,
        graphs: deps.graphs,
        interpreter,
        logger: deps.logger,
        rateLimiter: deps.rateLimiter,
        resolveActor: deps.resolveActor,
        sender: transport.sender,
        sessions: deps.sessions,
      })
      const assistant = createEvolutionAssistant({
        clock: deps.clock,
        companyId,
        handler,
        logger: deps.logger,
        openSession: async ({ phone }): Promise<ConversationSession> =>
          toSessionContract(await deps.sessions.getOrCreate(companyId, phone, 'idle')),
        rootFlowKey: deps.graphs.rootFlowKey,
        sessions: deps.sessions,
        transport,
      })
      byCompany.set(companyId, assistant)
      return assistant
    },
  }
}

/**
 * O assistente como o webhook o enxerga. Cada fala do assistente é um turno: o que ele diz numa resposta sai numa só
 * mensagem (como no fluxo do grupo), e a pergunta "está no meio de uma conta?" não abre turno nenhum.
 */
export function createDirectAssistantPort(input: {
  readonly registry: EvolutionAssistantRegistry
  readonly turns: WhatsAppTurnReplies
}): WhatsAppDirectAssistantPort {
  return {
    forCompany(companyId) {
      const assistant = input.registry.forCompany(companyId)
      const turn = <T>(work: () => Promise<T>) => input.turns.withinTurn(work, { companyId })
      return {
        handle: (message) => turn(() => assistant.handle(message)),
        isActive: (lookup) => assistant.isActive(lookup),
        start: (message) => turn(() => assistant.start(message)),
      }
    },
  }
}
