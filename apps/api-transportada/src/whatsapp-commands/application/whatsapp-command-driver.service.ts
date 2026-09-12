/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ChannelAdapterInterface,
  FlowGraphData,
  FlowNodeData,
  MessageHookOutcome,
  MetaWhatsAppHooks,
} from '@adatechnology/meta-whatsapp-contracts'

import type { RateLimiter } from '../../http/rate-limiter.service.js'
import { maskPhone } from '../../logging/phone-mask.policy.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  extractWhatsAppAnswer,
  isChoiceNode,
  isOfferedOption,
} from '../domain/whatsapp-answer.policy.js'
import {
  WHATSAPP_COMMAND_LOG,
  WHATSAPP_COMMAND_RATE_LIMIT,
  WHATSAPP_DEFAULT_FALLBACK_REPLY,
  WHATSAPP_DENIED_REPLY,
  WHATSAPP_DENIED_REPLY_LIMIT,
  WHATSAPP_HANDOFF_REPLY,
  WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF,
  WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY,
  WHATSAPP_MAX_CROSS_FLOW_HOPS,
} from '../domain/whatsapp-command.constant.js'
import {
  type WhatsAppCommandDenialReason,
  WhatsAppCommandDeniedError,
} from '../domain/whatsapp-command.error.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from './resolve-whatsapp-actor.use-case.js'
import type { WhatsAppChoiceRenderer } from './whatsapp-choice-renderer.service.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppFlowGraphProviderPort,
  WhatsAppFlowInterpreterPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from './whatsapp-command-driver.port.js'
import {
  clearWhatsAppFlowPosition,
  runWhatsAppFlow,
  type WhatsAppCommandTurn,
  withoutInvalidAttempts,
} from './whatsapp-flow-step.service.js'

export type WhatsAppMessageHandler = NonNullable<MetaWhatsAppHooks['onMessageReceived']>

export type WhatsAppCommandDriverDependencies = {
  readonly channel: ChannelAdapterInterface
  readonly clock: () => Date
  readonly graphs: WhatsAppFlowGraphProviderPort
  readonly interpreter: WhatsAppFlowInterpreterPort
  readonly logger: ApiLogger
  /** Compartilhado entre as instâncias por empresa: trocar o token não pode zerar o teto. */
  readonly rateLimiter: RateLimiter
  readonly renderChoice?: WhatsAppChoiceRenderer
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
  readonly sender: WhatsAppMessageSenderPort
  readonly sessions: WhatsAppCommandSessionPort
}

const HANDLED: MessageHookOutcome = { outcome: 'handled' }
const CONTINUE: MessageHookOutcome = { outcome: 'continue' }

/**
 * Spec 144 T006 — a mensagem recebida vira passo de fluxo. Ordem por mensagem: teto por número
 * (antes de qualquer banco) → modo humano segue para a inbox → ator → posição → validação da
 * resposta → interpretador → posição gravada → próxima pergunta renderizada.
 *
 * ⚠️ Falha de envio ou de banco **não sobe para o webhook**: a rota responde 200 à Meta de qualquer
 * jeito, e uma exceção aqui só viraria 500 — o que leva a Meta a desativar o webhook de todos.
 */
export function createWhatsAppCommandDriver(
  deps: WhatsAppCommandDriverDependencies,
): WhatsAppMessageHandler {
  return async function onMessageReceived(message, session) {
    const phone = message.from ?? session.whatsappNumber
    const turn: WhatsAppCommandTurn = {
      deps,
      maskedPhone: maskPhone(phone),
      message,
      phone,
      session,
    }
    try {
      return await dispatch(turn)
    } catch (error) {
      deps.logger.error(WHATSAPP_COMMAND_LOG.failed, {
        companyId: session.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
        phone: turn.maskedPhone,
      })
      return HANDLED
    }
  }
}

async function dispatch(turn: WhatsAppCommandTurn): Promise<MessageHookOutcome> {
  const { deps, session } = turn
  const limit = deps.rateLimiter.consume({
    key: `command:${buildLimitKey(turn)}`,
    policy: WHATSAPP_COMMAND_RATE_LIMIT,
  })
  if (!limit.allowed) {
    logDenied({ reason: 'rate_limited', turn })
    return HANDLED
  }
  if (session.mode === 'human') return CONTINUE

  const actor = await deps.resolveActor({
    companyId: session.companyId,
    fromPhone: turn.phone,
    now: deps.clock(),
  })
  if (actor.status === 'denied') {
    await denyTurn({ reason: actor.reason, turn })
    return HANDLED
  }

  try {
    await advanceConversation(turn)
  } catch (error) {
    /** A FlowAction re-resolveu o ator e recusou: mesma saída neutra, e o fluxo termina. */
    if (!(error instanceof WhatsAppCommandDeniedError)) throw error
    await clearWhatsAppFlowPosition({ context: {}, turn })
    await denyTurn({ reason: error.reason, turn })
  }
  return HANDLED
}

async function advanceConversation(turn: WhatsAppCommandTurn): Promise<void> {
  const position = await turn.deps.sessions.getContext(turn.session.companyId, turn.phone)
  const context = position?.context ?? {}
  const located = await locateNode({ position, turn })
  const graph = located?.graph ?? (await findRootGraph(turn))
  if (graph === undefined) return

  if (located === undefined) {
    await runWhatsAppFlow({
      cursor: {
        context: withoutInvalidAttempts(context),
        currentNodeId: graph.startNodeId,
        graph,
        userAnswer: undefined,
      },
      hopsLeft: WHATSAPP_MAX_CROSS_FLOW_HOPS,
      turn,
    })
    return
  }

  const answer = extractWhatsAppAnswer(turn.message)
  if (isChoiceNode(located.node) && !isOfferedOption(located.node, answer)) {
    await rejectAnswer({ context, node: located.node, turn })
    return
  }

  await runWhatsAppFlow({
    cursor: {
      context: withoutInvalidAttempts(context),
      currentNodeId: located.node.id,
      graph,
      userAnswer: answer,
    },
    hopsLeft: WHATSAPP_MAX_CROSS_FLOW_HOPS,
    turn,
  })
}

async function locateNode(input: {
  readonly position: WhatsAppSessionPosition | undefined
  readonly turn: WhatsAppCommandTurn
}): Promise<{ readonly graph: FlowGraphData; readonly node: FlowNodeData } | undefined> {
  const { position, turn } = input
  if (position === undefined || position.flowKey === null || position.currentNodeId === null) {
    return undefined
  }

  const graph = await turn.deps.graphs.findGraph({
    companyId: turn.session.companyId,
    flowKey: position.flowKey,
  })
  /** Nó que sumiu numa republicação recomeça do menu, em vez de prender a conversa. */
  const node = graph?.nodes[position.currentNodeId]
  return graph === undefined || node === undefined ? undefined : { graph, node }
}

async function findRootGraph(turn: WhatsAppCommandTurn): Promise<FlowGraphData | undefined> {
  const { deps, session } = turn
  const flowKey = deps.graphs.rootFlowKey
  const graph = await deps.graphs.findGraph({ companyId: session.companyId, flowKey })
  if (graph === undefined) {
    deps.logger.error(WHATSAPP_COMMAND_LOG.flowMissing, { companyId: session.companyId, flowKey })
  }
  return graph
}

async function rejectAnswer(input: {
  readonly context: Record<string, unknown>
  readonly node: FlowNodeData
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { context, node, turn } = input
  const attempts = readInvalidAttempts(context) + 1
  if (attempts >= WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF) {
    await handOff({ context, turn })
    return
  }

  await turn.deps.sessions.setState(turn.session.companyId, turn.phone, turn.session.currentState, {
    ...context,
    [WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY]: attempts,
  })
  await turn.deps.sender.sendText({
    body: node.fallbackMessage ?? WHATSAPP_DEFAULT_FALLBACK_REPLY,
    to: turn.phone,
  })
}

/** Na segunda resposta fora do menu o bot não improvisa: chama uma pessoa (conversation-flow §5). */
async function handOff(input: {
  readonly context: Record<string, unknown>
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { turn } = input
  await turn.deps.sessions.requestHuman(turn.session.companyId, turn.phone)
  await clearWhatsAppFlowPosition(input)
  turn.deps.logger.info(WHATSAPP_COMMAND_LOG.handoff, {
    companyId: turn.session.companyId,
    phone: turn.maskedPhone,
  })
  await turn.deps.sender.sendText({ body: WHATSAPP_HANDOFF_REPLY, to: turn.phone })
}

async function denyTurn(input: {
  readonly reason: WhatsAppCommandDenialReason
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { turn } = input
  logDenied(input)
  const reply = turn.deps.rateLimiter.consume({
    key: `denied-reply:${buildLimitKey(turn)}`,
    policy: WHATSAPP_DENIED_REPLY_LIMIT,
  })
  if (!reply.allowed) return

  await turn.deps.sender.sendText({ body: WHATSAPP_DENIED_REPLY, to: turn.phone })
}

function logDenied(input: {
  readonly reason: WhatsAppCommandDenialReason | 'rate_limited'
  readonly turn: WhatsAppCommandTurn
}): void {
  input.turn.deps.logger.warn(WHATSAPP_COMMAND_LOG.denied, {
    companyId: input.turn.session.companyId,
    phone: input.turn.maskedPhone,
    reason: input.reason,
  })
}

/** A chave casa as duas grafias do nono dígito só na forma canônica; o mapa vive só em memória. */
function buildLimitKey(turn: WhatsAppCommandTurn): string {
  return `${turn.session.companyId}:${toWhatsAppPhone(turn.phone) ?? turn.phone}`
}

function readInvalidAttempts(context: Record<string, unknown>): number {
  const attempts = context[WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY]
  return typeof attempts === 'number' ? attempts : 0
}
