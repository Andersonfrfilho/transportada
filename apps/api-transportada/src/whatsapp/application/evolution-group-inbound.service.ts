/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T3: **a mensagem de grupo chega ao bot.** Até aqui o webhook descartava todo grupo. Agora a
 * mensagem passa por uma lista de permissão (o grupo precisa estar na ficha de um motorista, T1), pela
 * marcação do bot e pela regra do dono do pedido (`decideGroupMessage`); só o que passa vai ao
 * tratador do pedido.
 *
 * Ordem pensada para custo e segurança: o grupo é conferido no banco **antes** de qualquer chamada ao
 * Evolution, então grupo desconhecido nunca gera tráfego. Falha ao falar com o Evolution fecha a porta
 * (`identity_unavailable`), nunca aceita sem saber quem escreveu.
 *
 * O pedido em si (sessão, um por vez, tempo limite) é da T4: aqui ela entra por duas portas,
 * `findOpenRequestOwner` e `handle`, que até lá são o "sem pedido aberto" e o registro em log.
 *
 * ⚠️ Nada de número, texto ou id de grupo em log: só empresa, motivo e contagens.
 */
import type { EvolutionWebhookEvent } from '@adatechnology/evolution-whatsapp-provider'

import { matchWakePhrase } from '../domain/bot-wake-phrase.policy.js'
import { BOT_AUDIO_SPEECH, botAudioQuickAnswer } from './whatsapp-bot-audio.service.js'
import type { WhatsAppTurnReplies } from '../../whatsapp-commands/application/whatsapp-turn-replies.service.js'
import { isCancelText } from './whatsapp-group-request.service.js'

import {
  decideGroupMessage,
  type GroupMessageIgnoredReason,
  parseJid,
} from '../domain/evolution-group-message.policy.js'
import type {
  EvolutionGroupIdentity,
  LazyEvolutionConnection,
} from './evolution-group-identity.service.js'
import type { WhatsAppBotAudio } from './whatsapp-bot-audio.service.js'
import type { GroupQuestionAsked } from './whatsapp-group-request.port.js'

/** Áudio não endereçado só é ouvido até 1 minuto: a chamada vem no começo, conversa longa é das pessoas. */
const BOT_AUDIO_WAKE_MAX_SECONDS = 60
/** Spec 292 T9: depois do "2", quanto tempo a pessoa pode reenviar sem a frase de chamada. */
/** O diagnóstico da frase de chamada loga só o começo da fala: a frase vem no começo. */
export const BOT_AUDIO_WAKE_DEBUG_CHARACTERS = 60

export const BOT_AUDIO_RETRY_WINDOW_MS = 5 * 60_000

export type EvolutionMessageEvent = Extract<EvolutionWebhookEvent, { type: 'message' }>

/** A mensagem que o bot aceitou: o que a sessão do pedido (T4) recebe. */
export type AdmittedGroupMessage = {
  readonly companyId: string
  /** O motorista dono do grupo: toda mensagem do grupo é dele (regra 1). */
  readonly driverId: string
  readonly groupJid: string
  readonly providerMessageId: string
  readonly replyToProviderMessageId: null | string
  /** O dono do pedido aberto quando a mensagem chegou, ou `null` (quem marcou pode responder por ele). */
  readonly requestOwner: null | string
  /** Quem escreveu, só dígitos. */
  readonly sender: string
  readonly senderName: null | string
  /** Sem a marcação do bot; vazio quando só marcou (o pedido guiado). */
  readonly text: string
  readonly via: 'mention' | 'owner_reply'
  /** Spec 294: a hora do WhatsApp (`messageTimestamp`); ausente vale como agora (tempo real). */
  readonly sentAt?: Date | undefined
}

/** O `messageTimestamp` do Evolution (segundos) como data; inválido ou ausente, `undefined`. */
export function toMessageSentAt(timestamp: null | number): Date | undefined {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) return undefined
  return new Date(timestamp * 1000)
}

/**
 * Spec 293 T15: a foto ou a localização que chegou ao grupo, lida do corpo cru (o SDK 0.3.0 só lê
 * texto). A foto ainda não foi baixada: quem trata pede ao Evolution pelo id da mensagem.
 */
export type GroupMedia =
  | {
      readonly caption: null | string
      readonly kind: 'image'
      readonly mimeType: string
      /** A mensagem do webhook: o Evolution não grava as mensagens, então a foto pedida só pelo id não baixa. */
      readonly rawMessage?: { readonly key: unknown; readonly message: unknown }
    }
  | { readonly kind: 'location'; readonly latitude: number; readonly longitude: number }

/** A foto/localização aceita: só do motorista do grupo (desenho 3.4, regra 9). */
export type AdmittedGroupMedia = {
  readonly companyId: string
  readonly connection: LazyEvolutionConnection
  readonly driverId: string
  readonly groupJid: string
  readonly media: GroupMedia
  readonly providerMessageId: string
  readonly sender: string
  /** Segundos desde 1970, do Evolution; `null` quando não veio. */
  readonly timestamp: null | number
}

/** Spec 292 T9: o áudio de voz que chegou ao grupo, lido do corpo cru (o SDK 0.3.0 só lê texto). */
export type GroupAudio = {
  readonly mimeType: string
  /** Quem escreveu a mensagem citada pelo áudio (jid cru), ou `null` sem citação. */
  readonly quotedParticipant: null | string
  /**
   * A mensagem como veio no webhook (`key` + `message`). O Evolution de staging não grava as
   * mensagens, então pedir a mídia só pelo id volta "Message not found" para sempre (medido em
   * 04/11/2026); com a mensagem inteira ele baixa e decifra sem ir ao banco.
   */
  readonly rawMessage?: { readonly key: unknown; readonly message: unknown }
  readonly seconds: null | number
}

/** O que o fluxo do grupo precisa para seguir quando quem mandou o áudio confirmar o texto. */
export type GroupAudioContext = {
  readonly driverId: string
  readonly replyToProviderMessageId: null | string
  readonly senderName: null | string
}

/** Spec 292 T9: o áudio do bot no grupo (transcrição e confirmação). Ausente, áudio é ignorado. */
export type EvolutionGroupAudioPorts = {
  readonly bot: WhatsAppBotAudio<GroupAudioContext>
  /**
   * A frase de chamada por voz ("atendimento Fernandes"), já em palavras (`parseWakePhrase`). Vazia,
   * o áudio que ninguém endereçou ao bot continua ignorado sem transcrever.
   */
  readonly wakePhrase?: readonly string[]
  /**
   * Spec 292 T9: as linhas da nota falada no "Entendi assim" (cliente, valor, endereço, ou o aviso
   * de que não bate com as notas do motorista). Ausente, a confirmação mostra só o texto.
   */
  readonly describeNotes?: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly text: string
  }) => Promise<readonly string[]>
  /**
   * Diagnóstico de staging (`WHATSAPP_BOT_WAKE_DEBUG=true`): recebe o começo do que o whisper ouviu
   * quando a frase de chamada não casou. Ausente (o padrão, e sempre em produção), nada sai.
   */
  readonly onWakeMissed?: (heard: string) => void
  download(input: {
    readonly connection: LazyEvolutionConnection
    readonly providerMessageId: string
    readonly rawMessage?: { readonly key: unknown; readonly message: unknown }
  }): Promise<{ readonly data: string; readonly mimeType: string }>
  reply(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly texts: readonly string[]
  }): void
}

export type EvolutionGroupInboundPorts = {
  /**
   * Spec 292 T9: o áudio de quem tem o pedido aberto no grupo (o bot está esperando a resposta dele)
   * ou que responde (cita) uma mensagem do bot. Áudio entre as pessoas do grupo continua ignorado.
   */
  readonly audio?: EvolutionGroupAudioPorts
  /** Para testes: o relógio da janela de reenvio depois do "2". */
  readonly now?: () => number
  /** O turno da mensagem recebida (o mesmo do remetente do grupo); ausente, cada resposta sai como veio. */
  readonly turnReplies?: WhatsAppTurnReplies
  /** O motorista cujo grupo é este, na empresa do webhook; `null` fora da lista de permissão. */
  findGroupDriver(input: {
    readonly companyId: string
    readonly groupJid: string
  }): Promise<null | { readonly driverId: string }>
  /** T4: o número (só dígitos) de quem abriu o pedido em andamento no grupo, ou `null`. */
  findOpenRequestOwner(input: {
    readonly companyId: string
    readonly groupJid: string
  }): Promise<null | string>
  /** T4/T5: o que fazer com a mensagem aceita. Deve ser idempotente pelo `providerMessageId`. */
  handle(message: AdmittedGroupMessage): Promise<void>
  /**
   * Spec 293 T15: a foto/localização do motorista do grupo (as provas da entrega). Ausente, a mídia é
   * ignorada como antes (`no_text`).
   */
  handleMedia?: (media: AdmittedGroupMedia) => Promise<void>
  /**
   * Spec 292 T9: a localização de quem tem o pedido aberto e não é o motorista do grupo (o
   * operador que abriu o pedido) avança o passo da localização. `true` quando avançou.
   */
  advanceRequestLocation?: (input: {
    readonly companyId: string
    readonly groupJid: string
    readonly location?: { readonly latitude: number; readonly longitude: number }
    readonly sender: string
  }) => Promise<boolean>
  /** Spec 293 T15: quem escreveu (só dígitos) é o motorista dono do grupo? Spec 294: ou um atendente. */
  isGroupDriver?: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly sender: string
  }) => Promise<boolean>
}

export type EvolutionGroupInboundOutcome =
  | 'admitted'
  | 'audio'
  | 'audio_answer'
  | 'audio_listening'
  | 'media'
  | 'not_driver'
  | GroupMessageIgnoredReason

export type EvolutionGroupInbound = {
  receive(input: {
    /** Spec 292 T9: o áudio de voz da mensagem, lido do corpo cru; `null` sem áudio. */
    readonly audio?: GroupAudio | null
    readonly companyId: string
    readonly connection: LazyEvolutionConnection
    readonly event: EvolutionMessageEvent
    /** Spec 293 T15: a foto/localização da mensagem, lida do corpo cru; `null` sem mídia. */
    readonly media?: GroupMedia | null
    /** Os dígitos do `@lid` de quem escreveu, lidos do corpo cru (o SDK 0.3.0 não os devolve). */
    readonly senderLid: null | string
  }): Promise<EvolutionGroupInboundOutcome>
}

export function createEvolutionGroupInbound(
  dependencies: EvolutionGroupInboundPorts & { readonly identity: EvolutionGroupIdentity },
): EvolutionGroupInbound {
  const { identity } = dependencies
  const now = dependencies.now ?? Date.now
  /**
   * Spec 292 T9: quem respondeu "2" a um áudio pode mandar de novo (áudio ou texto) sem repetir a frase
   * de chamada nem marcar o bot, por alguns minutos: a resposta do descarte convida a isso.
   */
  const retryUntil = new Map<string, number>()
  const retryKey = (companyId: string, groupJid: string, sender: string) =>
    `${companyId}|${groupJid}|${sender}`
  const takeRetry = (companyId: string, groupJid: string, sender: string): boolean => {
    const key = retryKey(companyId, groupJid, sender)
    const until = retryUntil.get(key)
    if (until === undefined) return false
    retryUntil.delete(key)
    return until > now()
  }

  /**
   * Spec 292 T9: áudio que ninguém endereçou ao bot. Com a frase de chamada configurada e até 1 minuto,
   * é transcrito calado; sem a frase no texto, é descartado sem resposta e sem guardar nada. Com ela, o
   * resto da frase vai para a confirmação (ou, vazio, abre o menu como o "@bot" sozinho).
   */
  function listenForWakePhrase(input: {
    readonly audio: GroupAudio
    readonly companyId: string
    readonly connection: LazyEvolutionConnection
    readonly driverId: string
    readonly event: EvolutionMessageEvent
    readonly groupJid: string
    readonly ports: EvolutionGroupAudioPorts
    readonly requestOwner: null | string
    readonly sender: string
  }): EvolutionGroupInboundOutcome {
    const { audio, companyId, connection, event, groupJid, ports, sender } = input
    const phrase = ports.wakePhrase ?? []
    if (phrase.length === 0) return 'not_addressed'
    if (audio.seconds !== null && audio.seconds > BOT_AUDIO_WAKE_MAX_SECONDS) return 'not_addressed'
    ports.bot.listen({
      companyId,
      conversation: groupConversation(groupJid),
      owner: sender,
      download: () =>
        ports.download({
          connection,
          providerMessageId: event.externalMessageId,
          ...(audio.rawMessage === undefined ? {} : { rawMessage: audio.rawMessage }),
        }),
      mimeType: audio.mimeType,
      onText: async (text) => {
        const rest = matchWakePhrase(phrase, text)
        if (rest === null) {
          ports.onWakeMissed?.(text.slice(0, BOT_AUDIO_WAKE_DEBUG_CHARACTERS))
          return
        }
        if (rest === '') {
          const currentOwner = await dependencies.findOpenRequestOwner({ companyId, groupJid })
          await dependencies.handle({
            companyId,
            driverId: input.driverId,
            groupJid,
            providerMessageId: event.externalMessageId,
            replyToProviderMessageId: event.replyToExternalMessageId,
            requestOwner: currentOwner,
            sender,
            senderName: event.pushName,
            text: '',
            via: currentOwner === sender ? 'owner_reply' : 'mention',
          })
          return
        }
        await ports.bot.offer({
          companyId,
          context: {
            driverId: input.driverId,
            replyToProviderMessageId: event.replyToExternalMessageId,
            senderName: event.pushName,
          },
          conversation: groupConversation(groupJid),
          ...notesOf(ports, companyId, input.driverId),
          owner: sender,
          reply: (texts) => ports.reply({ companyId, groupJid, texts }),
          text: rest,
        })
      },
    })
    return 'audio_listening'
  }

  /**
   * "Cancelar" encerra também o que é do áudio: a confirmação pendente e as transcrições em andamento
   * de quem falou. Sem pedido aberto, é só isso que há para cancelar: avisa e não abre pedido novo.
   * Devolve `true` quando consumiu a mensagem.
   */
  async function cancelPendingAudio(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly ports: EvolutionGroupAudioPorts
    readonly sender: string
  }): Promise<boolean> {
    const { companyId, groupJid, ports, sender } = input
    const cancelled = ports.bot.cancel({
      companyId,
      conversation: groupConversation(groupJid),
      owner: sender,
    })
    if (!cancelled) return false
    if ((await dependencies.findOpenRequestOwner({ companyId, groupJid })) !== null) return false
    await ports.reply({ companyId, groupJid, texts: [BOT_AUDIO_SPEECH.discarded] })
    return true
  }

  /**
   * Spec 292 T9: a resposta ("1"/"2", digitada ou falada) a um áudio esperando confirmação. Devolve
   * `true` quando consumiu a mensagem (confirmou ou descartou).
   */
  async function applyAudioAnswer(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly ports: EvolutionGroupAudioPorts
    readonly providerMessageId: string
    readonly pushName: null | string
    readonly sender: string
    readonly spoken: boolean
    readonly text: string
  }): Promise<boolean> {
    const { companyId, groupJid, ports, sender } = input
    const answer = ports.bot.answer({
      companyId,
      conversation: groupConversation(groupJid),
      owner: sender,
      spoken: input.spoken,
      text: input.text,
    })
    if (answer.kind === 'discarded') {
      retryUntil.set(retryKey(companyId, groupJid, sender), now() + BOT_AUDIO_RETRY_WINDOW_MS)
      await ports.reply({ companyId, groupJid, texts: [BOT_AUDIO_SPEECH.discarded] })
      return true
    }
    if (answer.kind !== 'confirmed') return false
    const currentOwner = await dependencies.findOpenRequestOwner({ companyId, groupJid })
    await dependencies.handle({
      companyId,
      driverId: answer.context.driverId,
      groupJid,
      providerMessageId: input.providerMessageId,
      replyToProviderMessageId: answer.context.replyToProviderMessageId,
      requestOwner: currentOwner,
      sender,
      senderName: answer.context.senderName ?? input.pushName,
      text: answer.text,
      via: currentOwner === sender ? 'owner_reply' : 'mention',
    })
    return true
  }

  /**
   * Spec 292 T9: áudio de quem tem outro áudio esperando confirmação. "Sim"/"Não" falado vale como
   * "1"/"2"; qualquer outra fala substitui o texto pendente e pede a confirmação dele.
   */
  function listenForSpokenAnswer(input: {
    readonly audio: GroupAudio
    readonly companyId: string
    readonly connection: LazyEvolutionConnection
    readonly driverId: string
    readonly event: EvolutionMessageEvent
    readonly groupJid: string
    readonly ports: EvolutionGroupAudioPorts
    readonly sender: string
  }): EvolutionGroupInboundOutcome {
    const { audio, companyId, connection, event, groupJid, ports, sender } = input
    ports.bot.listen({
      companyId,
      conversation: groupConversation(groupJid),
      owner: sender,
      download: () =>
        ports.download({
          connection,
          providerMessageId: event.externalMessageId,
          ...(audio.rawMessage === undefined ? {} : { rawMessage: audio.rawMessage }),
        }),
      mimeType: audio.mimeType,
      onText: async (text) => {
        if (
          isCancelText(text) &&
          (await cancelPendingAudio({ companyId, groupJid, ports, sender }))
        ) {
          return
        }
        const handled = await applyAudioAnswer({
          companyId,
          groupJid,
          ports,
          providerMessageId: event.externalMessageId,
          pushName: event.pushName,
          sender,
          spoken: true,
          text,
        })
        if (handled) return
        const phrase = ports.wakePhrase ?? []
        const rest = phrase.length === 0 ? null : matchWakePhrase(phrase, text)
        await ports.bot.offer({
          companyId,
          context: {
            driverId: input.driverId,
            replyToProviderMessageId: event.replyToExternalMessageId,
            senderName: event.pushName,
          },
          conversation: groupConversation(groupJid),
          ...notesOf(ports, companyId, input.driverId),
          owner: sender,
          reply: (texts) => ports.reply({ companyId, groupJid, texts }),
          text: rest === null || rest === '' ? text : rest,
        })
      },
    })
    return 'audio_answer'
  }

  async function receiveAudio(input: {
    readonly audio: GroupAudio
    readonly companyId: string
    readonly connection: LazyEvolutionConnection
    readonly driverId: string
    readonly event: EvolutionMessageEvent
    readonly groupJid: string
    readonly ports: EvolutionGroupAudioPorts
    readonly senderLid: null | string
  }): Promise<EvolutionGroupInboundOutcome> {
    const { audio, companyId, connection, event, groupJid, ports, senderLid } = input
    let sender = event.participant
    let quotesBot = false
    try {
      const botNumber = await identity.botNumber({ companyId, connection })
      if (botNumber === null) return 'identity_unavailable'
      const quoted = parseJid(audio.quotedParticipant)
      const lids = [
        ...(sender === '' && senderLid !== null ? [senderLid] : []),
        ...(quoted?.server === 'lid' ? [quoted.digits] : []),
      ]
      const directory =
        lids.length === 0
          ? new Map<string, string>()
          : await identity.lidDirectory({ companyId, connection, groupJid, lids })
      if (sender === '' && senderLid !== null) sender = directory.get(senderLid) ?? ''
      if (quoted !== null) {
        const author = quoted.server === 'lid' ? directory.get(quoted.digits) : quoted.digits
        quotesBot = author === botNumber
      }
      if (sender !== '' && sender === botNumber) return 'own_number'
    } catch {
      return 'identity_unavailable'
    }
    if (sender === '') return 'unknown_sender'
    if (
      ports.bot.hasPending({ companyId, conversation: groupConversation(groupJid), owner: sender })
    ) {
      return listenForSpokenAnswer({ ...input, sender })
    }
    const requestOwner = await dependencies.findOpenRequestOwner({ companyId, groupJid })
    // Com a sessão aberta, o bot só ouve o dono dela, sem frase de chamada; áudio de outra pessoa nem é
    // transcrito. Sem sessão, só quem cita o bot ou diz a frase de chamada.
    if (requestOwner !== null && requestOwner !== sender) return 'not_addressed'
    if (requestOwner === null && !quotesBot && !takeRetry(companyId, groupJid, sender)) {
      return listenForWakePhrase({ ...input, requestOwner, sender })
    }
    await ports.bot.receive({
      // Com o pedido aberto com quem fala, a resposta curta (sem número) vai direto ao passo.
      ...(requestOwner === sender
        ? {
            accept: async (text: string) => {
              const quick = botAudioQuickAnswer(text)
              if (quick === null) return false
              if (isCancelText(quick)) {
                ports.bot.cancel({
                  companyId,
                  conversation: groupConversation(groupJid),
                  owner: sender,
                })
              }
              await dependencies.handle({
                companyId,
                driverId: input.driverId,
                groupJid,
                providerMessageId: event.externalMessageId,
                replyToProviderMessageId: event.replyToExternalMessageId,
                requestOwner,
                sender,
                senderName: event.pushName,
                text: quick,
                via: 'owner_reply',
              })
              return true
            },
          }
        : {}),
      companyId,
      context: {
        driverId: input.driverId,
        replyToProviderMessageId: event.replyToExternalMessageId,
        senderName: event.pushName,
      },
      conversation: groupConversation(groupJid),
      ...notesOf(ports, companyId, input.driverId),
      download: () =>
        ports.download({
          connection,
          providerMessageId: event.externalMessageId,
          ...(audio.rawMessage === undefined ? {} : { rawMessage: audio.rawMessage }),
        }),
      mimeType: audio.mimeType,
      owner: sender,
      reply: (texts) => ports.reply({ companyId, groupJid, texts }),
      seconds: audio.seconds,
    })
    return 'audio'
  }

  const inbound: EvolutionGroupInbound = {
    async receive({ audio = null, companyId, connection, event, media = null, senderLid }) {
      if (event.fromMe) return 'from_me'
      const groupJid = event.groupJid
      if (groupJid === null) return 'unknown_group'
      const owner = await dependencies.findGroupDriver({ companyId, groupJid })
      if (owner === null) return 'unknown_group'
      if (audio !== null) {
        if (dependencies.audio === undefined) return 'no_text'
        return receiveAudio({
          audio,
          companyId,
          connection,
          driverId: owner.driverId,
          event,
          groupJid,
          ports: dependencies.audio,
          senderLid,
        })
      }
      const { handleMedia, isGroupDriver } = dependencies
      // Spec 293 T15: foto sem legenda e localização chegam sem texto; com legenda, a foto também é prova.
      if (media !== null && handleMedia !== undefined && isGroupDriver !== undefined) {
        let sender = event.participant
        try {
          if (sender === '' && senderLid !== null) {
            const directory = await identity.lidDirectory({
              companyId,
              connection,
              groupJid,
              lids: [senderLid],
            })
            sender = directory.get(senderLid) ?? ''
          }
        } catch {
          return 'identity_unavailable'
        }
        if (sender === '') return 'unknown_sender'
        if (!(await isGroupDriver({ companyId, driverId: owner.driverId, sender }))) {
          // Não é prova de entrega, mas pode ser a resposta ao passo da localização do pedido dele.
          if (
            media.kind === 'location' &&
            (await dependencies.advanceRequestLocation?.({
              companyId,
              groupJid,
              location: { latitude: media.latitude, longitude: media.longitude },
              sender,
            })) === true
          ) {
            return 'media'
          }
          return 'not_driver'
        }
        await handleMedia({
          companyId,
          connection,
          driverId: owner.driverId,
          groupJid,
          media,
          providerMessageId: event.externalMessageId,
          sender,
          timestamp: event.timestamp,
        })
        return 'media'
      }
      if (event.text === null) return 'no_text'

      let botNumber: null | string
      let botLids: ReadonlySet<string> = new Set()
      let sender = event.participant
      try {
        botNumber = await identity.botNumber({ companyId, connection })
        if (botNumber === null) return 'identity_unavailable'

        const mentionedLids = lidDigits(event.mentionedJids)
        const needsSender = sender === '' && senderLid !== null
        if (mentionedLids.length > 0 || needsSender) {
          const directory = await identity.lidDirectory({
            companyId,
            connection,
            groupJid,
            lids: [...mentionedLids, ...(needsSender ? [senderLid] : [])],
          })
          const number = botNumber
          botLids = new Set(
            [...directory].filter(([, value]) => value === number).map(([lid]) => lid),
          )
          if (needsSender) sender = directory.get(senderLid) ?? ''
        }
      } catch {
        return 'identity_unavailable'
      }

      // Spec 292 T9: "1"/"2" de quem tem um áudio esperando confirmação vale antes de tudo.
      const audioPorts = dependencies.audio
      const conversation = groupConversation(groupJid)
      if (
        audioPorts !== undefined &&
        sender !== '' &&
        isCancelText(event.text.replace(/@\d+/gu, ' ')) &&
        (await cancelPendingAudio({ companyId, groupJid, ports: audioPorts, sender }))
      ) {
        return 'admitted'
      }
      if (
        audioPorts !== undefined &&
        sender !== '' &&
        audioPorts.bot.hasPending({ companyId, conversation, owner: sender })
      ) {
        const handled = await applyAudioAnswer({
          companyId,
          groupJid,
          ports: audioPorts,
          providerMessageId: event.externalMessageId,
          pushName: event.pushName,
          sender,
          spoken: false,
          text: event.text.replace(/@\d+/gu, ' '),
        })
        if (handled) return 'admitted'
      }

      const requestOwner = await dependencies.findOpenRequestOwner({ companyId, groupJid })
      const decision = decideGroupMessage({
        botLids,
        botNumber,
        fromMe: event.fromMe,
        groupRegistered: true,
        mentionedJids: event.mentionedJids,
        requestOwner,
        sender,
        text: event.text,
      })
      if (!decision.admitted) {
        // Texto de quem acabou de descartar um áudio, sem pedido aberto: vale como marcação.
        if (
          decision.reason === 'not_addressed' &&
          requestOwner === null &&
          sender !== '' &&
          event.text.trim() !== '' &&
          takeRetry(companyId, groupJid, sender)
        ) {
          await dependencies.handle({
            companyId,
            driverId: owner.driverId,
            groupJid,
            providerMessageId: event.externalMessageId,
            replyToProviderMessageId: event.replyToExternalMessageId,
            requestOwner,
            sender,
            senderName: event.pushName,
            sentAt: toMessageSentAt(event.timestamp),
            text: event.text.trim(),
            via: 'mention',
          })
          return 'admitted'
        }
        return decision.reason
      }

      await dependencies.handle({
        companyId,
        driverId: owner.driverId,
        groupJid,
        providerMessageId: event.externalMessageId,
        replyToProviderMessageId: event.replyToExternalMessageId,
        requestOwner,
        sender: decision.sender,
        senderName: event.pushName,
        sentAt: toMessageSentAt(event.timestamp),
        text: decision.text,
        via: decision.via,
      })
      return 'admitted'
    },
  }
  // Uma resposta por turno é uma mensagem: tudo o que o bot diz a esta mensagem sai junto quando ela acaba.
  const { turnReplies } = dependencies
  return turnReplies === undefined
    ? inbound
    : { receive: (input) => turnReplies.withinTurn(() => inbound.receive(input)) }
}

/** Liga o "pergunta nova do pedido" ao áudio: a confirmação pendente de antes sai de cena. */
export function createGroupQuestionAskedHandler(
  bot: Pick<WhatsAppBotAudio<GroupAudioContext>, 'supersede'>,
): GroupQuestionAsked {
  return ({ companyId, groupJid, owner }) => {
    bot.supersede({ companyId, conversation: groupConversation(groupJid), owner })
  }
}

function groupConversation(groupJid: string): string {
  return `group:${groupJid}`
}

function lidDigits(jids: readonly string[]): string[] {
  return jids.flatMap((jid) => {
    const parsed = parseJid(jid)
    return parsed?.server === 'lid' ? [parsed.digits] : []
  })
}

/**
 * O `@lid` de quem escreveu, por id de mensagem, lido do corpo cru de `messages.upsert`. O SDK 0.3.0
 * devolve `participant` vazio quando o grupo só manda o `@lid`; sem ele não há como traduzir para o
 * número. Lê `key.participant`, `key.participantLid`, `key.participantAlt` e `participant` do item.
 */
export function readGroupSenderLids(payload: unknown): ReadonlyMap<string, string> {
  const result = new Map<string, string>()
  if (!isRecord(payload)) return result
  const items: unknown[] = Array.isArray(payload.data) ? payload.data : [payload.data]
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.key)) continue
    const key = item.key
    const id = key.id
    if (typeof id !== 'string') continue
    for (const candidate of [
      key.participant,
      key.participantLid,
      key.participantAlt,
      item.participant,
    ]) {
      const parsed = parseJid(candidate)
      if (parsed?.server === 'lid') {
        result.set(id, parsed.digits)
        break
      }
    }
  }
  return result
}

/**
 * Spec 292 T9: o áudio de voz (`audioMessage`) de cada mensagem, por id, lido do corpo cru de
 * `messages.upsert`, com os segundos e quem escreveu a mensagem citada (para saber se responde ao bot).
 */
export function readGroupAudio(payload: unknown): ReadonlyMap<string, GroupAudio> {
  const result = new Map<string, GroupAudio>()
  if (!isRecord(payload)) return result
  const items: unknown[] = Array.isArray(payload.data) ? payload.data : [payload.data]
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.key) || !isRecord(item.message)) continue
    const id = item.key.id
    const audio = item.message.audioMessage
    if (typeof id !== 'string' || !isRecord(audio)) continue
    const context = isRecord(audio.contextInfo)
      ? audio.contextInfo
      : isRecord(item.contextInfo)
        ? item.contextInfo
        : null
    const seconds = typeof audio.seconds === 'number' ? audio.seconds : Number(audio.seconds)
    result.set(id, {
      mimeType: typeof audio.mimetype === 'string' ? audio.mimetype : 'audio/ogg',
      quotedParticipant:
        context !== null && typeof context.participant === 'string' ? context.participant : null,
      rawMessage: { key: item.key, message: item.message },
      seconds: Number.isFinite(seconds) ? seconds : null,
    })
  }
  return result
}

/**
 * Spec 293 T15: a foto (`imageMessage`) e a localização (`locationMessage`/`liveLocationMessage`) de
 * cada mensagem, por id, lidas do corpo cru de `messages.upsert`. O que não é foto nem localização
 * fica de fora (vídeo, áudio, documento seguem ignorados).
 */
export function readGroupMedia(payload: unknown): ReadonlyMap<string, GroupMedia> {
  const result = new Map<string, GroupMedia>()
  if (!isRecord(payload)) return result
  const items: unknown[] = Array.isArray(payload.data) ? payload.data : [payload.data]
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.key) || !isRecord(item.message)) continue
    const id = item.key.id
    if (typeof id !== 'string') continue
    const { message } = item
    const image = message.imageMessage
    if (isRecord(image)) {
      result.set(id, {
        caption: typeof image.caption === 'string' ? image.caption : null,
        kind: 'image',
        mimeType: typeof image.mimetype === 'string' ? image.mimetype : 'image/jpeg',
        rawMessage: { key: item.key, message: item.message },
      })
      continue
    }
    const location = isRecord(message.locationMessage)
      ? message.locationMessage
      : isRecord(message.liveLocationMessage)
        ? message.liveLocationMessage
        : null
    if (location === null) continue
    const latitude = location.degreesLatitude
    const longitude = location.degreesLongitude
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      result.set(id, { kind: 'location', latitude, longitude })
    }
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** A nota falada na confirmação, quando a porta existe (`exactOptionalPropertyTypes`). */
function notesOf(ports: EvolutionGroupAudioPorts, companyId: string, driverId: string) {
  const describe = ports.describeNotes
  return describe === undefined
    ? {}
    : { details: (text: string) => describe({ companyId, driverId, text }) }
}
