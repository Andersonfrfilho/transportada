/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ConversationSession, WhatsAppMessage } from '@adatechnology/meta-whatsapp-contracts'

import type { ApiLogger } from '../../shared/api.types.js'
import { normalizeDriverCommandText } from '../domain/whatsapp-driver-command.policy.js'
import { EXPENSE_FLOW_NODE } from '../domain/whatsapp-expense-flow.constant.js'
import { resolveEvolutionChoice } from '../domain/whatsapp-evolution-choice.policy.js'
import type { EvolutionAssistantTransport } from '../infrastructure/evolution-assistant-channel.gateway.js'
import type { WhatsAppSessionPosition } from './whatsapp-command-driver.port.js'
import type { WhatsAppMessageHandler } from './whatsapp-command-driver.service.js'

/** A conversa de contas parada há mais que isso volta ao fluxo do motorista: o "1" de hoje não é o de ontem. */
const IDLE_LIMIT_MS = 2 * 60 * 60_000

/** O id da opção "Lançar conta" do menu raiz do grafo (`whatsapp-flow-graph.constant.ts`). */
const EXPENSE_ROOT_OPTION = 'lancar_conta'
const ROOT_MENU_NODE = 'menu'

const CANCEL_WORDS = new Set(['sair', 'cancelar', 'cancela', 'cancele', 'parar', 'voltar'])
const BACK_TO_MENU_WORDS = new Set(['menu', 'oi', 'ola', 'inicio', 'opcoes', 'ajuda'])

export const EVOLUTION_ASSISTANT_TEXT = {
  cancelled: '↩️ *Conta cancelada.* Quando quiser, é só mandar *oi*.',
} as const

const EXPENSE_NODES: ReadonlySet<string> = new Set(Object.values(EXPENSE_FLOW_NODE))

export type EvolutionAssistantSessions = {
  getContext(
    companyId: string,
    whatsappNumber: string,
  ): Promise<(WhatsAppSessionPosition & { readonly lastActivity?: Date | undefined }) | undefined>
  setFlowPosition(
    companyId: string,
    whatsappNumber: string,
    flowKey: string | null,
    currentNodeId: string | null,
  ): Promise<void>
}

export type EvolutionAssistant = {
  /** Conversa a mensagem (já filtrada por permissão) com o assistente. `released`: a mensagem segue ao motorista. */
  handle(input: {
    readonly phone: string
    readonly providerMessageId: string
    readonly text: string
  }): Promise<'handled' | 'released'>
  /** A pessoa está no meio de uma conta? Só então o texto solto ("1", um valor) é dela e não do motorista. */
  isActive(input: { readonly phone: string }): Promise<boolean>
  /** Abre "Lançar conta" para quem pediu pelo menu ou pelas palavras de conta. */
  start(input: { readonly phone: string; readonly providerMessageId: string }): Promise<void>
}

/**
 * O assistente do escritório (o mesmo despachante da Meta: ator, permissão, grafo, FlowActions) falando pelo número
 * Evolution. Esta camada só traduz: a escolha numerada vira o id da linha, e a posição do fluxo vive na sessão do
 * módulo — nada de estado novo. A permissão é conferida pelo despachante e de novo em cada FlowAction.
 */
export function createEvolutionAssistant(deps: {
  readonly clock: () => Date
  readonly companyId: string
  readonly handler: WhatsAppMessageHandler
  readonly logger: ApiLogger
  readonly openSession: (input: { readonly phone: string }) => Promise<ConversationSession>
  readonly rootFlowKey: string
  readonly sessions: EvolutionAssistantSessions
  readonly transport: EvolutionAssistantTransport
}): EvolutionAssistant {
  const { companyId, transport } = deps

  async function position(phone: string) {
    return deps.sessions.getContext(companyId, phone)
  }

  function isExpenseNode(found: Awaited<ReturnType<typeof position>>): boolean {
    return (
      found !== undefined &&
      found.flowKey === deps.rootFlowKey &&
      found.currentNodeId !== null &&
      EXPENSE_NODES.has(found.currentNodeId)
    )
  }

  async function leave(phone: string) {
    transport.forget({ companyId, phone })
    await deps.sessions.setFlowPosition(companyId, phone, null, null)
  }

  async function deliver(input: {
    readonly answer: { readonly id?: string; readonly text?: string }
    readonly messageId: string
    readonly phone: string
  }) {
    const session = await deps.openSession({ phone: input.phone })
    const message: WhatsAppMessage = {
      from: input.phone,
      id: input.messageId,
      type: input.answer.id === undefined ? 'text' : 'interactive',
      ...(input.answer.id === undefined
        ? { text: { body: input.answer.text ?? '' } }
        : { interactive: { list_reply: { id: input.answer.id, title: input.answer.id } } }),
    } as WhatsAppMessage
    await deps.handler(message, session)
  }

  return {
    async handle({ phone, providerMessageId, text }) {
      const word = normalizeDriverCommandText(text)
      if (CANCEL_WORDS.has(word)) {
        await leave(phone)
        await transport.sender.sendText({ body: EVOLUTION_ASSISTANT_TEXT.cancelled, to: phone })
        return 'handled'
      }
      if (BACK_TO_MENU_WORDS.has(word)) {
        await leave(phone)
        return 'released'
      }
      const id = resolveEvolutionChoice(text, transport.offered({ companyId, phone }))
      transport.forget({ companyId, phone })
      await deliver({
        answer: id === undefined ? { text } : { id },
        messageId: providerMessageId,
        phone,
      })
      return 'handled'
    },

    async isActive({ phone }) {
      const found = await position(phone)
      if (!isExpenseNode(found)) return false
      const last = found?.lastActivity
      if (last !== undefined && deps.clock().getTime() - last.getTime() > IDLE_LIMIT_MS) {
        await leave(phone)
        return false
      }
      return true
    },

    async start({ phone, providerMessageId }) {
      transport.forget({ companyId, phone })
      // Abre a sessão (e a linha no módulo) antes: o despachante lê a posição por ela.
      await deps.openSession({ phone })
      await deps.sessions.setFlowPosition(companyId, phone, deps.rootFlowKey, ROOT_MENU_NODE)
      deps.logger.info('whatsapp_evolution.assistant_started', { companyId })
      await deliver({ answer: { id: EXPENSE_ROOT_OPTION }, messageId: providerMessageId, phone })
    },
  }
}
