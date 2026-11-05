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
  DRIVER_PROMPT_MAX_ATTEMPTS,
  readDriverPrompt,
  withoutDriverPrompt,
  type DriverPrompt,
} from '../domain/whatsapp-driver-prompt.policy.js'
import {
  canAskRouteOffer,
  describeRouteOffer,
  LOCATION_PROMPT_TEXT,
  ROUTE_OFFER_TEXT,
  type RouteOfferGate,
} from '../domain/whatsapp-driver-route-offer.policy.js'
import { interpretWhatsAppDriverEventCommand } from '../domain/whatsapp-driver-event-command.policy.js'
import {
  describeOutOfOrderViolation,
  OUT_OF_ORDER_TEXT,
  toOrderStopLabel,
  type OrderStopLabel,
} from '../domain/whatsapp-driver-order.policy.js'
import type { WhatsAppStopCandidate } from '../../trips/domain/driver-stop-resolution.policy.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { WhatsAppSharedLocationStore } from './whatsapp-shared-location.service.js'
import type { WhatsAppRouteContinuation } from './whatsapp-delivery-preparation.service.js'
import type { WhatsAppBotSpeechPort } from './whatsapp-bot-speech.service.js'
import { renderBotSpeechLine } from './whatsapp-bot-speech.service.js'
import { describeWhatsAppDriverEventResult } from './whatsapp-driver-event-speech.service.js'
import {
  arriveWhatsAppDriverStop,
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

type PromptTurn = {
  readonly actor: WhatsAppDriverActor
  readonly context: Record<string, unknown>
  readonly whatsappNumber: string
}

export type WhatsAppDriverPrompts = {
  /** A mensagem de texto responde ao pedido em aberto? `null` quando não há pedido. */
  answer(input: PromptTurn & { readonly text: string }): Promise<null | WhatsAppDriverPromptResult>
  /** A localização compartilhada responde ao pedido de localização em aberto? `null` quando não há. */
  answerLocation(
    input: PromptTurn & { readonly location: ReportedLocation },
  ): Promise<null | WhatsAppDriverPromptResult>
  /** Spec 294 RF24: o pedido de localização do "saí"/"cheguei", ou `null` se um ponto recente já vale. */
  askLocation(input: {
    readonly companyId: string
    readonly documentNumber?: string | undefined
    readonly event: 'arrive' | 'depart'
    /** Spec 294 RF14: parada sem localização certa; o "cheguei" diz que o ponto corrige o endereço. */
    readonly isAddressReliable?: boolean | undefined
    readonly stopId: string
    readonly whatsappNumber: string
  }): null | RouteOfferReply
  /** O pedido em aberto desta conversa, se houver e não tiver vencido. */
  pending(context: Record<string, unknown>): DriverPrompt | undefined
  /**
   * Spec 294 RF25: registra a saída/chegada; se a API recusar por fora de ordem, devolve a pergunta 1/2 e o pedido
   * (o contexto novo da sessão) em vez do erro.
   */
  recordStop(input: {
    readonly actor: WhatsAppDriverActor
    readonly context: Record<string, unknown>
    readonly documentNumber?: string | undefined
    readonly event: 'arrive' | 'depart'
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
    readonly stopId: string
  }): Promise<WhatsAppDriverPromptResult>
}

export function createWhatsAppDriverPrompts(dependencies: {
  readonly clock: () => Date
  /** As paradas da viagem do motorista, para a pergunta citar nota e cliente; ausente, só a sequência. */
  readonly listStops?: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly WhatsAppStopCandidate[]>
  readonly ports: Pick<WhatsAppDriverEventPorts, 'reportArrival' | 'reportDeparture'>
  /** Ausente, o bot não pede localização (como antes da 294). */
  readonly sharedLocations?: Pick<WhatsAppSharedLocationStore, 'consume' | 'has'>
  readonly speech: WhatsAppBotSpeechPort
}): WhatsAppDriverPrompts {
  const { clock, ports, sharedLocations, speech } = dependencies

  const keyOf = (companyId: string, whatsappNumber: string) => ({ companyId, whatsappNumber })

  function locationPrompt(input: {
    readonly documentNumber?: string | undefined
    readonly event: 'arrive' | 'depart'
    readonly isAddressReliable?: boolean | undefined
    readonly stopId: string
  }): RouteOfferReply {
    const isUnreliable = input.event === 'arrive' && input.isAddressReliable === false
    return {
      prompt: {
        attempts: 0,
        documentNumber: input.documentNumber,
        event: input.event,
        kind: DRIVER_PROMPT_KIND.location,
        offeredAt: clock().toISOString(),
        stopId: input.stopId,
      },
      texts: [isUnreliable ? LOCATION_PROMPT_TEXT.askUnreliableAddress : LOCATION_PROMPT_TEXT.ask],
    }
  }

  /** Só pergunta quando não há ponto recente: o compartilhado há pouco vale sem perguntar de novo. */
  function askLocation(input: {
    readonly companyId: string
    readonly documentNumber?: string | undefined
    readonly event: 'arrive' | 'depart'
    readonly isAddressReliable?: boolean | undefined
    readonly stopId: string
    readonly whatsappNumber: string
  }): null | RouteOfferReply {
    if (sharedLocations === undefined) return null
    if (sharedLocations.has(keyOf(input.companyId, input.whatsappNumber))) return null
    return locationPrompt(input)
  }

  async function labelsOf(
    actor: WhatsAppDriverActor,
  ): Promise<ReadonlyMap<string, OrderStopLabel>> {
    const stops = (await dependencies.listStops?.(actor)) ?? []
    return new Map(stops.map((stop) => [stop.id, toOrderStopLabel(stop)] as const))
  }

  async function recordStop(input: {
    readonly actor: WhatsAppDriverActor
    readonly context: Record<string, unknown>
    readonly confirmOutOfOrder?: boolean
    readonly documentNumber?: string | undefined
    readonly event: 'arrive' | 'depart'
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
    readonly stopId: string
  }): Promise<WhatsAppDriverPromptResult> {
    const stopInput = {
      ...input.actor,
      ...(input.confirmOutOfOrder === true ? { confirmOutOfOrder: true } : {}),
      idempotencyKey: input.idempotencyKey,
      location: input.location,
      sentAt: clock(),
      stopId: input.stopId,
    }
    const result =
      input.event === 'depart'
        ? await departWhatsAppDriverStop(ports, stopInput)
        : await arriveWhatsAppDriverStop(ports, stopInput)
    const cleared = withoutDriverPrompt(input.context)
    if (result.kind === 'refused' && result.refusal.code === 'stop_out_of_order') {
      const question = describeOutOfOrderViolation({
        event: input.event,
        labels: await labelsOf(input.actor),
        violation: result.refusal,
      })
      const prompt: DriverPrompt = {
        documentNumber: input.documentNumber,
        event: input.event,
        kind: DRIVER_PROMPT_KIND.outOfOrder,
        nextStopId: result.refusal.nextStopId ?? undefined,
        offeredAt: clock().toISOString(),
        stopId: result.refusal.requestedStopId,
      }
      return {
        context: { ...cleared, [DRIVER_PROMPT_CONTEXT_KEY]: prompt },
        handled: true,
        texts: [question],
      }
    }
    const line = describeWhatsAppDriverEventResult(result, {
      ...(input.documentNumber === undefined ? {} : { documentNumber: input.documentNumber }),
      kind: 'driver',
    })
    return {
      context: cleared,
      handled: true,
      texts: [await renderBotSpeechLine({ companyId: input.actor.companyId, line, speech })],
    }
  }

  const promptKey = (prompt: DriverPrompt) =>
    `whatsapp-stop-prompt:${prompt.stopId}:${prompt.offeredAt}`

  async function answerLocationPrompt(
    turn: PromptTurn,
    prompt: Extract<DriverPrompt, { kind: 'location' }>,
    answer: { readonly location: ReportedLocation | null },
  ): Promise<WhatsAppDriverPromptResult> {
    return recordStop({
      actor: turn.actor,
      context: turn.context,
      documentNumber: prompt.documentNumber,
      event: prompt.event,
      idempotencyKey: `${promptKey(prompt)}:${prompt.event}`,
      location: answer.location,
      stopId: prompt.stopId,
    })
  }

  /** "1" confirma fora da ordem (a mesma chave, agora com a confirmação); "2" descarta, ou na saída vai à próxima. */
  async function answerOutOfOrder(
    turn: PromptTurn & { readonly text: string },
    prompt: Extract<DriverPrompt, { kind: 'out_of_order' }>,
  ): Promise<WhatsAppDriverPromptResult> {
    const cleared = withoutDriverPrompt(turn.context)
    const choice = interpretDriverChoice(turn.text)
    if (choice === DRIVER_CHOICE.first) {
      return recordStop({
        actor: turn.actor,
        confirmOutOfOrder: true,
        context: turn.context,
        documentNumber: prompt.documentNumber,
        event: prompt.event,
        idempotencyKey: `${promptKey(prompt)}:confirmed`,
        location:
          sharedLocations?.consume(keyOf(turn.actor.companyId, turn.whatsappNumber)) ?? null,
        stopId: prompt.stopId,
      })
    }
    if (
      choice === DRIVER_CHOICE.second &&
      prompt.event === 'depart' &&
      prompt.nextStopId !== undefined
    ) {
      return recordStop({
        actor: turn.actor,
        context: turn.context,
        event: 'depart',
        idempotencyKey: `${promptKey(prompt)}:next`,
        location:
          sharedLocations?.consume(keyOf(turn.actor.companyId, turn.whatsappNumber)) ?? null,
        stopId: prompt.nextStopId,
      })
    }
    if (choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
      return { context: cleared, handled: true, texts: [OUT_OF_ORDER_TEXT.discarded] }
    }
    return { context: cleared, handled: false, texts: [] }
  }

  return {
    askLocation,
    recordStop,

    async answer(turn) {
      const prompt = readDriverPrompt(turn.context, clock())
      if (prompt === undefined) return null
      const cleared = withoutDriverPrompt(turn.context)
      const choice = interpretDriverChoice(turn.text)

      if (prompt.kind === DRIVER_PROMPT_KIND.outOfOrder) return answerOutOfOrder(turn, prompt)

      if (prompt.kind === DRIVER_PROMPT_KIND.location) {
        if (choice === DRIVER_CHOICE.skip || choice === DRIVER_CHOICE.second) {
          return answerLocationPrompt(turn, prompt, { location: null })
        }
        // Outro comando ("saí", "entreguei 17234"): o pedido sai de cena e o comando segue.
        if (interpretWhatsAppDriverEventCommand(turn.text) !== undefined) {
          return { context: cleared, handled: false, texts: [] }
        }
        const attempts = prompt.attempts + 1
        if (attempts >= DRIVER_PROMPT_MAX_ATTEMPTS) {
          return { context: cleared, handled: true, texts: [LOCATION_PROMPT_TEXT.gaveUp] }
        }
        return {
          context: { ...cleared, [DRIVER_PROMPT_CONTEXT_KEY]: { ...prompt, attempts } },
          handled: true,
          texts: [LOCATION_PROMPT_TEXT.askAgain],
        }
      }

      if (choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
        return { context: cleared, handled: true, texts: [ROUTE_OFFER_TEXT.declined] }
      }
      // Outra coisa: o pedido sai de cena e a mensagem segue o fluxo de sempre.
      if (choice !== DRIVER_CHOICE.first) return { context: cleared, handled: false, texts: [] }
      const ask = askLocation({
        companyId: turn.actor.companyId,
        documentNumber: prompt.documentNumber,
        event: 'depart',
        stopId: prompt.stopId,
        whatsappNumber: turn.whatsappNumber,
      })
      if (ask?.prompt !== undefined) {
        return {
          context: { ...cleared, [DRIVER_PROMPT_CONTEXT_KEY]: ask.prompt },
          handled: true,
          texts: ask.texts,
        }
      }
      return recordStop({
        actor: turn.actor,
        context: turn.context,
        documentNumber: prompt.documentNumber,
        event: 'depart',
        idempotencyKey: `whatsapp-route-offer:${prompt.stopId}:${prompt.offeredAt}`,
        location:
          sharedLocations?.consume(keyOf(turn.actor.companyId, turn.whatsappNumber)) ?? null,
        stopId: prompt.stopId,
      })
    },

    async answerLocation(turn) {
      const prompt = readDriverPrompt(turn.context, clock())
      if (prompt?.kind !== DRIVER_PROMPT_KIND.location) return null
      return answerLocationPrompt(turn, prompt, { location: turn.location })
    },

    pending: (context) => readDriverPrompt(context, clock()),
  }
}

export { DRIVER_PROMPT_CONTEXT_KEY }
