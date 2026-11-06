/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * **Uma resposta do bot por turno é UMA mensagem do WhatsApp**, no grupo (Evolution) e na conversa individual (Meta).
 * Defeito de staging (#555/#559): a resposta saía em várias mensagens e o espaçador de envio do Evolution segurava cada
 * seguinte — a pergunta chegava depois de o motorista já ter respondido, e a resposta dele virava "não entendi".
 *
 * O turno é a mensagem recebida: tudo o que o bot diz enquanto a trata fica guardado por destinatário e sai numa
 * mensagem só, os textos unidos por linha em branco, quando o turno acaba. O que é separado por natureza (lista/botões
 * interativos, mídia) sai na hora, depois da fala já guardada. O que o bot diz depois do turno (a transcrição do áudio)
 * sai sozinho, na hora: o turno já fechou.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'

/** A linha em branco entre as falas que viram uma mensagem. */
export const WHATSAPP_TURN_SEPARATOR = '\n\n'

type Pending = { readonly deliver: (body: string) => Promise<unknown>; readonly texts: string[] }
type Turn = { open: boolean; readonly pending: Map<string, Pending> }

export type WhatsAppTurnReplies = {
  /** Trata uma mensagem recebida: as falas do turno saem no fim, uma mensagem por destinatário (mesmo se falhar). */
  withinTurn<T>(work: () => Promise<T>): Promise<T>
  /** Dentro de um turno, guarda a fala; fora dele (ou com o turno já fechado), entrega na hora. */
  send(input: {
    readonly body: string
    readonly deliver: (body: string) => Promise<unknown>
    readonly key: string
  }): Promise<void>
  /** Entrega já o que o turno guardou para o destinatário (antes de uma lista interativa ou mídia). */
  flush(key: string): Promise<void>
}

/** Um armazenamento só: o trabalho de fundo sai de qualquer turno com `runOutsideWhatsAppTurn`. */
const storage = new AsyncLocalStorage<Turn>()

/**
 * O trabalho que segue depois do turno (a transcrição do áudio): o que ele disser sai na hora, sozinho, em vez de
 * entrar na mensagem do turno — determinístico, seja qual for a velocidade da transcrição.
 */
export function runOutsideWhatsAppTurn<T>(work: () => T): T {
  return storage.exit(work)
}

export function createWhatsAppTurnReplies(): WhatsAppTurnReplies {
  /** Os turnos em andamento: a fala de fora do turno nunca passa na frente do que o turno já disse ao mesmo destino. */
  const openTurns = new Set<Turn>()

  async function deliverPending(turn: Turn, key: string): Promise<void> {
    const pending = turn.pending.get(key)
    if (pending === undefined) return
    turn.pending.delete(key)
    await pending.deliver(pending.texts.join(WHATSAPP_TURN_SEPARATOR))
  }

  return {
    async withinTurn(work) {
      const turn: Turn = { open: true, pending: new Map() }
      openTurns.add(turn)
      try {
        return await storage.run(turn, work)
      } finally {
        turn.open = false
        openTurns.delete(turn)
        for (const key of [...turn.pending.keys()]) await deliverPending(turn, key)
      }
    },

    async send({ body, deliver, key }) {
      const turn = storage.getStore()
      if (turn === undefined || !turn.open) {
        for (const other of openTurns) await deliverPending(other, key)
        await deliver(body)
        return
      }
      const pending = turn.pending.get(key)
      if (pending === undefined) turn.pending.set(key, { deliver, texts: [body] })
      else pending.texts.push(body)
    },

    async flush(key) {
      const turn = storage.getStore()
      if (turn !== undefined) await deliverPending(turn, key)
    },
  }
}

/**
 * O canal da Meta com a fala do turno guardada: o texto espera o fim do turno; lista e botões interativos saem na hora,
 * logo depois da fala que veio antes deles.
 */
export function bufferWhatsAppChannel(
  channel: ChannelAdapterInterface,
  turns: WhatsAppTurnReplies,
): ChannelAdapterInterface {
  return new Proxy(channel, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      if (property === 'sendText') {
        return async (to: string, body: string) => {
          await turns.send({ body, deliver: (joined) => channel.sendText(to, joined), key: to })
          return { externalMessageId: null }
        }
      }
      if (typeof property === 'string' && property.startsWith('send')) {
        return async (...args: unknown[]) => {
          await turns.flush(recipientOf(args))
          return (value as (...input: unknown[]) => unknown).apply(target, args)
        }
      }
      return (value as (...input: unknown[]) => unknown).bind(target)
    },
  })
}

/** O destinatário de um envio do canal: `to` no objeto de entrada, ou o primeiro argumento de texto. */
function recipientOf(args: readonly unknown[]): string {
  const [first] = args
  if (typeof first === 'string') return first
  if (typeof first === 'object' && first !== null && 'to' in first) {
    const to = (first as { readonly to: unknown }).to
    if (typeof to === 'string') return to
  }
  return ''
}
