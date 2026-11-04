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

import {
  decideGroupMessage,
  type GroupMessageIgnoredReason,
  parseJid,
} from '../domain/evolution-group-message.policy.js'
import type {
  EvolutionGroupIdentity,
  LazyEvolutionConnection,
} from './evolution-group-identity.service.js'

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
}

/**
 * Spec 293 T15: a foto ou a localização que chegou ao grupo, lida do corpo cru (o SDK 0.3.0 só lê
 * texto). A foto ainda não foi baixada: quem trata pede ao Evolution pelo id da mensagem.
 */
export type GroupMedia =
  | { readonly caption: null | string; readonly kind: 'image'; readonly mimeType: string }
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

export type EvolutionGroupInboundPorts = {
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
  /** Spec 293 T15: quem escreveu (só dígitos) é o motorista dono do grupo? */
  isGroupDriver?: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly sender: string
  }) => Promise<boolean>
}

export type EvolutionGroupInboundOutcome =
  | 'admitted'
  | 'media'
  | 'not_driver'
  | GroupMessageIgnoredReason

export type EvolutionGroupInbound = {
  receive(input: {
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

  return {
    async receive({ companyId, connection, event, media = null, senderLid }) {
      if (event.fromMe) return 'from_me'
      const groupJid = event.groupJid
      if (groupJid === null) return 'unknown_group'
      const owner = await dependencies.findGroupDriver({ companyId, groupJid })
      if (owner === null) return 'unknown_group'
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
      if (!decision.admitted) return decision.reason

      await dependencies.handle({
        companyId,
        driverId: owner.driverId,
        groupJid,
        providerMessageId: event.externalMessageId,
        replyToProviderMessageId: event.replyToExternalMessageId,
        requestOwner,
        sender: decision.sender,
        senderName: event.pushName,
        text: decision.text,
        via: decision.via,
      })
      return 'admitted'
    },
  }
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
