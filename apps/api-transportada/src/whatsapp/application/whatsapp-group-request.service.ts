/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T4: **a sessão do pedido no grupo do motorista.** Recebe a mensagem que a porta do grupo
 * (T3) aceitou e decide o que ela é:
 *
 * - sem pedido aberto, marcação abre um pedido (dono = quem marcou) e entrega ao fluxo (T5);
 * - com pedido aberto, "cancelar" do dono (ou de quem marcou o bot) fecha; o resto vai ao fluxo;
 * - resposta que não cabe na pergunta conta tentativa; na terceira o pedido é encerrado (regra 7);
 * - marcação de outra pessoa que não responde a pergunta aberta é uma chamada nova: "há um pedido em
 *   andamento" (regra 5), sem gastar tentativa do dono.
 *
 * Um por vez por grupo é garantido no banco (índice único parcial). Reentrega do Evolution não anda o
 * pedido duas vezes (`claimMessage`). Duas mensagens ao mesmo tempo no mesmo pedido: a segunda perde a
 * versão e é descartada sem resposta.
 *
 * ⚠️ Nada de número nem texto em log: só empresa, pedido e motivo.
 */
import type { ApiLogger } from '../../shared/api.types.js'
import type { AdmittedGroupMessage } from './evolution-group-inbound.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupReplySenderPort,
  GroupRequest,
  GroupRequestFlow,
  GroupRequestRepositoryPort,
} from './whatsapp-group-request.port.js'

/** Respostas que não cabem na pergunta até o pedido ser encerrado (regra 7). */
export const GROUP_REQUEST_MAX_ATTEMPTS = 3

export const GROUP_REQUEST_TEXT = {
  busy: 'Há um pedido em andamento neste grupo. Aguarde terminar ou responda "cancelar".',
  cancelled: 'Pedido cancelado.',
  gaveUp:
    'Não consegui entender depois de 3 tentativas e encerrei o pedido. Suporte, por favor, acompanhe por aqui.',
  notUnderstood: (reason: string, prompt: string) => `Não entendi: ${reason}. ${prompt}`,
} as const

const CANCEL_WORDS = new Set(['cancelar', 'cancela', 'cancele', 'cancelado', 'sair', 'parar'])

export const GROUP_REQUEST_LOG = {
  abandoned: 'whatsapp_group_request.abandoned',
  busy: 'whatsapp_group_request.busy',
  cancelled: 'whatsapp_group_request.cancelled',
  completed: 'whatsapp_group_request.completed',
  duplicate: 'whatsapp_group_request.duplicate',
  opened: 'whatsapp_group_request.opened',
  raced: 'whatsapp_group_request.raced',
} as const

export type WhatsAppGroupRequestSessions = {
  /** A porta `findOpenRequestOwner` da T3: o dono do pedido aberto e não vencido, ou `null`. */
  findOpenOwner(input: {
    readonly companyId: string
    readonly groupJid: string
  }): Promise<null | string>
  /** A porta `handle` da T3. */
  handle(message: AdmittedGroupMessage): Promise<void>
}

export function isCancelText(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z ]/gu, ' ')
    .trim()
  return normalized.split(/\s+/u).some((word) => CANCEL_WORDS.has(word)) && normalized.length <= 30
}

export function createWhatsAppGroupRequestSessions(dependencies: {
  readonly clock: () => Date
  readonly flow: GroupRequestFlow
  readonly logger: ApiLogger
  readonly replies: GroupReplySenderPort
  readonly repository: GroupRequestRepositoryPort
}): WhatsAppGroupRequestSessions {
  const { flow, logger, replies, repository } = dependencies

  const say = (message: AdmittedGroupMessage, texts: readonly string[]) => {
    if (texts.length > 0) {
      replies.send({ companyId: message.companyId, groupJid: message.groupJid, texts })
    }
  }

  const turnOf = (message: AdmittedGroupMessage, request: GroupRequest): GroupFlowTurn => ({
    request,
    sender: message.sender,
    senderName: message.senderName,
    text: message.text,
  })

  /** Aplica o que o fluxo devolveu: anda, conclui ou conta a tentativa. */
  async function apply(
    message: AdmittedGroupMessage,
    request: GroupRequest,
    outcome: GroupFlowOutcome,
  ): Promise<void> {
    const now = dependencies.clock()
    const scope = { companyId: request.companyId, id: request.id, now, version: request.version }
    const log = { companyId: request.companyId, requestId: request.id }

    if (outcome.kind === 'continue') {
      const saved = await repository.update({
        ...scope,
        attempts: 0,
        state: outcome.state,
        step: outcome.step,
      })
      if (!saved) return logger.info(GROUP_REQUEST_LOG.raced, log)
      return say(message, outcome.replies)
    }
    if (outcome.kind === 'done') {
      const saved = await repository.update({
        ...scope,
        attempts: request.attempts,
        close: 'completed',
        state: request.state,
        step: request.step,
      })
      if (!saved) return logger.info(GROUP_REQUEST_LOG.raced, log)
      logger.info(GROUP_REQUEST_LOG.completed, log)
      return say(message, outcome.replies)
    }

    const attempts = request.attempts + 1
    const gaveUp = attempts >= GROUP_REQUEST_MAX_ATTEMPTS
    const saved = await repository.update({
      ...scope,
      attempts,
      ...(gaveUp ? { close: 'abandoned' as const } : {}),
      state: request.state,
      step: request.step,
    })
    if (!saved) return logger.info(GROUP_REQUEST_LOG.raced, log)
    if (gaveUp) {
      logger.info(GROUP_REQUEST_LOG.abandoned, log)
      return say(message, [GROUP_REQUEST_TEXT.gaveUp])
    }
    return say(message, [GROUP_REQUEST_TEXT.notUnderstood(outcome.reason, outcome.prompt)])
  }

  return {
    async findOpenOwner({ companyId, groupJid }) {
      const open = await repository.findOpen({ companyId, groupJid, now: dependencies.clock() })
      return open?.ownerNumber ?? null
    },

    async handle(message) {
      const { companyId, groupJid } = message
      const claimed = await repository.claimMessage({
        companyId,
        providerMessageId: message.providerMessageId,
        senderNumber: message.sender,
        via: message.via,
      })
      if (!claimed) return logger.info(GROUP_REQUEST_LOG.duplicate, { companyId })

      const link = (request: GroupRequest) =>
        repository.linkMessage({
          companyId,
          providerMessageId: message.providerMessageId,
          requestId: request.id,
          stepBefore: request.step,
        })

      const open = await repository.findOpen({ companyId, groupJid, now: dependencies.clock() })
      if (open === null) {
        // Resposta do dono a um pedido que venceu entre a T3 ler e chegar aqui: nada a fazer.
        if (message.via !== 'mention') return
        const request = await repository.open({
          companyId,
          driverId: message.driverId,
          groupJid,
          now: dependencies.clock(),
          ownerNumber: message.sender,
          step: flow.initialStep,
        })
        if (request === null) {
          logger.info(GROUP_REQUEST_LOG.busy, { companyId })
          return say(message, [GROUP_REQUEST_TEXT.busy])
        }
        await link(request)
        logger.info(GROUP_REQUEST_LOG.opened, { companyId, requestId: request.id })
        return apply(message, request, await flow.start(turnOf(message, request)))
      }

      await link(open)
      const isOwner = message.sender === open.ownerNumber
      if (isCancelText(message.text) && (isOwner || message.via === 'mention')) {
        const saved = await repository.update({
          attempts: open.attempts,
          close: 'cancelled',
          companyId,
          id: open.id,
          now: dependencies.clock(),
          state: open.state,
          step: open.step,
          version: open.version,
        })
        if (!saved) return logger.info(GROUP_REQUEST_LOG.raced, { companyId, requestId: open.id })
        logger.info(GROUP_REQUEST_LOG.cancelled, { companyId, requestId: open.id })
        return say(message, [GROUP_REQUEST_TEXT.cancelled])
      }

      const outcome = await flow.answer(turnOf(message, open))
      if (outcome.kind === 'not_understood' && !isOwner) {
        // Outra pessoa marcou o bot sem responder a pergunta aberta: é uma chamada nova (regra 5).
        logger.info(GROUP_REQUEST_LOG.busy, { companyId })
        return say(message, [GROUP_REQUEST_TEXT.busy])
      }
      return apply(message, open, outcome)
    },
  }
}
