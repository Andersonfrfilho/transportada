/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF8–RF10, RNF1: **a oferta da próxima rota na conversa individual.** A baixa que fecha a parada
 * oferece a próxima ("1 - Sim, iniciar rota / 2 - Agora não") ou, se a viagem acabou, diz que a rota fechou.
 * A pergunta só abre quando nada mais espera resposta deste motorista (`canAskRouteOffer`); senão a frase sai
 * sem pergunta. "1" registra a saída pela MESMA função do "saí" (`departWhatsAppDriverStop`), com chave de
 * idempotência da oferta.
 */
import {
  DRIVER_CHOICE,
  interpretDriverChoice,
  isDriverCancelText,
  isDriverEscapeText,
} from '../domain/whatsapp-driver-choice.policy.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  DRIVER_PROMPT_KIND,
  DRIVER_PROMPT_MAX_ATTEMPTS,
  DRIVER_PROMPT_TEXT,
  readDriverPrompt,
  withoutDriverPrompt,
  type DriverPrompt,
} from '../domain/whatsapp-driver-prompt.policy.js'
import { canAskRouteOffer, type RouteOfferGate } from '../domain/driver-open-question.policy.js'
import {
  describeLocationPrompt,
  describeRouteOffer,
  LOCATION_PROMPT_TEXT,
  ROUTE_OFFER_TEXT,
} from '../domain/whatsapp-driver-route-offer.policy.js'
import { interpretWhatsAppDriverEventCommand } from '../domain/whatsapp-driver-event-command.policy.js'
import {
  describeOutOfOrderNotUnderstood,
  describeOutOfOrderViolation,
  OUT_OF_ORDER_TEXT,
  toOrderStopLabel,
  type OrderStopLabel,
} from '../domain/whatsapp-driver-order.policy.js'
import {
  findNextPendingStop,
  findStopAwaitingSettlement,
  findStopEnRoute,
  resolveDepartureStop,
  type WhatsAppStopCandidate,
} from '../../trips/domain/driver-stop-resolution.policy.js'
import {
  arrivedStopActions,
  cardFromRouteOfferStop,
  cardFromStopCandidate,
  describeAlreadyArrived,
  describeAlreadyDeparted,
  describeAlreadySettled,
  describeArrivalReply,
  describeDepartureReply,
  describeJourneyNotUnderstood,
  describeNextRouteOffer,
  describePendingSettlement,
  describeRouteCompleted,
  enRouteStopActions,
  JOURNEY_ACTION,
  JOURNEY_TEXT,
  nextRouteActions,
  pendingSettlementActions,
  pickJourneyAction,
  type JourneyAction,
  type StopCardView,
} from '../domain/whatsapp-driver-journey.policy.js'
import {
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
} from '../domain/whatsapp-driver-flow.constant.js'
import {
  describeStopListNotUnderstood,
  formatStopList,
  pickStopFromList,
  STOP_LIST_TEXT,
  type StopListTravelView,
} from '../domain/whatsapp-stop-list.policy.js'
import type { WhatsAppRouteClosingReader } from '../infrastructure/whatsapp-route-closing.reader.js'
import type { WhatsAppStopCardReader } from '../infrastructure/whatsapp-stop-card.reader.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { WhatsAppSharedLocationStore } from './whatsapp-shared-location.service.js'
import type { WhatsAppRouteContinuation } from './whatsapp-delivery-preparation.service.js'
import type { WhatsAppBotSpeechPort } from './whatsapp-bot-speech.service.js'
import { renderBotSpeechLine } from './whatsapp-bot-speech.service.js'
import { formatBotClock } from '../domain/whatsapp-stop-card.policy.js'
import { describeWhatsAppDriverEventResult } from './whatsapp-driver-event-speech.service.js'
import {
  arriveWhatsAppDriverStop,
  departWhatsAppDriverStop,
  type WhatsAppDriverActor,
  type WhatsAppDriverEventPorts,
} from './whatsapp-driver-events.service.js'
import {
  readWhatsAppStopInProgress,
  type WhatsAppStopInProgress,
} from './whatsapp-stop-in-progress.service.js'

export type RouteOfferReply = {
  readonly prompt: DriverPrompt | undefined
  readonly texts: readonly string[]
}

/** O que a baixa que fechou a parada diz em seguida; o pedido só nasce com a pergunta aberta. */
export function buildRouteOfferReply(input: {
  /** Spec 300 RF12: o que a despedida de "rota concluída" diz; ausente, a frase sai sem o número e o nome. */
  readonly closing?: { readonly driverName: string; readonly totalStops: number } | null | undefined
  readonly continuation: WhatsAppRouteContinuation
  readonly gate: RouteOfferGate
  readonly now: Date
}): RouteOfferReply {
  const { closing, continuation, gate, now } = input
  if (continuation.tripCompleted) {
    return {
      prompt: undefined,
      texts: [
        describeRouteCompleted({
          driverName: closing?.driverName,
          totalStops: closing?.totalStops,
        }),
      ],
    }
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
  /**
   * Spec 294: a opção do menu é um passo que já existe em outro nó do fluxo (a lista de tipos de ocorrência da nota):
   * o despachante continua o fluxo a partir dele.
   */
  readonly flowJump?: { readonly context: Record<string, unknown>; readonly nodeId: string }
  /**
   * A opção do menu é um comando que já existe ("entreguei 17234", "não entreguei 17234", "cheguei"): o despachante
   * segue com este texto no lugar da mensagem, pelo caminho de sempre.
   */
  readonly followUpText?: string
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
   * O evento repetido ("cheguei" numa parada que já chegou, "saí" com uma parada a caminho) ou o "saí" com a baixa
   * pendente: o aviso com o bloco da parada e o menu das ações. `null`: segue a resolução de sempre.
   */
  repeatedEvent(input: {
    readonly actor: WhatsAppDriverActor
    readonly event: 'arrive' | 'depart'
  }): Promise<null | RouteOfferReply>
  /** "entreguei 17234" numa nota já baixada: quando foi e o que cabe agora; `null` se a nota não está baixada. */
  settledDocument(input: {
    readonly actor: WhatsAppDriverActor
    readonly documentNumber: string
  }): Promise<null | RouteOfferReply>
  /** A parada em andamento (chegou e falta a baixa, ou a caminho), que o "entreguei" sem número continua. */
  stopInProgress(input: {
    readonly actor: { readonly companyId: string; readonly driverId: string }
  }): Promise<null | WhatsAppStopInProgress>
  /** A oferta da próxima rota com o bloco da parada (spec 294 RF8–RF10). */
  routeOffer(input: {
    readonly actor: WhatsAppDriverActor
    readonly continuation: WhatsAppRouteContinuation
    readonly gate: RouteOfferGate
  }): Promise<RouteOfferReply>
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
  /** Spec 300 RF12: número de paradas e nome do motorista da despedida de "rota concluída". */
  readonly routeClosing?: WhatsAppRouteClosingReader
  readonly speech: WhatsAppBotSpeechPort
  /** Só empresa e nome do erro (o bloco da parada que não leu). */
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  /** O bloco da parada nas respostas; ausente, só a frase do registro e o que a lista de paradas traz. */
  readonly stopCards?: Pick<WhatsAppStopCardReader, 'read'>
  /** Spec 300 RF4: distância e tempo da lista de paradas; ausente, ou `null`, a lista sai sem a linha. */
  readonly stopListTravel?: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly stops: readonly WhatsAppStopCandidate[]
  }) => Promise<StopListTravelView | null>
}): WhatsAppDriverPrompts {
  const { clock, ports, sharedLocations, speech } = dependencies

  /** O bloco é melhor esforço: o registro já foi feito, a resposta nunca falha por causa dele. */
  async function safeRead(
    input: Parameters<WhatsAppStopCardReader['read']>[0],
  ): Promise<StopCardView | null> {
    try {
      return (await dependencies.stopCards?.read(input)) ?? null
    } catch (error) {
      dependencies.logger?.warn('whatsapp_driver_prompt.stop_card_failed', {
        companyId: input.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      return null
    }
  }

  /** RF12: a despedida da rota concluída, com o número de paradas e o primeiro nome do motorista da viagem. */
  async function routeCompletedText(actor: WhatsAppDriverActor): Promise<string> {
    const closing = await dependencies.routeClosing?.(actor)
    return describeRouteCompleted({
      driverName: closing?.driverName,
      totalStops: closing?.totalStops,
    })
  }

  const listStopsOf = async (actor: WhatsAppDriverActor) =>
    (await dependencies.listStops?.(actor)) ?? []

  async function viewOf(
    actor: WhatsAppDriverActor,
    stop: WhatsAppStopCandidate,
    withEta: boolean,
  ): Promise<StopCardView> {
    const read = await safeRead({
      companyId: actor.companyId,
      driverId: actor.driverId,
      stopId: stop.id,
      withEta,
    })
    return read ?? { card: cardFromStopCandidate(stop) }
  }

  /** A frase do `fala_stop_en_route` (editável no painel) que abre o menu de "já a caminho". */
  const enRouteHeadline = (actor: WhatsAppDriverActor, stop: WhatsAppStopCandidate) =>
    renderBotSpeechLine({
      companyId: actor.companyId,
      line: { key: 'stopEnRoute', params: { sequence: String(stop.sequence) } },
      speech,
    })

  const menuReply = (
    text: string,
    actions: readonly JourneyAction[],
    stopId: string,
  ): RouteOfferReply => ({
    prompt: {
      actions,
      kind: DRIVER_PROMPT_KIND.journeyActions,
      offeredAt: clock().toISOString(),
      stopId,
    },
    texts: [text],
  })

  async function repeatedEvent(input: {
    readonly actor: WhatsAppDriverActor
    readonly event: 'arrive' | 'depart'
  }): Promise<null | RouteOfferReply> {
    const stops = await listStopsOf(input.actor)
    const now = clock()
    const enRoute = findStopEnRoute(stops)
    if (input.event === 'depart' && enRoute !== undefined) {
      const view = await viewOf(input.actor, enRoute, true)
      return menuReply(
        describeAlreadyDeparted(view, await enRouteHeadline(input.actor, enRoute)),
        enRouteStopActions(view.card),
        enRoute.id,
      )
    }
    if (enRoute !== undefined) return null
    const awaiting = findStopAwaitingSettlement(stops)
    if (awaiting === undefined) return null
    const view = await viewOf(input.actor, awaiting, false)
    const arrivedAt = awaiting.arrivedAt ?? ''
    return input.event === 'arrive'
      ? menuReply(
          describeAlreadyArrived(view, { arrivedAt, now }),
          arrivedStopActions(view.card),
          awaiting.id,
        )
      : menuReply(
          describePendingSettlement(view, { arrivedAt, now }),
          pendingSettlementActions(view.card),
          awaiting.id,
        )
  }

  async function routeOffer(input: {
    readonly actor: WhatsAppDriverActor
    readonly continuation: WhatsAppRouteContinuation
    readonly gate: RouteOfferGate
  }): Promise<RouteOfferReply> {
    const { continuation } = input
    const nextStop = continuation.tripCompleted ? null : continuation.nextStop
    if (nextStop === null) {
      return buildRouteOfferReply({
        closing: continuation.tripCompleted ? await dependencies.routeClosing?.(input.actor) : null,
        continuation,
        gate: input.gate,
        now: clock(),
      })
    }
    const read = await safeRead({
      companyId: input.actor.companyId,
      driverId: input.actor.driverId,
      stopId: nextStop.id,
      withEta: true,
    })
    const view = read ?? { card: cardFromRouteOfferStop(nextStop) }
    const stop = { id: nextStop.id }
    const asks = canAskRouteOffer(input.gate)
    const text = describeNextRouteOffer(view, { asks })
    return asks
      ? menuReply(text, nextRouteActions(view.card), stop.id)
      : { prompt: undefined, texts: [text] }
  }

  async function settledDocument(input: {
    readonly actor: WhatsAppDriverActor
    readonly documentNumber: string
  }): Promise<null | RouteOfferReply> {
    const number = input.documentNumber.replace(/^0+/u, '')
    const stops = await listStopsOf(input.actor)
    const stop = stops.find((candidate) =>
      candidate.documents.some(
        (document) =>
          document.number.replace(/^0+/u, '') === number &&
          (document.separationStatus === 'delivered' || document.separationStatus === 'returned'),
      ),
    )
    const document = stop?.documents.find((item) => item.number.replace(/^0+/u, '') === number)
    if (stop === undefined || document === undefined) return null
    const now = clock()
    const headline = describeAlreadySettled({
      documentNumber: number,
      now,
      returned: document.separationStatus === 'returned',
      settledAt: document.deliveredAt ?? null,
    })
    if (findStopAwaitingSettlement([stop]) !== undefined) {
      const view = await viewOf(input.actor, stop, false)
      return menuReply(
        `${headline}\n${describeAlreadyArrived(view, { arrivedAt: stop.arrivedAt ?? '', now })}`,
        arrivedStopActions(view.card),
        stop.id,
      )
    }
    const next = findNextPendingStop(stops)
    if (next === undefined) {
      return {
        prompt: undefined,
        texts: [`${headline}\n${await routeCompletedText(input.actor)}`],
      }
    }
    const view = await viewOf(input.actor, next, true)
    return menuReply(
      `${headline}\n\n${describeNextRouteOffer(view, { asks: true })}`,
      nextRouteActions(view.card),
      next.id,
    )
  }

  /** A lista das paradas pendentes para escolher a saída (pedido `stop_choice`). */
  async function stopChoice(
    turn: PromptTurn,
    options: { readonly confirmOutOfOrder: boolean },
  ): Promise<WhatsAppDriverPromptResult> {
    const cleared = withoutDriverPrompt(turn.context)
    const stops = await listStopsOf(turn.actor)
    const enRoute = findStopEnRoute(stops)
    if (enRoute !== undefined) {
      const view = await viewOf(turn.actor, enRoute, true)
      const reply = menuReply(
        describeAlreadyDeparted(view, await enRouteHeadline(turn.actor, enRoute)),
        enRouteStopActions(view.card),
        enRoute.id,
      )
      return {
        context: { ...cleared, [DRIVER_PROMPT_CONTEXT_KEY]: reply.prompt },
        handled: true,
        texts: reply.texts,
      }
    }
    const resolution = resolveDepartureStop(stops)
    const pending =
      resolution.kind === 'choose'
        ? resolution.stops
        : resolution.kind === 'single'
          ? [resolution.stop]
          : []
    const [first] = pending
    if (first === undefined) {
      return {
        context: cleared,
        handled: true,
        texts: [await routeCompletedText(turn.actor)],
      }
    }
    const prompt: DriverPrompt = {
      confirmOutOfOrder: options.confirmOutOfOrder,
      kind: DRIVER_PROMPT_KIND.stopChoice,
      offeredAt: clock().toISOString(),
      stopId: first.id,
      stops: pending.map((stop) => ({
        id: stop.id,
        numbers: stop.documents.map((document) => document.number.replace(/^0+/u, '')),
        sequence: stop.sequence,
      })),
    }
    const travel = await dependencies.stopListTravel?.({ ...turn.actor, stops: pending })
    return {
      context: { ...cleared, [DRIVER_PROMPT_CONTEXT_KEY]: prompt },
      handled: true,
      texts: [
        formatStopList({
          stops: pending,
          title: STOP_LIST_TEXT.departTitle,
          totalStops: stops.length,
          travel: travel ?? undefined,
        }),
      ],
    }
  }

  const keyOf = (companyId: string, whatsappNumber: string) => ({ companyId, whatsappNumber })

  function locationPrompt(input: {
    readonly documentNumber?: string | undefined
    readonly event: 'arrive' | 'depart'
    readonly isAddressReliable?: boolean | undefined
    readonly stopId: string
  }): RouteOfferReply {
    return {
      prompt: {
        attempts: 0,
        documentNumber: input.documentNumber,
        event: input.event,
        kind: DRIVER_PROMPT_KIND.location,
        offeredAt: clock().toISOString(),
        stopId: input.stopId,
      },
      texts: [describeLocationPrompt(input)],
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

  /** Os rótulos das paradas da viagem; na saída a pergunta mostra distância e tempo das duas paradas (RF4). */
  async function labelsOf(
    actor: WhatsAppDriverActor,
    violation?: { readonly nextStopId: string | null; readonly requestedStopId: string },
  ): Promise<ReadonlyMap<string, OrderStopLabel>> {
    const stops = await listStopsOf(actor)
    const asked = stops.filter(
      (stop) => stop.id === violation?.requestedStopId || stop.id === violation?.nextStopId,
    )
    const travel =
      violation === undefined
        ? undefined
        : await dependencies.stopListTravel?.({ ...actor, stops: asked })
    return new Map(
      stops.map(
        (stop) =>
          [
            stop.id,
            toOrderStopLabel(stop, { total: stops.length, travel: travel ?? undefined }),
          ] as const,
      ),
    )
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
        labels: await labelsOf(input.actor, input.event === 'depart' ? result.refusal : undefined),
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
      time: formatBotClock(stopInput.sentAt),
    })
    const said = await renderBotSpeechLine({ companyId: input.actor.companyId, line, speech })
    const view =
      result.kind === 'registered' && dependencies.stopCards !== undefined
        ? await safeRead({
            companyId: input.actor.companyId,
            driverId: input.actor.driverId,
            stopId: input.stopId,
            withEta: input.event === 'depart',
          })
        : null
    return {
      context: cleared,
      handled: true,
      texts: [describeStopEventText({ event: input.event, said, view })],
    }
  }

  const describeStopEventText = (input: {
    readonly event: 'arrive' | 'depart'
    readonly said: string
    readonly view: StopCardView | null
  }): string => {
    const { event, said, view } = input
    if (view === null) return said
    return event === 'depart'
      ? describeDepartureReply(said, view, clock())
      : describeArrivalReply(said, view)
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
      ...(prompt.confirmOutOfOrder === true ? { confirmOutOfOrder: true } : {}),
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
    const labels = await labelsOf(turn.actor)
    return {
      context: turn.context,
      handled: true,
      texts: [
        describeOutOfOrderNotUnderstood({
          event: prompt.event,
          other: labels.get(prompt.nextStopId ?? '')?.sequence,
          requested: labels.get(prompt.stopId)?.sequence,
        }),
      ],
    }
  }

  /** Saída para a parada escolhida: pede a localização (se não há ponto recente) e só então registra. */
  async function departTo(
    turn: PromptTurn,
    target: {
      readonly confirmOutOfOrder: boolean
      readonly documentNumber?: string | undefined
      /** Por pedido: a mesma resposta repetida não grava duas vezes. */
      readonly idempotencyKey: string
      readonly stopId: string
    },
  ): Promise<WhatsAppDriverPromptResult> {
    const cleared = withoutDriverPrompt(turn.context)
    const ask = askLocation({
      companyId: turn.actor.companyId,
      documentNumber: target.documentNumber,
      event: 'depart',
      stopId: target.stopId,
      whatsappNumber: turn.whatsappNumber,
    })
    if (ask?.prompt !== undefined) {
      const prompt =
        target.confirmOutOfOrder && ask.prompt.kind === DRIVER_PROMPT_KIND.location
          ? { ...ask.prompt, confirmOutOfOrder: true }
          : ask.prompt
      return {
        context: { ...cleared, [DRIVER_PROMPT_CONTEXT_KEY]: prompt },
        handled: true,
        texts: ask.texts,
      }
    }
    return recordStop({
      actor: turn.actor,
      ...(target.confirmOutOfOrder ? { confirmOutOfOrder: true } : {}),
      context: turn.context,
      documentNumber: target.documentNumber,
      event: 'depart',
      idempotencyKey: target.idempotencyKey,
      location: sharedLocations?.consume(keyOf(turn.actor.companyId, turn.whatsappNumber)) ?? null,
      stopId: target.stopId,
    })
  }

  /** O número (ou nome) do menu vai ao passo dono da ação — o mesmo de quando o motorista digita o comando. */
  async function answerJourney(
    turn: PromptTurn & { readonly text: string },
    prompt: Extract<DriverPrompt, { kind: 'journey_actions' }>,
  ): Promise<WhatsAppDriverPromptResult> {
    const cleared = withoutDriverPrompt(turn.context)
    const action = pickJourneyAction(prompt.actions, turn.text)
    if (action === undefined) {
      return {
        context: turn.context,
        handled: true,
        texts: [describeJourneyNotUnderstood(prompt.actions)],
      }
    }
    switch (action.kind) {
      case JOURNEY_ACTION.deliver:
        return {
          context: cleared,
          followUpText: `entreguei ${action.documentNumber}`,
          handled: false,
          texts: [],
        }
      case JOURNEY_ACTION.return:
        return {
          context: cleared,
          followUpText: `não entreguei ${action.documentNumber}`,
          handled: false,
          texts: [],
        }
      case JOURNEY_ACTION.arrive:
        return { context: cleared, followUpText: 'cheguei', handled: false, texts: [] }
      case JOURNEY_ACTION.occurrence: {
        const stops = await listStopsOf(turn.actor)
        const document = stops
          .flatMap((stop) => stop.documents)
          .find((item) => item.number.replace(/^0+/u, '') === action.documentNumber)
        if (document?.id === undefined) {
          return { context: cleared, handled: true, texts: [JOURNEY_TEXT.nothingRecorded] }
        }
        return {
          context: cleared,
          flowJump: {
            context: { [DRIVER_FLOW_CONTEXT_KEY.documentId]: document.id },
            nodeId: DRIVER_FLOW_NODE.listOccurrenceTypes,
          },
          handled: true,
          texts: [],
        }
      }
      case JOURNEY_ACTION.depart:
        return departTo(turn, {
          confirmOutOfOrder: false,
          documentNumber: action.documentNumber,
          idempotencyKey: `whatsapp-route-offer:${action.stopId}:${prompt.offeredAt}`,
          stopId: action.stopId,
        })
      case JOURNEY_ACTION.chooseDeparture:
        return stopChoice(turn, { confirmOutOfOrder: false })
      case JOURNEY_ACTION.departAnyway:
        return stopChoice(turn, { confirmOutOfOrder: true })
      case JOURNEY_ACTION.none:
        return {
          context: cleared,
          handled: true,
          texts: [`${JOURNEY_TEXT.nothingRecorded}\n${await nextStepOf(turn.actor)}`],
        }
    }
  }

  /** O próximo passo de quem não quis nada agora: a baixa pendente, a chegada ou a saída. */
  async function nextStepOf(actor: WhatsAppDriverActor): Promise<string> {
    const stops = await listStopsOf(actor)
    if (findStopEnRoute(stops) !== undefined) return JOURNEY_TEXT.nextArrive
    if (findStopAwaitingSettlement(stops) !== undefined) return JOURNEY_TEXT.nextSettle
    return findNextPendingStop(stops) === undefined
      ? routeCompletedText(actor)
      : JOURNEY_TEXT.nextDepart
  }

  async function answerStopChoice(
    turn: PromptTurn & { readonly text: string },
    prompt: Extract<DriverPrompt, { kind: 'stop_choice' }>,
  ): Promise<WhatsAppDriverPromptResult> {
    const picked = pickStopFromList(prompt.stops, turn.text)
    if (picked.kind === 'not_found') {
      return {
        context: turn.context,
        handled: true,
        texts: [describeStopListNotUnderstood(prompt.stops, picked.reason)],
      }
    }
    return departTo(turn, {
      confirmOutOfOrder: prompt.confirmOutOfOrder,
      documentNumber: picked.option.numbers[0],
      idempotencyKey: `whatsapp-stop-choice:${picked.option.id}:${prompt.offeredAt}`,
      stopId: picked.option.id,
    })
  }

  return {
    askLocation,
    recordStop,
    repeatedEvent,
    routeOffer,
    settledDocument,

    stopInProgress: ({ actor }) =>
      readWhatsAppStopInProgress({
        actor,
        listStops: async (scope) => (await dependencies.listStops?.(scope)) ?? [],
        stopCards: dependencies.stopCards,
      }),

    async answer(turn) {
      const prompt = readDriverPrompt(turn.context, clock())
      if (prompt === undefined) return null
      const cleared = withoutDriverPrompt(turn.context)
      const choice = interpretDriverChoice(turn.text)

      // "Cancelar" é de quem fez a pergunta aberta: encerra sem registrar nada.
      if (isDriverCancelText(turn.text)) {
        return { context: cleared, handled: true, texts: [DRIVER_PROMPT_TEXT.cancelled] }
      }
      // Pedido de menu ou outro comando tira a pergunta de cena; texto livre nunca a descarta calado.
      if (
        isDriverEscapeText(turn.text) ||
        interpretWhatsAppDriverEventCommand(turn.text) !== undefined
      ) {
        return { context: cleared, handled: false, texts: [] }
      }

      if (prompt.kind === DRIVER_PROMPT_KIND.outOfOrder) return answerOutOfOrder(turn, prompt)
      if (prompt.kind === DRIVER_PROMPT_KIND.journeyActions) return answerJourney(turn, prompt)
      if (prompt.kind === DRIVER_PROMPT_KIND.stopChoice) return answerStopChoice(turn, prompt)

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
      // Outra coisa: a pergunta continua aberta e é repetida (texto livre só vira outro fluxo sem pergunta aberta).
      if (choice !== DRIVER_CHOICE.first) {
        return {
          context: turn.context,
          handled: true,
          texts: [ROUTE_OFFER_TEXT.options.join('\n')],
        }
      }
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
