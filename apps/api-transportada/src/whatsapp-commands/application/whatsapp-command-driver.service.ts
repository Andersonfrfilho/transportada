/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { randomUUID } from 'node:crypto'

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
  WHATSAPP_COMMAND_FAILURE_REPLY,
  WHATSAPP_DENIED_REPLY,
  WHATSAPP_DENIED_REPLY_LIMIT,
  WHATSAPP_HANDOFF_REPLY,
  WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF,
  WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY,
  WHATSAPP_MAX_CROSS_FLOW_HOPS,
} from '../domain/whatsapp-command.constant.js'
import { parseMenuPageNavigation } from '../domain/whatsapp-menu.policy.js'
import { filterWhatsAppRootFlowGraph } from '../domain/whatsapp-root-menu.policy.js'
import { WHATSAPP_PHONE_VERIFICATION_CODE_MESSAGE_PATTERN } from '../domain/whatsapp-phone-verification.constant.js'
import {
  type WhatsAppCommandDenialReason,
  WhatsAppCommandDeniedError,
  WhatsAppCommandHandoffRequestedError,
} from '../domain/whatsapp-command.error.js'
import { toWhatsAppPhoneKey } from '../domain/whatsapp-phone-key.policy.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'
import { buildWhatsAppPhoneVerifiedReply } from '../domain/whatsapp-verified-reply.policy.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from './resolve-whatsapp-actor.use-case.js'
import type { VerifyWhatsAppPhone } from './verify-whatsapp-phone.use-case.js'
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
  renderChoicePage,
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
  /** Ausente, o número não vinculado só recebe a recusa neutra — como antes da T004. */
  readonly verifyPhone?: VerifyWhatsAppPhone
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
    const code = readVerificationCode(turn.message)
    const { verifyPhone } = deps
    if (code !== undefined && verifyPhone !== undefined) {
      await guardConversation(turn, () => verifyEntry({ code, turn, verifyPhone }))
      return HANDLED
    }
    await denyTurn({ reason: actor.reason, turn })
    return HANDLED
  }

  await guardConversation(turn, () => advanceConversation(turn, actor.context.scope.permissions))
  return HANDLED
}

/**
 * A FlowAction re-resolveu o ator e recusou: mesma saída neutra, e o fluxo termina.
 *
 * T020 (B4): qualquer outro erro — inclusive no menu que abre depois de `verifyEntry`, que rodava
 * fora deste `try` — vira a mensagem neutra e a conversa recomeça do menu. Antes ele subia, o
 * `catch` de fora só logava, e a pessoa ficava sem resposta, parada no nó.
 */
async function guardConversation(
  turn: WhatsAppCommandTurn,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work()
  } catch (error) {
    // T020 (B5): a FlowAction recusou duas respostas de lista seguidas — o mesmo handoff da D8.
    if (error instanceof WhatsAppCommandHandoffRequestedError) {
      await handOff({ context: {}, turn })
      return
    }
    await clearWhatsAppFlowPosition({ context: {}, turn })
    if (error instanceof WhatsAppCommandDeniedError) {
      await denyTurn({ reason: error.reason, turn })
      return
    }
    turn.deps.logger.error(WHATSAPP_COMMAND_LOG.failed, {
      companyId: turn.session.companyId,
      errorName: error instanceof Error ? error.name : typeof error,
      phone: turn.maskedPhone,
    })
    await turn.deps.sender.sendText({ body: WHATSAPP_COMMAND_FAILURE_REPLY, to: turn.phone })
  }
}

async function advanceConversation(
  turn: WhatsAppCommandTurn,
  permissions: ReadonlySet<string>,
): Promise<void> {
  const position = await turn.deps.sessions.getContext(turn.session.companyId, turn.phone)
  const context = position?.context ?? {}
  const located = await locateNode({ permissions, position, turn })
  const graph = located?.graph ?? (await findRootGraph(turn, permissions))
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
  if (isChoiceNode(located.node)) {
    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      await renderChoicePage({ node: located.node, page, turn })
      return
    }
    if (!isOfferedOption(located.node, answer)) {
      await rejectAnswer({ context, node: located.node, turn })
      return
    }
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
  readonly permissions: ReadonlySet<string>
  readonly position: WhatsAppSessionPosition | undefined
  readonly turn: WhatsAppCommandTurn
}): Promise<{ readonly graph: FlowGraphData; readonly node: FlowNodeData } | undefined> {
  const { permissions, position, turn } = input
  if (position === undefined || position.flowKey === null || position.currentNodeId === null) {
    return undefined
  }

  const graph = await findFlowGraph({ flowKey: position.flowKey, permissions, turn })
  /** Nó que sumiu numa republicação recomeça do menu, em vez de prender a conversa. */
  const node = graph?.nodes[position.currentNodeId]
  return graph === undefined || node === undefined ? undefined : { graph, node }
}

async function findRootGraph(
  turn: WhatsAppCommandTurn,
  permissions: ReadonlySet<string>,
): Promise<FlowGraphData | undefined> {
  const graph = await findFlowGraph({ flowKey: turn.deps.graphs.rootFlowKey, permissions, turn })
  if (graph === undefined) {
    turn.deps.logger.error(WHATSAPP_COMMAND_LOG.flowMissing, {
      companyId: turn.session.companyId,
      flowKey: turn.deps.graphs.rootFlowKey,
    })
  }
  return graph
}

/**
 * D2 — "o menu raiz é filtrado por permissão": o grafo publicado tem todas as opções, e é aqui —
 * único ponto por onde o despachante lê qualquer grafo, tanto para renderizar quanto para validar a
 * resposta — que a vitrine é recortada pela membership do ator. Resposta a uma opção escondida cai
 * em `isOfferedOption` como resposta inválida, porque o nó que a checa já saiu filtrado daqui.
 */
async function findFlowGraph(input: {
  readonly flowKey: string
  readonly permissions: ReadonlySet<string>
  readonly turn: WhatsAppCommandTurn
}): Promise<FlowGraphData | undefined> {
  const { flowKey, permissions, turn } = input
  const graph = await turn.deps.graphs.findGraph({ companyId: turn.session.companyId, flowKey })
  if (graph === undefined || graph.key !== turn.deps.graphs.rootFlowKey) return graph

  return filterWhatsAppRootFlowGraph(graph, permissions)
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

/**
 * T004 — o número ainda não vinculado que manda só o código. A verificação roda **antes** do menu
 * porque é ela que cria o ator; o `from` é o que prova a posse. Qualquer recusa é a mesma resposta
 * neutra: "código errado" daria ao número um oráculo.
 */
async function verifyEntry(input: {
  readonly code: string
  readonly turn: WhatsAppCommandTurn
  readonly verifyPhone: VerifyWhatsAppPhone
}): Promise<void> {
  const { turn } = input
  const { companyId } = turn.session
  const result = await input.verifyPhone({
    code: input.code,
    companyId,
    correlationId: turn.message.id ?? randomUUID(),
    fromPhone: turn.phone,
    now: turn.deps.clock(),
  })
  if (result.status === 'rejected') {
    turn.deps.logger.warn(WHATSAPP_COMMAND_LOG.phoneVerificationRejected, {
      companyId,
      phone: turn.maskedPhone,
      reason: result.reason,
    })
    await sendDeniedReply(turn)
    return
  }

  turn.deps.logger.info(WHATSAPP_COMMAND_LOG.phoneVerified, { companyId, phone: turn.maskedPhone })
  await turn.deps.sender.sendText({
    body: buildWhatsAppPhoneVerifiedReply(result.displayName),
    to: turn.phone,
  })
  await clearWhatsAppFlowPosition({ context: {}, turn })

  /**
   * D2: o menu que vem a seguir precisa da permissão do ator, e o número acabou de deixar de ser
   * "denied" — resolver de novo é a mesma conferência que toda `FlowAction` já faz
   * (`with-authorized-actor.service.ts`), não uma chamada extra por descuido. Se ainda não houver
   * membership (verificado sem vínculo), a resposta é a mesma neutra de D1 — nenhum menu.
   */
  const actor = await turn.deps.resolveActor({
    companyId,
    fromPhone: turn.phone,
    now: turn.deps.clock(),
  })
  if (actor.status === 'denied') {
    await denyTurn({ reason: actor.reason, turn })
    return
  }
  await advanceConversation(turn, actor.context.scope.permissions)
}

function readVerificationCode(message: WhatsAppCommandTurn['message']): string | undefined {
  const body = message.text?.body
  if (body === undefined) return undefined
  return WHATSAPP_PHONE_VERIFICATION_CODE_MESSAGE_PATTERN.exec(body)?.[1]
}

async function denyTurn(input: {
  readonly reason: WhatsAppCommandDenialReason
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  logDenied(input)
  await sendDeniedReply(input.turn)
}

async function sendDeniedReply(turn: WhatsAppCommandTurn): Promise<void> {
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

/**
 * T005b M4: a chave é a `phone_key`, sem o nono dígito — a Meta alterna as duas grafias, e com a
 * forma canônica elas eram dois baldes. O mapa vive só em memória, por processo (`docs/SECURITY.md`).
 */
function buildLimitKey(turn: WhatsAppCommandTurn): string {
  const phone = toWhatsAppPhone(turn.phone)
  return `${turn.session.companyId}:${phone === undefined ? turn.phone : toWhatsAppPhoneKey(phone)}`
}

function readInvalidAttempts(context: Record<string, unknown>): number {
  const attempts = context[WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY]
  return typeof attempts === 'number' ? attempts : 0
}
