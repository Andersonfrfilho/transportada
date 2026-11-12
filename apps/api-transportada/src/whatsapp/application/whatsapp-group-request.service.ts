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
import { botFarewell, botGreeting } from '../domain/bot-greeting.policy.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { AdmittedGroupMessage } from './evolution-group-inbound.service.js'
import { isDriverCancelText } from '../../whatsapp-commands/domain/whatsapp-driver-choice.policy.js'
import {
  formatNextStep,
  formatNotUnderstood,
} from '../../whatsapp-commands/domain/whatsapp-message-format.policy.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupQuestionAsked,
  GroupReplySenderPort,
  GroupRequestClosed,
  GroupRequest,
  GroupRequestFlow,
  GroupRequestRepositoryPort,
} from './whatsapp-group-request.port.js'

/** Respostas que não cabem na pergunta até o pedido ser encerrado (regra 7). */
export const GROUP_REQUEST_MAX_ATTEMPTS = 3

/** O motivo do "não entendi" vira frase: inicial maiúscula e ponto final (o que termina em ":" introduz as opções). */
function toReasonSentence(reason: string): string {
  const trimmed = reason.trim()
  const sentence = trimmed.endsWith(':') ? trimmed : `${trimmed.replace(/[.\s]+$/u, '')}.`
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`
}

export const GROUP_REQUEST_TEXT = {
  busy: '⏳ *Já tem um pedido aberto neste grupo.*\nTermine o pedido de cima ou responda *cancelar*.',
  cancelled: `↩️ *Pedido cancelado.* Nada foi registrado.\n${formatNextStep('quando quiser, marque o bot de novo.')}`,
  gaveUp:
    '🙋 *Não consegui entender depois de 3 tentativas* e encerrei o pedido.\nO escritório vai acompanhar por aqui.',
  notUnderstood: (reason: string, prompt: string) =>
    [
      formatNotUnderstood({ reason: toReasonSentence(reason) }),
      ...(prompt === '' ? [] : [prompt]),
    ].join('\n'),
} as const

/**
 * Spec 292 T7: o diálogo do pedido, para a conversa da ocorrência mostrar o que se falou no grupo. Fica no `state`
 * só até o pedido fechar e abrir ocorrência; a cópia para a conversa é da passada do retorno ao grupo
 * (`syncWhatsAppGroupRequestTranscripts`). Teto de linhas e de tamanho: o resto não entra.
 */
export const GROUP_REQUEST_TRANSCRIPT_LIMIT = 60
export const GROUP_REQUEST_TRANSCRIPT_TEXT_LIMIT = 2000

export type GroupRequestTranscriptEntry = {
  readonly at: string
  readonly from: 'bot' | 'member'
  readonly name?: string
  /** Só dígitos; só de quem escreveu (`member`). */
  readonly number?: string
  readonly text: string
}

function transcriptOf(state: Readonly<Record<string, unknown>>): GroupRequestTranscriptEntry[] {
  const value = state.transcript
  return Array.isArray(value) ? (value as GroupRequestTranscriptEntry[]) : []
}

/** O estado com a mensagem do membro e as respostas do bot acrescentadas ao diálogo. */
export function withTranscript(
  state: Readonly<Record<string, unknown>>,
  previous: Readonly<Record<string, unknown>>,
  turn: {
    readonly at: Date
    readonly message: Pick<AdmittedGroupMessage, 'sender' | 'senderName' | 'text'>
    readonly replies: readonly string[]
  },
): Readonly<Record<string, unknown>> {
  const at = turn.at.toISOString()
  const clip = (text: string) => text.slice(0, GROUP_REQUEST_TRANSCRIPT_TEXT_LIMIT)
  const member: GroupRequestTranscriptEntry = {
    at,
    from: 'member',
    ...(turn.message.senderName === null || turn.message.senderName === ''
      ? {}
      : { name: turn.message.senderName }),
    number: turn.message.sender,
    text: clip(turn.message.text === '' ? '@bot' : turn.message.text),
  }
  const transcript = [
    ...transcriptOf(previous),
    member,
    ...turn.replies.map(
      (text): GroupRequestTranscriptEntry => ({ at, from: 'bot', text: clip(text) }),
    ),
  ].slice(0, GROUP_REQUEST_TRANSCRIPT_LIMIT)
  return { ...state, transcript }
}

export const GROUP_REQUEST_LOG = {
  abandoned: 'whatsapp_group_request.abandoned',
  answered: 'whatsapp_group_request.answered',
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
  /** O dono compartilhou a localização com um pedido esperando por ela: avança o pedido. */
  handleLocation(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly location?: { readonly latitude: number; readonly longitude: number }
    readonly sender: string
  }): Promise<boolean>
}

/** Spec 292 T9: o pedido aberto começa cumprimentando quem chamou, pela hora de Brasília. */
function greeted(
  outcome: GroupFlowOutcome,
  senderName: null | string,
  now: Date,
): GroupFlowOutcome {
  const greeting = botGreeting(now, senderName)
  if (outcome.kind === 'not_understood') {
    return { ...outcome, prompt: `${greeting}\n\n${outcome.prompt}` }
  }
  const [first, ...rest] = outcome.replies
  return {
    ...outcome,
    replies: first === undefined ? [greeting] : [`${greeting}\n\n${first}`, ...rest],
  }
}

/** E termina se despedindo, na última mensagem do pedido. */
function withFarewell(replies: readonly string[], now: Date): readonly string[] {
  const last = replies.at(-1)
  if (last === undefined) return replies
  return [...replies.slice(0, -1), `${last}\n\n${botFarewell(now)}`]
}

export const isCancelText = isDriverCancelText

export function createWhatsAppGroupRequestSessions(dependencies: {
  readonly clock: () => Date
  readonly flow: GroupRequestFlow
  readonly logger: ApiLogger
  /** O bot fez uma pergunta nova no pedido deste dono (a mais recente é quem recebe o "1"/"2"). */
  readonly onQuestionAsked?: GroupQuestionAsked
  /** O pedido terminou: o que ele guardou para si (ex.: o ponto compartilhado) deixa de valer. */
  readonly onRequestClosed?: GroupRequestClosed
  readonly replies: GroupReplySenderPort
  readonly repository: GroupRequestRepositoryPort
}): WhatsAppGroupRequestSessions {
  const { flow, logger, replies, repository } = dependencies

  const say = (
    message: Pick<AdmittedGroupMessage, 'companyId' | 'groupJid' | 'sender'>,
    texts: readonly string[],
  ) => {
    if (texts.length > 0) {
      replies.send({
        companyId: message.companyId,
        groupJid: message.groupJid,
        mentionNumber: message.sender,
        texts,
      })
    }
  }

  const closed = (request: GroupRequest, groupJid: string) =>
    dependencies.onRequestClosed?.({
      companyId: request.companyId,
      driverId: request.driverId,
      groupJid,
    })

  const turnOf = (message: AdmittedGroupMessage, request: GroupRequest): GroupFlowTurn => ({
    ...(message.canImportXml === true ? { canImportXml: true } : {}),
    request,
    sender: message.sender,
    senderName: message.senderName,
    ...(message.sentAt === undefined ? {} : { sentAt: message.sentAt }),
    text: message.text,
  })

  /** Aplica o que o fluxo devolveu: anda, conclui ou conta a tentativa. */
  async function apply(
    message: Pick<
      AdmittedGroupMessage,
      'companyId' | 'groupJid' | 'sender' | 'senderName' | 'text'
    >,
    request: GroupRequest,
    outcome: GroupFlowOutcome,
  ): Promise<void> {
    const now = dependencies.clock()
    const scope = { companyId: request.companyId, id: request.id, now, version: request.version }
    const log = { companyId: request.companyId, requestId: request.id }

    const record = (state: Readonly<Record<string, unknown>>, replies: readonly string[]) =>
      withTranscript(state, request.state, { at: now, message, replies })

    if (outcome.kind === 'continue') {
      const saved = await repository.update({
        ...scope,
        attempts: 0,
        state: record(outcome.state, outcome.replies),
        step: outcome.step,
      })
      if (!saved) return logger.info(GROUP_REQUEST_LOG.raced, log)
      // A pergunta nova é a mais recente: confirmação de áudio pendente de antes não responde por ela.
      dependencies.onQuestionAsked?.({
        companyId: request.companyId,
        groupJid: message.groupJid,
        owner: request.ownerNumber,
      })
      return say(message, outcome.replies)
    }
    if (outcome.kind === 'done') {
      const closing =
        outcome.withoutFarewell === true ? outcome.replies : withFarewell(outcome.replies, now)
      const saved = await repository.update({
        ...scope,
        attempts: request.attempts,
        close: 'completed',
        state: record(request.state, closing),
        step: request.step,
      })
      if (!saved) return logger.info(GROUP_REQUEST_LOG.raced, log)
      logger.info(GROUP_REQUEST_LOG.completed, log)
      closed(request, message.groupJid)
      return say(message, closing)
    }

    const attempts = request.attempts + 1
    const gaveUp = attempts >= GROUP_REQUEST_MAX_ATTEMPTS
    const saved = await repository.update({
      ...scope,
      attempts,
      ...(gaveUp ? { close: 'abandoned' as const } : {}),
      state: record(request.state, [
        gaveUp
          ? GROUP_REQUEST_TEXT.gaveUp
          : GROUP_REQUEST_TEXT.notUnderstood(outcome.reason, outcome.prompt),
      ]),
      step: request.step,
    })
    if (!saved) return logger.info(GROUP_REQUEST_LOG.raced, log)
    if (gaveUp) {
      logger.info(GROUP_REQUEST_LOG.abandoned, log)
      closed(request, message.groupJid)
      return say(message, [GROUP_REQUEST_TEXT.gaveUp])
    }
    return say(message, [GROUP_REQUEST_TEXT.notUnderstood(outcome.reason, outcome.prompt)])
  }

  return {
    async findOpenOwner({ companyId, groupJid }) {
      const open = await repository.findOpen({ companyId, groupJid, now: dependencies.clock() })
      return open?.ownerNumber ?? null
    },

    async handleLocation({ companyId, groupJid, location, sender }) {
      const open = await repository.findOpen({ companyId, groupJid, now: dependencies.clock() })
      if (
        open === null ||
        open.ownerNumber === '' ||
        open.ownerNumber !== sender ||
        flow.locationReceived === undefined
      ) {
        return false
      }
      const outcome = await flow.locationReceived({
        ...(location === undefined ? {} : { location }),
        request: open,
        sender,
        senderName: null,
        text: '',
      })
      if (outcome === null) return false
      await apply(
        { companyId, groupJid, sender, senderName: null, text: '📍 (localização)' },
        open,
        outcome,
      )
      return true
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
        const started = await flow.start(turnOf(message, request))
        return apply(message, request, greeted(started, message.senderName, dependencies.clock()))
      }

      await link(open)
      const isOwner = open.ownerNumber !== '' && message.sender === open.ownerNumber
      if (isCancelText(message.text) && (isOwner || message.via === 'mention')) {
        const owned = await flow.cancel?.(turnOf(message, open))
        if (owned !== undefined && owned !== null) return apply(message, open, owned)
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
        closed(open, groupJid)
        return say(message, [GROUP_REQUEST_TEXT.cancelled])
      }

      const outcome = await flow.answer(turnOf(message, open))
      logger.info(GROUP_REQUEST_LOG.answered, {
        companyId,
        isOwner,
        outcome: outcome.kind,
        requestId: open.id,
        step: open.step,
        via: message.via,
      })
      if (outcome.kind === 'not_understood' && !isOwner) {
        // Outra pessoa marcou o bot sem responder a pergunta aberta: é uma chamada nova (regra 5).
        logger.info(GROUP_REQUEST_LOG.busy, { companyId })
        return say(message, [GROUP_REQUEST_TEXT.busy])
      }
      return apply(message, open, outcome)
    },
  }
}
