/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ConversationSession,
  FlowGraphData,
  FlowNodeData,
  WhatsAppMessage,
} from '@adatechnology/meta-whatsapp-contracts'

import { isChoiceNode } from '../domain/whatsapp-answer.policy.js'
import {
  WHATSAPP_COMMAND_LOG,
  WHATSAPP_DEFAULT_PROMPT,
  WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY,
  WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY,
} from '../domain/whatsapp-command.constant.js'
import { renderWhatsAppChoice } from './whatsapp-choice-renderer.service.js'
import type { WhatsAppCommandDriverDependencies } from './whatsapp-command-driver.service.js'
import type { WhatsAppFlowInterpreterPort } from './whatsapp-command-driver.port.js'

/** Uma mensagem em processamento: as dependências da empresa, o remetente e a sessão. */
export type WhatsAppCommandTurn = {
  readonly deps: WhatsAppCommandDriverDependencies
  readonly maskedPhone: string
  readonly message: WhatsAppMessage
  readonly phone: string
  readonly session: ConversationSession
}

export type WhatsAppFlowCursor = {
  readonly context: Record<string, unknown>
  readonly currentNodeId: string
  readonly graph: FlowGraphData
  readonly userAnswer: string | undefined
}

type FlowRunOutcome = Awaited<ReturnType<WhatsAppFlowInterpreterPort['run']>>

/**
 * Roda o interpretador até ele pedir algo de fora e persiste o resultado. Salto para outro fluxo
 * (`flow:`) segue no grafo de destino; grafo ausente ou saltos demais encerram a conversa.
 */
export async function runWhatsAppFlow(input: {
  readonly cursor: WhatsAppFlowCursor
  readonly hopsLeft: number
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { cursor, hopsLeft, turn } = input
  const result = await turn.deps.interpreter.run({
    channel: turn.deps.channel,
    context: cursor.context,
    currentNodeId: cursor.currentNodeId,
    graph: cursor.graph,
    session: turn.session,
    ...(cursor.userAnswer === undefined ? {} : { userAnswer: cursor.userAnswer }),
  })
  if (result.kind !== 'cross-flow') {
    await settleFlow({ graph: cursor.graph, result, turn })
    return
  }

  const next =
    hopsLeft > 0
      ? await turn.deps.graphs.findGraph({
          companyId: turn.session.companyId,
          flowKey: result.flowKey,
        })
      : undefined
  if (next === undefined) {
    await abortFlow({ flowKey: result.flowKey, turn })
    return
  }

  const nextCursor = {
    context: withoutIncomingImage(result.context),
    currentNodeId: next.startNodeId,
    graph: next,
    userAnswer: undefined,
  }
  await runWhatsAppFlow({ cursor: nextCursor, hopsLeft: hopsLeft - 1, turn })
}

export async function clearWhatsAppFlowPosition(input: {
  readonly context: Record<string, unknown>
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { companyId, currentState } = input.turn.session
  await input.turn.deps.sessions.setFlowPosition(companyId, input.turn.phone, null, null)
  await input.turn.deps.sessions.setState(
    companyId,
    input.turn.phone,
    currentState,
    withoutIncomingImage(withoutInvalidAttempts(input.context)),
  )
}

export function withoutInvalidAttempts(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY),
  )
}

/**
 * Spec 161 T14 (RF17/D16): o `media-id` nunca sobrevive além do turno em que chegou — apagado do
 * contexto persistido em **todo** ponto de gravação, consumido ou não pelo `FlowActionHandler` do
 * nó alcançado. É credencial de curta duração (resgata a mídia com o token da empresa).
 */
export function withoutIncomingImage(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY),
  )
}

async function settleFlow(input: {
  readonly graph: FlowGraphData
  readonly result: Exclude<FlowRunOutcome, { readonly kind: 'cross-flow' }>
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { graph, result, turn } = input
  const { companyId, currentState } = turn.session
  if (result.kind === 'awaiting-answer') {
    await turn.deps.sessions.setFlowPosition(companyId, turn.phone, graph.key, result.nodeId)
    await turn.deps.sessions.setState(
      companyId,
      turn.phone,
      currentState,
      withoutIncomingImage(result.context),
    )
    const node = graph.nodes[result.nodeId]
    if (node !== undefined) await renderNode({ node, turn })
    return
  }
  if (result.kind === 'terminal') {
    /** O interpretador não envia nada: a mensagem de encerramento é a do último nó visitado. */
    const lastNodeId = result.visited.at(-1)
    const closing = lastNodeId === undefined ? undefined : graph.nodes[lastNodeId]?.directMessage
    await clearWhatsAppFlowPosition({ context: result.context, turn })
    if (closing !== undefined) await turn.deps.sender.sendText({ body: closing, to: turn.phone })
    return
  }

  await abortFlow({ flowKey: graph.key, turn })
}

async function renderNode(input: {
  readonly node: FlowNodeData
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { node, turn } = input
  const body = node.question ?? node.directMessage ?? WHATSAPP_DEFAULT_PROMPT
  if (!isChoiceNode(node)) {
    await turn.deps.sender.sendText({ body, to: turn.phone })
    return
  }

  await renderChoiceOptions({ body, node, turn })
}

/**
 * T007 — reusada pelo despachante para re-renderizar a página de `__more__`/`__back__`: mesmo nó,
 * mesma pergunta, página diferente. Não passa por `settleFlow`: nem posição nem contexto mudam.
 */
export async function renderChoicePage(input: {
  readonly node: FlowNodeData
  readonly page: number
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { node, page, turn } = input
  const body = node.question ?? node.directMessage ?? WHATSAPP_DEFAULT_PROMPT
  await renderChoiceOptions({ body, node, page, turn })
}

async function renderChoiceOptions(input: {
  readonly body: string
  readonly node: FlowNodeData
  readonly page?: number
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { body, node, page, turn } = input
  const options = (node.options ?? []).map(([id, title]) => ({ id, title }))
  const renderChoice = turn.deps.renderChoice ?? renderWhatsAppChoice
  await renderChoice({
    body,
    options,
    sender: turn.deps.sender,
    to: turn.phone,
    ...(page === undefined ? {} : { page }),
  })
}

async function abortFlow(input: {
  readonly flowKey: string
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  input.turn.deps.logger.error(WHATSAPP_COMMAND_LOG.flowAborted, {
    companyId: input.turn.session.companyId,
    flowKey: input.flowKey,
  })
  await clearWhatsAppFlowPosition({ context: {}, turn: input.turn })
}
