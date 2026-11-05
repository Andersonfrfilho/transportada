/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF8–RF10, RNF1: **a oferta da próxima rota na conversa individual.** A baixa que fecha a parada
 * oferece a próxima ("1 - Sim, iniciar rota / 2 - Agora não") ou, se a viagem acabou, diz que a rota fechou.
 * A pergunta só abre quando nada mais espera resposta deste motorista (`canAskRouteOffer`); senão a frase sai
 * sem pergunta. "1" registra a saída pela MESMA função do "saí" (`departWhatsAppDriverStop`), com chave de
 * idempotência da oferta.
 */
import { DRIVER_CHOICE, interpretDriverChoice } from '../domain/whatsapp-driver-choice.policy.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  DRIVER_PROMPT_KIND,
  readDriverPrompt,
  withoutDriverPrompt,
  type DriverPrompt,
} from '../domain/whatsapp-driver-prompt.policy.js'
import {
  canAskRouteOffer,
  describeRouteOffer,
  ROUTE_OFFER_TEXT,
  type RouteOfferGate,
} from '../domain/whatsapp-driver-route-offer.policy.js'
import type { WhatsAppRouteContinuation } from './whatsapp-delivery-preparation.service.js'
import type { WhatsAppBotSpeechPort } from './whatsapp-bot-speech.service.js'
import { renderBotSpeechLine } from './whatsapp-bot-speech.service.js'
import { describeWhatsAppDriverEventResult } from './whatsapp-driver-event-speech.service.js'
import {
  departWhatsAppDriverStop,
  type WhatsAppDriverActor,
  type WhatsAppDriverEventPorts,
} from './whatsapp-driver-events.service.js'

export type RouteOfferReply = {
  readonly prompt: DriverPrompt | undefined
  readonly texts: readonly string[]
}

/** O que a baixa que fechou a parada diz em seguida; o pedido só nasce com a pergunta aberta. */
export function buildRouteOfferReply(input: {
  readonly continuation: WhatsAppRouteContinuation
  readonly gate: RouteOfferGate
  readonly now: Date
}): RouteOfferReply {
  const { continuation, gate, now } = input
  if (continuation.tripCompleted) {
    return { prompt: undefined, texts: [ROUTE_OFFER_TEXT.routeCompleted] }
  }
  const { nextStop } = continuation
  if (nextStop === null) return { prompt: undefined, texts: [] }
  const asks = canAskRouteOffer(gate)
  return {
    prompt: asks
      ? {
          documentNumber: nextStop.documents[0]?.number,
          kind: DRIVER_PROMPT_KIND.routeOffer,
          offeredAt: now.toISOString(),
          stopId: nextStop.id,
        }
      : undefined,
    texts: [describeRouteOffer(nextStop, { asks })],
  }
}

export type WhatsAppDriverPromptResult = {
  /** O contexto da sessão depois do turno (o pedido some ou segue). */
  readonly context: Record<string, unknown>
  /** `false`: a mensagem não era a resposta; o pedido saiu de cena e ela segue o fluxo de sempre. */
  readonly handled: boolean
  readonly texts: readonly string[]
}

export type WhatsAppDriverPrompts = {
  /** A mensagem responde ao pedido em aberto desta conversa? `null` quando não há, ou o texto não é para ele. */
  answer(input: {
    readonly actor: WhatsAppDriverActor
    readonly context: Record<string, unknown>
    readonly text: string
  }): Promise<null | WhatsAppDriverPromptResult>
  /** O pedido em aberto desta conversa, se houver e não tiver vencido. */
  pending(context: Record<string, unknown>): DriverPrompt | undefined
}

export function createWhatsAppDriverPrompts(dependencies: {
  readonly clock: () => Date
  readonly ports: Pick<WhatsAppDriverEventPorts, 'reportDeparture'>
  readonly speech: WhatsAppBotSpeechPort
}): WhatsAppDriverPrompts {
  const { clock, ports, speech } = dependencies

  return {
    async answer({ actor, context, text }) {
      const prompt = readDriverPrompt(context, clock())
      if (prompt === undefined) return null
      const cleared = withoutDriverPrompt(context)
      const choice = interpretDriverChoice(text)
      if (choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
        return { context: cleared, handled: true, texts: [ROUTE_OFFER_TEXT.declined] }
      }
      // Outra coisa: o pedido sai de cena e a mensagem segue o fluxo de sempre.
      if (choice !== DRIVER_CHOICE.first) return { context: cleared, handled: false, texts: [] }
      const result = await departWhatsAppDriverStop(ports, {
        ...actor,
        idempotencyKey: `whatsapp-route-offer:${prompt.stopId}:${prompt.offeredAt}`,
        location: null,
        sentAt: clock(),
        stopId: prompt.stopId,
      })
      const line = describeWhatsAppDriverEventResult(result, {
        ...(prompt.documentNumber === undefined ? {} : { documentNumber: prompt.documentNumber }),
        kind: 'driver',
      })
      return {
        context: cleared,
        handled: true,
        texts: [await renderBotSpeechLine({ companyId: actor.companyId, line, speech })],
      }
    },
    pending: (context) => readDriverPrompt(context, clock()),
  }
}

export { DRIVER_PROMPT_CONTEXT_KEY }
