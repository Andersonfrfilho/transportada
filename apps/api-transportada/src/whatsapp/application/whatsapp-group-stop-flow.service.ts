/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T12: **"saí" e "cheguei" no grupo do motorista.** Registra pela camada comum dos eventos
 * (`whatsapp-driver-events.service.ts`), a mesma função do app. Regras (spec 293, 3.3):
 *
 * - comando completo e uma parada possível: registra direto, sem confirmação (decisão 7);
 * - mais de uma candidata: o bot lista as paradas pelo número da primeira nota e o motorista escolhe
 *   pelo número da opção ou da nota; uma nota citada no comando ("cheguei 17234") já escolhe;
 * - "saí" com outra parada a caminho: o app recusa e o bot diz qual (`stop_en_route`);
 * - a parada é citada pela nota e pelo cliente (spec 294 RF17).
 *
 * A localização não entra aqui: o Evolution só entrega texto ao grupo (spec 292 T3), então o evento
 * grava `unavailable`, como já ocorre sem a localização compartilhada.
 */
import {
  describeStopReference,
  findNextPendingStop,
  findStopAwaitingSettlement,
  findStopEnRoute,
  resolveArrivalStop,
  resolveDepartureStop,
  type WhatsAppStopCandidate,
  type WhatsAppStopResolution,
} from '../../trips/domain/driver-stop-resolution.policy.js'
import { isArrivalLate } from '../../trips/domain/address-arrival-correction.policy.js'
import {
  WHATSAPP_DRIVER_STOP_COMMAND,
  type WhatsAppDriverStopCommandEvent,
} from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import {
  DRIVER_CHOICE,
  interpretDriverChoice,
} from '../../whatsapp-commands/domain/whatsapp-driver-choice.policy.js'
import {
  describeOutOfOrderChoices,
  OUT_OF_ORDER_TEXT,
} from '../../whatsapp-commands/domain/whatsapp-driver-order.policy.js'
import {
  describeLocationPrompt,
  LOCATION_PROMPT_TEXT,
} from '../../whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import {
  arrivedStopActions,
  describeAlreadyArrived,
  describeAlreadyDeparted,
  describeAlreadySettled,
  describeNextRouteOffer,
  describePendingSettlement,
  enRouteStopActions,
  JOURNEY_STEP,
  JOURNEY_TEXT,
  nextRouteActions,
  pendingSettlementActions,
  cardFromRouteOfferStop,
  cardFromStopCandidate,
  type JourneyAction,
  type StopCardView,
} from '../../whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import {
  ROUTE_OFFER_TEXT,
  type RouteOfferStop,
} from '../../whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import {
  describeStopListHint,
  formatStopList,
  pickStopFromList,
  STOP_LIST_TEXT,
  type StopListTravelView,
} from '../../whatsapp-commands/domain/whatsapp-stop-list.policy.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'
import {
  SENDER_NOT_ALLOWED_TEXT,
  type ResolveWhatsAppSenderRole,
  type WhatsAppSenderRole,
} from './whatsapp-sender-role.service.js'

export const GROUP_STOP_STEP = {
  choose: 'choose',
  confirmOrder: 'confirm_order',
  location: 'location',
} as const

export type GroupStopCandidate = WhatsAppStopCandidate

/** A parada que a oferta da próxima rota guarda no pedido (só ids e o número da nota). */
export type GroupStopRoute = {
  readonly documentNumber?: string | undefined
  readonly stopId: string
}

/**
 * A resposta do registro já em frase para o grupo (a recusa também). `outOfOrder` (spec 294 RF25): a API recusou por fora
 * de ordem e `message` é a pergunta 1/2; `stopId` é a parada pedida e `nextStopId` a próxima do roteiro (na saída).
 */
export type GroupStopRegistration = {
  readonly message: string
  readonly outOfOrder?: { readonly nextStopId?: string; readonly stopId: string }
}

export type GroupStopFlowPorts = {
  /** As paradas das viagens ativas do motorista dono do grupo. */
  listStops(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly GroupStopCandidate[]>
  record(input: {
    /** Spec 294 RF19: quem mandou é atendente; o registro vai pelo caminho do escritório (sem ordem, sem "junto"). */
    readonly attendant?: { readonly actorUserId: string }
    readonly companyId: string
    /** Spec 294 RF25: o motorista confirmou gravar fora da ordem da parada. */
    readonly confirmOutOfOrder?: boolean
    readonly driverId: string
    /** A primeira nota da parada: "Marquei a saída junto com a chegada da NF X" (spec 294 RF5). */
    readonly documentNumber?: string | undefined
    readonly event: WhatsAppDriverStopCommandEvent
    /** Por pedido: a mesma mensagem repetida não grava duas vezes. */
    readonly idempotencyKey: string
    /** O ponto que respondeu ao pedido de localização (vale quando nenhum ponto ficou lembrado). */
    readonly location?: { readonly latitude: number; readonly longitude: number } | undefined
    /** Spec 294: a hora do WhatsApp da mensagem; a API mede por ela se o registro chegou tarde. */
    readonly sentAt?: Date | undefined
    readonly stopId: string
  }): Promise<GroupStopRegistration>
  /**
   * Spec 294 RF24: há ponto compartilhado recente (não o consome)? Ausente, o bot não pede a localização
   * antes do "saí"/"cheguei" (como antes da 294).
   */
  hasLocation?(input: { readonly companyId: string; readonly driverId: string }): boolean
  /** Só empresa e nome do erro (o bloco da parada que não leu). */
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly clock?: () => Date
  /**
   * O bloco da parada (notas, valor, cliente, contratante, endereço, mapa, estrada). Ausente, o bot monta o bloco
   * só com o que a lista de paradas já traz.
   */
  readStopCard?(input: {
    readonly companyId: string
    readonly driverId: string
    readonly stopId: string
    readonly withEta?: boolean
  }): Promise<StopCardView | null>
  /**
   * Spec 300 RF4: distância e tempo de cada parada da lista, pela estrada (uma consulta). Ausente, ou `null`, a lista sai
   * sem a linha e sem o rodapé da localização.
   */
  readStopListTravel?(input: {
    readonly companyId: string
    readonly driverId: string
    readonly stops: readonly GroupStopCandidate[]
  }): Promise<StopListTravelView | null>
  /** Spec 294 RF19: quem escreveu. Ausente, todo remetente é tratado como a tripulação (como antes da 294). */
  resolveSenderRole?: ResolveWhatsAppSenderRole
  /** A frase de "já está a caminho da parada N" e afins, na plateia do grupo. */
  enRouteMessage(input: { readonly companyId: string; readonly sequence: string }): Promise<string>
}

export const GROUP_STOP_TEXT = {
  noStopArrive:
    'Não encontrei parada para registrar a chegada na viagem do motorista deste grupo.\n➡️ _Próximo passo:_ confira a viagem com o escritório.',
  noStopDepart:
    'Não encontrei parada para registrar a saída na viagem do motorista deste grupo.\n➡️ _Próximo passo:_ confira a viagem com o escritório.',
} as const

const REASON = { stop: STOP_LIST_TEXT.notFoundText } as const

type FlowState = {
  /** Spec 294 RF25: a parada que a API recusou por fora de ordem e a próxima do roteiro, esperando o 1/2. */
  readonly outOfOrderFor?: {
    readonly documentNumber?: string | undefined
    readonly event: WhatsAppDriverStopCommandEvent
    readonly nextStopId?: string | undefined
    readonly stopId: string
  }
  /** Spec 294 RF24: a parada que espera a localização (ou o "pular") antes de registrar. */
  readonly locationFor?: {
    readonly confirmOutOfOrder?: boolean
    readonly documentNumber?: string | undefined
    readonly event: WhatsAppDriverStopCommandEvent
    readonly stopId: string
  }
  /** O motorista já confirmou sair com a baixa de outra parada pendente (a API não pergunta de novo). */
  readonly confirmOutOfOrder?: boolean
  readonly event?: WhatsAppDriverStopCommandEvent | undefined
  readonly stops?:
    | readonly {
        readonly id: string
        readonly isAddressReliable?: boolean | undefined
        readonly label: string
        readonly numbers: readonly string[]
        /** Spec 300 RF5: o número da parada, que é a opção da lista; ausente em pedido aberto antes da 300. */
        readonly sequence?: number | undefined
      }[]
    | undefined
}

export function createGroupStopFlow(ports: GroupStopFlowPorts) {
  const resolve = (event: WhatsAppDriverStopCommandEvent, stops: readonly GroupStopCandidate[]) =>
    event === WHATSAPP_DRIVER_STOP_COMMAND.depart
      ? resolveDepartureStop(stops)
      : resolveArrivalStop(stops)

  /** Spec 294 S1: um papel por mensagem; sem a porta, todo remetente é a tripulação (como antes da 294). */
  async function roleOf(turn: GroupFlowTurn): Promise<WhatsAppSenderRole> {
    const role = await ports.resolveSenderRole?.({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
      phone: turn.sender,
    })
    return role ?? { kind: 'crew' }
  }

  const refused = (): GroupFlowOutcome => ({ kind: 'done', replies: [SENDER_NOT_ALLOWED_TEXT] })
  const refusedAnswer = (): GroupFlowOutcome => ({
    kind: 'not_understood',
    prompt: '',
    reason: SENDER_NOT_ALLOWED_TEXT,
  })

  async function record(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: {
      readonly confirmOutOfOrder?: boolean
      readonly documentNumber?: string | undefined
      readonly event: WhatsAppDriverStopCommandEvent
      readonly location?: { readonly latitude: number; readonly longitude: number } | undefined
      readonly stopId: string
    },
  ): Promise<GroupFlowOutcome> {
    const { documentNumber, event, stopId } = target
    const confirmOutOfOrder = target.confirmOutOfOrder === true
    const attendant = role.kind === 'attendant' ? { actorUserId: role.actorUserId } : undefined
    const result = await ports.record({
      ...(attendant === undefined ? {} : { attendant }),
      ...(confirmOutOfOrder ? { confirmOutOfOrder: true } : {}),
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
      documentNumber,
      event,
      idempotencyKey: `whatsapp-group-request:${turn.request.id}`,
      ...(target.location === undefined ? {} : { location: target.location }),
      ...(turn.sentAt === undefined ? {} : { sentAt: turn.sentAt }),
      stopId,
    })
    if (result.outOfOrder !== undefined) {
      const state: FlowState = {
        outOfOrderFor: {
          documentNumber,
          event,
          nextStopId: result.outOfOrder.nextStopId,
          stopId: result.outOfOrder.stopId,
        },
      }
      return {
        kind: 'continue',
        replies: [result.message],
        state,
        step: GROUP_STOP_STEP.confirmOrder,
      }
    }
    // A saída e a chegada são passos da rota, não o fim da conversa: sem a despedida.
    return { kind: 'done', replies: [result.message], withoutFarewell: true }
  }

  /** "1" confirma fora da ordem; "2" descarta, ou na saída vai à próxima do roteiro; o resto repete a pergunta. */
  async function answerConfirmOrder(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: NonNullable<FlowState['outOfOrderFor']>,
  ): Promise<GroupFlowOutcome> {
    const choice = interpretDriverChoice(turn.text)
    if (choice === DRIVER_CHOICE.first) {
      return record(turn, role, { ...target, confirmOutOfOrder: true })
    }
    if (choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
      if (target.event === WHATSAPP_DRIVER_STOP_COMMAND.depart && target.nextStopId !== undefined) {
        return record(turn, role, { event: target.event, stopId: target.nextStopId })
      }
      return { kind: 'done', replies: [OUT_OF_ORDER_TEXT.discarded] }
    }
    return { kind: 'not_understood', prompt: '', reason: await describeOrderChoices(turn, target) }
  }

  /** "Responda *1* para … ou *2* para …": o número das duas paradas vem da viagem de agora. */
  async function describeOrderChoices(
    turn: GroupFlowTurn,
    target: NonNullable<FlowState['outOfOrderFor']>,
  ): Promise<string> {
    const stops = await ports.listStops({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
    })
    const sequenceOf = (stopId: string | undefined) =>
      stops.find((stop) => stop.id === stopId)?.sequence
    return describeOutOfOrderChoices({
      event: target.event,
      other: sequenceOf(target.nextStopId),
      requested: sequenceOf(target.stopId),
    })
  }

  /** Spec 294 RF24: pede a localização opcional (se não há ponto recente) e só então registra. */
  async function recordOrAsk(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: {
      readonly confirmOutOfOrder?: boolean | undefined
      readonly documentNumber?: string | undefined
      readonly event: WhatsAppDriverStopCommandEvent
      readonly isAddressReliable?: boolean | undefined
      readonly stopId: string
    },
  ): Promise<GroupFlowOutcome> {
    const { companyId, driverId } = turn.request
    const { documentNumber, event, isAddressReliable, stopId } = target
    const confirm = target.confirmOutOfOrder === true ? { confirmOutOfOrder: true } : {}
    // O escritório não manda ponto: o atendente registra direto, sem a pergunta da localização. A mensagem tardia
    // (spec 294: além do prazo da foto atrasada) também não pede: ela não corrige endereço.
    const receivedAt = (ports.clock ?? (() => new Date()))()
    if (
      role.kind === 'attendant' ||
      isArrivalLate({ receivedAt, tappedAt: turn.sentAt }) ||
      ports.hasLocation === undefined ||
      ports.hasLocation({ companyId, driverId })
    ) {
      return record(turn, role, { ...confirm, documentNumber, event, stopId })
    }
    const state: FlowState = { locationFor: { ...confirm, documentNumber, event, stopId } }
    return {
      kind: 'continue',
      replies: [describeLocationPrompt({ event, isAddressReliable })],
      state,
      step: GROUP_STOP_STEP.location,
    }
  }

  const clock = ports.clock ?? (() => new Date())

  /** O bloco da parada pela porta; sem ela, só o que a lista de paradas já traz. */
  async function viewOf(
    turn: GroupFlowTurn,
    stop: GroupStopCandidate,
    withEta: boolean,
  ): Promise<StopCardView> {
    const read = await safeReadStopCard(turn, stop.id, withEta)
    return read ?? { card: cardFromStopCandidate(stop) }
  }

  /** O bloco é melhor esforço: o registro já foi feito, a resposta nunca falha por causa dele. */
  async function safeReadStopCard(
    turn: GroupFlowTurn,
    stopId: string,
    withEta: boolean,
  ): Promise<StopCardView | null> {
    try {
      return (
        (await ports.readStopCard?.({
          companyId: turn.request.companyId,
          driverId: turn.request.driverId,
          stopId,
          withEta,
        })) ?? null
      )
    } catch (error) {
      ports.logger?.warn('whatsapp_group_request.stop_card_failed', {
        companyId: turn.request.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
      })
      return null
    }
  }

  /** O menu numerado das ações, guardado no passo `actions` (o roteador o põe sob `journey.`). */
  const menu = (text: string, actions: readonly JourneyAction[]): GroupFlowOutcome => ({
    kind: 'continue',
    replies: [text],
    state: { journeyActions: actions },
    step: JOURNEY_STEP.actions,
  })

  async function alreadyDeparted(
    turn: GroupFlowTurn,
    stop: GroupStopCandidate,
  ): Promise<GroupFlowOutcome> {
    const view = await viewOf(turn, stop, true)
    const headline = await ports.enRouteMessage({
      companyId: turn.request.companyId,
      sequence: String(stop.sequence),
    })
    return menu(describeAlreadyDeparted(view, headline), enRouteStopActions(view.card))
  }

  /**
   * O evento repetido nunca lista as outras paradas: "cheguei" numa parada que já chegou e "saí" com uma parada a
   * caminho dizem que já está registrado e oferecem o que cabe; "saí" com a baixa pendente avisa antes (RF25).
   * `null`: segue a resolução de sempre.
   */
  async function repeatedEvent(
    turn: GroupFlowTurn,
    event: WhatsAppDriverStopCommandEvent,
    stops: readonly GroupStopCandidate[],
    documentNumbers: readonly string[],
  ): Promise<GroupFlowOutcome | null> {
    const wanted = documentNumbers.map(stripZeros).filter((number) => number !== '')
    // A nota citada que não é desta parada é um pedido para outra: segue a resolução de sempre.
    const mentionsAnother = (stop: GroupStopCandidate) =>
      wanted.length > 0 &&
      !stop.documents.some((document) => wanted.includes(stripZeros(document.number)))
    const enRoute = findStopEnRoute(stops)
    if (event === WHATSAPP_DRIVER_STOP_COMMAND.depart && enRoute !== undefined) {
      return mentionsAnother(enRoute) ? null : alreadyDeparted(turn, enRoute)
    }
    if (enRoute !== undefined) return null
    const awaiting = findStopAwaitingSettlement(stops)
    if (awaiting === undefined || mentionsAnother(awaiting)) return null
    const view = await viewOf(turn, awaiting, false)
    const arrivedAt = awaiting.arrivedAt ?? ''
    return event === WHATSAPP_DRIVER_STOP_COMMAND.arrive
      ? menu(
          describeAlreadyArrived(view, { arrivedAt, now: clock() }),
          arrivedStopActions(view.card),
        )
      : menu(
          describePendingSettlement(view, { arrivedAt, now: clock() }),
          pendingSettlementActions(view.card),
        )
  }

  /** Spec 300 RF4–RF7b: a lista das paradas, com distância e tempo quando há ponto (falha da estrada não derruba a lista). */
  async function describeStopChoice(
    turn: GroupFlowTurn,
    input: {
      readonly event: WhatsAppDriverStopCommandEvent
      readonly stops: readonly GroupStopCandidate[]
      readonly totalStops: number
    },
  ): Promise<string> {
    const travel = await ports.readStopListTravel?.({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
      stops: input.stops,
    })
    return formatStopList({
      stops: input.stops,
      title:
        input.event === WHATSAPP_DRIVER_STOP_COMMAND.depart
          ? STOP_LIST_TEXT.departTitle
          : STOP_LIST_TEXT.arriveTitle,
      totalStops: input.totalStops,
      travel: travel ?? undefined,
    })
  }

  async function afterResolution(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    input: {
      readonly confirmOutOfOrder?: boolean
      readonly documentNumbers: readonly string[]
      readonly event: WhatsAppDriverStopCommandEvent
      readonly resolution: WhatsAppStopResolution<GroupStopCandidate>
      /** Quantas paradas a viagem tem (o "M" da lista). */
      readonly totalStops: number
    },
  ): Promise<GroupFlowOutcome> {
    const { documentNumbers, event, resolution, totalStops } = input
    const confirmOutOfOrder = input.confirmOutOfOrder ?? false
    const confirm = confirmOutOfOrder ? { confirmOutOfOrder: true } : {}
    switch (resolution.kind) {
      case 'none':
        return {
          kind: 'done',
          replies: [
            event === WHATSAPP_DRIVER_STOP_COMMAND.depart
              ? GROUP_STOP_TEXT.noStopDepart
              : GROUP_STOP_TEXT.noStopArrive,
          ],
        }
      case 'en_route':
        return alreadyDeparted(turn, resolution.stop)
      case 'single':
        return recordOrAsk(turn, role, {
          ...confirm,
          documentNumber: firstNumberOf(resolution.stop),
          event,
          isAddressReliable: resolution.stop.isAddressReliable,
          stopId: resolution.stop.id,
        })
      case 'choose': {
        const mentioned = resolution.stops.filter((stop) =>
          stop.documents.some((document) =>
            documentNumbers.includes(document.number.replace(/^0+/u, '')),
          ),
        )
        if (mentioned.length === 1 && mentioned[0] !== undefined) {
          return recordOrAsk(turn, role, {
            ...confirm,
            documentNumber: firstNumberOf(mentioned[0]),
            event,
            isAddressReliable: mentioned[0].isAddressReliable,
            stopId: mentioned[0].id,
          })
        }
        const state: FlowState = {
          ...(confirmOutOfOrder ? { confirmOutOfOrder: true } : {}),
          event,
          stops: resolution.stops.map((stop) => ({
            id: stop.id,
            isAddressReliable: stop.isAddressReliable,
            label: describeStopReference(stop),
            numbers: stop.documents.map((document) => document.number.replace(/^0+/u, '')),
            sequence: stop.sequence,
          })),
        }
        return {
          kind: 'continue',
          replies: [await describeStopChoice(turn, { event, stops: resolution.stops, totalStops })],
          state,
          step: GROUP_STOP_STEP.choose,
        }
      }
    }
  }

  /** "pular" (falado ou digitado) registra sem ponto; o resto repete que o item vai por localização. */
  async function answerLocationStep(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: NonNullable<FlowState['locationFor']>,
  ): Promise<GroupFlowOutcome> {
    const choice = interpretDriverChoice(turn.text)
    if (choice === DRIVER_CHOICE.skip || choice === DRIVER_CHOICE.second) {
      return record(turn, role, target)
    }
    return {
      kind: 'not_understood',
      prompt: LOCATION_PROMPT_TEXT.askAgainHint,
      reason: LOCATION_PROMPT_TEXT.askAgainReason,
    }
  }

  return {
    /** O motorista pediu o evento (comando direto ou menu): resolve a parada e registra ou pergunta. */
    async begin(
      turn: GroupFlowTurn,
      event: WhatsAppDriverStopCommandEvent,
      documentNumbers: readonly string[],
    ): Promise<GroupFlowOutcome> {
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refused()
      const stops = await ports.listStops({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      const repeated = await repeatedEvent(turn, event, stops, documentNumbers)
      if (repeated !== null) return repeated
      return afterResolution(turn, role, {
        documentNumbers,
        event,
        resolution: resolve(event, stops),
        totalStops: stops.length,
      })
    },

    /**
     * "2 - Escolher outra da lista" (oferta) e "sair sem dar a baixa" (menu): a lista das paradas pendentes. Na
     * saída sem baixa o motorista já confirmou: a API grava sem perguntar de novo (RF25).
     */
    async chooseDeparture(
      turn: GroupFlowTurn,
      options: { readonly confirmOutOfOrder?: boolean } = {},
    ): Promise<GroupFlowOutcome> {
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refused()
      const stops = await ports.listStops({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      const event = WHATSAPP_DRIVER_STOP_COMMAND.depart
      const enRoute = findStopEnRoute(stops)
      if (enRoute !== undefined) return alreadyDeparted(turn, enRoute)
      const pending = resolveDepartureStop(stops)
      // Uma só pendente também é lista: o motorista pediu para escolher.
      const listed: WhatsAppStopResolution<GroupStopCandidate> =
        pending.kind === 'single'
          ? { kind: 'choose', stops: [pending.stop], suggested: pending.stop }
          : pending
      return afterResolution(turn, role, {
        confirmOutOfOrder: options.confirmOutOfOrder === true,
        documentNumbers: [],
        event,
        resolution: listed,
        totalStops: stops.length,
      })
    },

    /** O próximo passo de quem não quis nada agora: a chegada, a baixa pendente ou a saída. */
    async nextStepText(turn: GroupFlowTurn): Promise<string> {
      const stops = await ports.listStops({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      if (findStopEnRoute(stops) !== undefined) return JOURNEY_TEXT.nextArrive
      if (findStopAwaitingSettlement(stops) !== undefined) return JOURNEY_TEXT.nextSettle
      return findNextPendingStop(stops) === undefined
        ? ROUTE_OFFER_TEXT.routeCompleted
        : JOURNEY_TEXT.nextDepart
    },

    /** A oferta da próxima rota depois da baixa que fechou a parada (com a estrada, se houver ponto). */
    async nextRouteOffer(
      turn: GroupFlowTurn,
      input: { readonly asks: boolean; readonly stop: RouteOfferStop },
    ): Promise<{ readonly actions: readonly JourneyAction[]; readonly text: string }> {
      const read = await safeReadStopCard(turn, input.stop.id, true)
      const view = read ?? { card: cardFromRouteOfferStop(input.stop) }
      return {
        actions: input.asks ? nextRouteActions(view.card) : [],
        text: describeNextRouteOffer(view, { asks: input.asks, now: clock() }),
      }
    },

    /** "entreguei 17234" numa nota já baixada: diz quando e oferece o que cabe agora; `null` se não é o caso. */
    async settledDocument(
      turn: GroupFlowTurn,
      documentNumbers: readonly string[],
    ): Promise<GroupFlowOutcome | null> {
      const [wanted] = documentNumbers
      if (wanted === undefined || documentNumbers.length !== 1) return null
      const role = await roleOf(turn)
      if (role.kind !== 'crew') return null
      const stops = await ports.listStops({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      const number = wanted.replace(/^0+/u, '')
      const stop = stops.find((candidate) =>
        candidate.documents.some(
          (document) =>
            document.number.replace(/^0+/u, '') === number && CLOSED.has(document.separationStatus),
        ),
      )
      const document = stop?.documents.find((item) => item.number.replace(/^0+/u, '') === number)
      if (stop === undefined || document === undefined) return null
      const headline = describeAlreadySettled({
        documentNumber: number,
        now: clock(),
        returned: document.separationStatus === 'returned',
        settledAt: document.deliveredAt ?? null,
      })
      if (findStopAwaitingSettlement([stop]) !== undefined) {
        const view = await viewOf(turn, stop, false)
        return menu(
          `${headline}\n${describeAlreadyArrived(view, { arrivedAt: stop.arrivedAt ?? '', now: clock() })}`,
          arrivedStopActions(view.card),
        )
      }
      const next = findNextPendingStop(stops)
      if (next === undefined) {
        return { kind: 'done', replies: [`${headline}\n${ROUTE_OFFER_TEXT.routeCompleted}`] }
      }
      const view = await viewOf(turn, next, true)
      return menu(
        `${headline}\n\n${describeNextRouteOffer(view, { asks: true, now: clock() })}`,
        nextRouteActions(view.card),
      )
    },

    /** "1" na oferta da próxima rota: a saída da parada oferecida, pelo mesmo registro do "saí". */
    async departStop(turn: GroupFlowTurn, stop: GroupStopRoute): Promise<GroupFlowOutcome> {
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refused()
      return recordOrAsk(turn, role, {
        documentNumber: stop.documentNumber,
        event: WHATSAPP_DRIVER_STOP_COMMAND.depart,
        stopId: stop.stopId,
      })
    },

    async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refusedAnswer()
      const state = turn.request.state as FlowState
      if (turn.request.step === GROUP_STOP_STEP.location && state.locationFor !== undefined) {
        return answerLocationStep(turn, role, state.locationFor)
      }
      if (turn.request.step === GROUP_STOP_STEP.confirmOrder && state.outOfOrderFor !== undefined) {
        return answerConfirmOrder(turn, role, state.outOfOrderFor)
      }
      if (turn.request.step !== GROUP_STOP_STEP.choose) {
        return { kind: 'not_understood', prompt: '', reason: REASON.stop }
      }
      const stops = state.stops ?? []
      const event = state.event ?? WHATSAPP_DRIVER_STOP_COMMAND.arrive
      const picked = pickStopFromList(stops, turn.text)
      if (picked.kind === 'not_found') {
        return {
          kind: 'not_understood',
          prompt: describeStopListHint(stops),
          reason: picked.reason,
        }
      }
      return recordOrAsk(turn, role, {
        ...(state.confirmOutOfOrder === true ? { confirmOutOfOrder: true } : {}),
        documentNumber: picked.option.numbers[0],
        event,
        isAddressReliable: picked.option.isAddressReliable,
        stopId: picked.option.id,
      })
    },

    /** A localização compartilhada chegou com o pedido de localização aberto: registra com ela (o ponto está lembrado). */
    async locationReceived(turn: GroupFlowTurn): Promise<GroupFlowOutcome | null> {
      const target = (turn.request.state as FlowState).locationFor
      if (turn.request.step !== GROUP_STOP_STEP.location || target === undefined) return null
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refusedAnswer()
      return record(turn, role, { ...target, location: turn.location })
    },
  }
}

const CLOSED = new Set(['delivered', 'returned'])

const stripZeros = (value: string) => value.replace(/^0+/u, '')

const firstNumberOf = (stop: GroupStopCandidate): string | undefined =>
  stop.documents[0]?.number.replace(/^0+/u, '')
