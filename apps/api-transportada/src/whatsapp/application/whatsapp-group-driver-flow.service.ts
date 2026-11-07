/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T12: **o roteador do pedido no grupo do motorista.** Decide, pelo texto, qual fluxo atende:
 *
 * - `@bot` sozinho: o menu numerado (decisão da 293, 3.1);
 * - "saí" / "cheguei" (comando direto, mesma gramática da conversa individual): fluxo das paradas;
 * - o resto: o fluxo de ocorrência da spec 292 (que já entende "prorrogação do boleto 17234").
 *
 * Os passos do fluxo das paradas ganham o prefixo `stop.` e o menu é o passo `menu`; os do fluxo de
 * ocorrência ficam como sempre foram, então pedido aberto antes do deploy continua andando.
 *
 * Spec 293 T15: "entreguei 17234" (e o item "Entreguei" do menu) abre a entrega em preparo da nota, com
 * o prefixo `delivery.`; o texto que responde a uma entrega em preparo (quem recebeu, nome, "pular",
 * 1/2) vai para ela antes de virar ocorrência. O lote e o "devolvi" ficam para a T13.
 */
import { interpretWhatsAppDriverEventCommand } from '../../whatsapp-commands/domain/whatsapp-driver-event-command.policy.js'
import {
  interpretDriverStopCommand,
  isWordOf,
  normalizeDriverCommandText,
  WHATSAPP_DRIVER_STOP_COMMAND,
  type WhatsAppDriverStopCommandEvent,
} from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import {
  interpretDriverChoice,
  DRIVER_CHOICE,
} from '../../whatsapp-commands/domain/whatsapp-driver-choice.policy.js'
import {
  canAskRouteOffer,
  ROUTE_OFFER_TEXT,
} from '../../whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import {
  describeJourneyOptions,
  JOURNEY_ACTION,
  JOURNEY_STEP,
  JOURNEY_TEXT,
  pickJourneyAction,
  readJourneyActions,
  type JourneyAction,
} from '../../whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import {
  formatOptions,
  formatReplyHint,
} from '../../whatsapp-commands/domain/whatsapp-message-format.policy.js'
import type { WhatsAppRouteContinuation } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { GROUP_DELIVERY_STEP } from './whatsapp-group-delivery-flow.service.js'
import { GROUP_OCCURRENCE_STEP } from './whatsapp-group-occurrence-flow.service.js'
import { GROUP_STOP_STEP } from './whatsapp-group-stop-flow.service.js'
import { GROUP_TRIP_CLOSE_STEP } from './whatsapp-group-trip-close-flow.service.js'
import { GROUP_RETURN_STEP } from './whatsapp-group-return-flow.service.js'
import type { createGroupReturnFlow } from './whatsapp-group-return-flow.service.js'
import type { GroupBoletoResend } from './whatsapp-group-boleto-resend.service.js'
import type { createGroupDeliveryFlow } from './whatsapp-group-delivery-flow.service.js'
import type { createGroupTripCloseFlow } from './whatsapp-group-trip-close-flow.service.js'
import type { createGroupStopFlow } from './whatsapp-group-stop-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequestFlow,
} from './whatsapp-group-request.port.js'

export const GROUP_DRIVER_STEP = {
  closePrefix: 'close.',
  deliveryPrefix: 'delivery.',
  journeyPrefix: 'journey.',
  menu: 'menu',
  returnPrefix: 'return.',
  routePrefix: 'route.',
  stopPrefix: 'stop.',
} as const

/** Spec 294 RF8: o passo que espera o "1 - Sim, iniciar rota / 2 - Agora não" da próxima parada. */
export const GROUP_ROUTE_STEP = { offer: 'offer' } as const

export type GroupStepOwner =
  | 'close'
  | 'delivery'
  | 'journey'
  | 'menu'
  | 'occurrence'
  | 'return'
  | 'route'
  | 'stop'

/** Quem é dono de cada passo guardado no pedido. Só a ocorrência e o menu andam sem prefixo. */
export const GROUP_STEP_REGISTRY: readonly {
  readonly owner: string
  readonly prefix: string
  readonly steps: readonly string[]
}[] = [
  { owner: 'menu', prefix: '', steps: [GROUP_DRIVER_STEP.menu] },
  { owner: 'occurrence', prefix: '', steps: Object.values(GROUP_OCCURRENCE_STEP) },
  {
    owner: 'delivery',
    prefix: GROUP_DRIVER_STEP.deliveryPrefix,
    steps: Object.values(GROUP_DELIVERY_STEP),
  },
  { owner: 'route', prefix: GROUP_DRIVER_STEP.routePrefix, steps: Object.values(GROUP_ROUTE_STEP) },
  {
    owner: 'close',
    prefix: GROUP_DRIVER_STEP.closePrefix,
    steps: Object.values(GROUP_TRIP_CLOSE_STEP),
  },
  { owner: 'stop', prefix: GROUP_DRIVER_STEP.stopPrefix, steps: Object.values(GROUP_STOP_STEP) },
  /** O menu das ações da parada (evento repetido, baixa pendente, próxima rota). */
  { owner: 'journey', prefix: GROUP_DRIVER_STEP.journeyPrefix, steps: Object.values(JOURNEY_STEP) },
  /** "Não entreguei": o motivo da lista fechada. */
  {
    owner: 'return',
    prefix: GROUP_DRIVER_STEP.returnPrefix,
    steps: Object.values(GROUP_RETURN_STEP),
  },
]

/** Os nomes de passo (com prefixo) declarados por mais de um fluxo; vazio quando cada um tem um dono. */
export function findDuplicateGroupSteps(registry: typeof GROUP_STEP_REGISTRY): string[] {
  const seen = new Set<string>()
  const duplicated = new Set<string>()
  for (const entry of registry) {
    for (const step of entry.steps) {
      const qualified = `${entry.prefix}${step}`
      if (seen.has(qualified)) duplicated.add(step)
      seen.add(qualified)
    }
  }
  return [...duplicated]
}

function ownerOfStep(step: string): GroupStepOwner | undefined {
  for (const entry of GROUP_STEP_REGISTRY) {
    if (entry.steps.some((inner) => `${entry.prefix}${inner}` === step)) {
      return entry.owner as GroupStepOwner
    }
  }
  return undefined
}

type RouteOfferState = {
  readonly routeOffer?: {
    readonly documentNumber?: string | undefined
    readonly stopId: string
  }
}

type MenuItem =
  | {
      readonly kind: 'stop'
      readonly event: WhatsAppDriverStopCommandEvent
      readonly icon: string
      readonly action: string
    }
  | { readonly kind: 'deliver'; readonly icon: string; readonly action: string }
  | { readonly kind: 'return'; readonly icon: string; readonly action: string }
  | { readonly kind: 'occurrence'; readonly icon: string; readonly action: string }

/** A ordem do menu (spec 300 RF8: "Não entreguei" é a 4). O ícone só enfeita: a escolha é pelo número ou pelo nome. */
export const GROUP_DRIVER_MENU: readonly MenuItem[] = [
  {
    action: 'Saí para a entrega',
    event: WHATSAPP_DRIVER_STOP_COMMAND.depart,
    icon: '🚚',
    kind: 'stop',
  },
  { action: 'Cheguei', event: WHATSAPP_DRIVER_STOP_COMMAND.arrive, icon: '📍', kind: 'stop' },
  { action: 'Entreguei', icon: '✅', kind: 'deliver' },
  { action: 'Não entreguei', icon: '↩️', kind: 'return' },
  { action: 'Ocorrência', icon: '⚠️', kind: 'occurrence' },
]

const MENU_TITLE = '*O que você quer lançar?*'
const MENU_REPLY_HINT = formatReplyHint('Responda com o número.')
const MENU_NOT_UNDERSTOOD_REASON = 'Responda com o número da opção:'

const menuOf = (items: readonly MenuItem[]) =>
  [MENU_TITLE, formatOptions(items), '', MENU_REPLY_HINT].join('\n')

export const GROUP_DRIVER_TEXT = {
  menu: menuOf(GROUP_DRIVER_MENU),
  /** O "não entendi" do menu repete só as opções (o `prompt`), sem o título nem a instrução. */
  notUnderstoodReason: MENU_NOT_UNDERSTOOD_REASON,
} as const

export function createGroupDriverFlow(flows: {
  /** Spec 292 T7: "pedir boleto de novo"; ausente, o texto segue para o fluxo de ocorrência como antes. */
  readonly boletoResend?: GroupBoletoResend
  /** Spec 293 T15: ausente, "entreguei" segue para o fluxo de ocorrência como antes. */
  readonly delivery?: ReturnType<typeof createGroupDeliveryFlow>
  readonly occurrence: GroupRequestFlow
  /** "Não entreguei"; ausente, o texto segue para o fluxo de ocorrência como antes. */
  readonly return?: ReturnType<typeof createGroupReturnFlow>
  readonly stop: ReturnType<typeof createGroupStopFlow>
  /** Spec 294 RF21: "encerrar a rota" do atendente; ausente, o texto segue como antes. */
  readonly tripClose?: ReturnType<typeof createGroupTripCloseFlow>
}): GroupRequestFlow {
  const prefixed =
    (prefix: string) =>
    (outcome: GroupFlowOutcome): GroupFlowOutcome =>
      outcome.kind === 'continue' ? { ...outcome, step: `${prefix}${outcome.step}` } : outcome
  // O menu de ações que o fluxo das paradas abre é do passo `journey.actions`, não `stop.`.
  const withStopPrefix = (outcome: GroupFlowOutcome): GroupFlowOutcome =>
    outcome.kind === 'continue' && outcome.step === JOURNEY_STEP.actions
      ? { ...outcome, step: `${GROUP_DRIVER_STEP.journeyPrefix}${outcome.step}` }
      : prefixed(GROUP_DRIVER_STEP.stopPrefix)(outcome)
  const withReturnPrefix = prefixed(GROUP_DRIVER_STEP.returnPrefix)
  const returnFlow = flows.return
  const withDeliveryPrefix = prefixed(GROUP_DRIVER_STEP.deliveryPrefix)
  const { delivery, tripClose } = flows
  const withClosePrefix = prefixed(GROUP_DRIVER_STEP.closePrefix)
  /** Spec 294 RF8–RF10: a baixa que fechou a parada oferece a próxima rota no mesmo pedido (RNF1). */
  async function settleDelivery(
    turn: GroupFlowTurn,
    outcome: GroupFlowOutcome,
  ): Promise<GroupFlowOutcome> {
    if (outcome.kind !== 'done' || outcome.routeContinuation === undefined) return outcome
    const { nextStop, tripCompleted } =
      outcome.routeContinuation satisfies WhatsAppRouteContinuation
    if (tripCompleted) {
      return {
        kind: 'done',
        replies: [...outcome.replies, await flows.stop.routeCompletedText(turn)],
      }
    }
    if (nextStop === null) return { kind: 'done', replies: outcome.replies, withoutFarewell: true }
    const asks = canAskRouteOffer({
      hasOpenCollection: delivery === undefined ? false : await delivery.hasOpen(turn),
      hasOpenStopChoice: false,
      hasPendingAudio: false,
      hasPendingPrompt: false,
    })
    const offer = await flows.stop.nextRouteOffer(turn, { asks, stop: nextStop })
    if (!asks || offer.actions.length === 0) {
      return { kind: 'done', replies: [...outcome.replies, offer.text], withoutFarewell: true }
    }
    return {
      kind: 'continue',
      replies: [...outcome.replies, offer.text],
      state: { journeyActions: offer.actions },
      step: `${GROUP_DRIVER_STEP.journeyPrefix}${JOURNEY_STEP.actions}`,
    }
  }

  /** O número (ou o nome) escolhido no menu de ações vai ao fluxo dono daquela ação. */
  async function runJourneyAction(
    turn: GroupFlowTurn,
    action: JourneyAction,
  ): Promise<GroupFlowOutcome> {
    switch (action.kind) {
      case JOURNEY_ACTION.deliver:
        if (delivery === undefined) {
          return {
            kind: 'done',
            replies: [JOURNEY_TEXT.sendCanhoto(action.documentNumber)],
            withoutFarewell: true,
          }
        }
        return settleDelivery(
          turn,
          withDeliveryPrefix(await delivery.begin(turn, [action.documentNumber])),
        )
      case JOURNEY_ACTION.return:
        if (returnFlow === undefined)
          return flows.occurrence.start({ ...turn, text: action.documentNumber })
        return settleDelivery(
          turn,
          withReturnPrefix(await returnFlow.begin(turn, { numbers: [action.documentNumber] })),
        )
      case JOURNEY_ACTION.occurrence:
        return flows.occurrence.start({ ...turn, text: action.documentNumber })
      case JOURNEY_ACTION.arrive:
        return withStopPrefix(
          await flows.stop.begin(
            turn,
            WHATSAPP_DRIVER_STOP_COMMAND.arrive,
            action.documentNumber === undefined ? [] : [action.documentNumber],
          ),
        )
      case JOURNEY_ACTION.depart:
        return withStopPrefix(
          await flows.stop.departStop(turn, {
            documentNumber: action.documentNumber,
            stopId: action.stopId,
          }),
        )
      case JOURNEY_ACTION.departAnyway:
        return withStopPrefix(await flows.stop.chooseDeparture(turn, { confirmOutOfOrder: true }))
      case JOURNEY_ACTION.chooseDeparture:
        return withStopPrefix(await flows.stop.chooseDeparture(turn))
      case JOURNEY_ACTION.none:
        return {
          kind: 'done',
          replies: [`${JOURNEY_TEXT.nothingRecorded}\n${await flows.stop.nextStepText(turn)}`],
        }
    }
  }

  async function answerJourney(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
    const actions = readJourneyActions(
      (turn.request.state as { readonly journeyActions?: unknown }).journeyActions,
    )
    // Comando digitado ("entreguei 456", "saí") com o menu aberto é um pedido novo, nunca a nota do menu.
    if (isDriverCommand(turn.text)) return flow.start(turn)
    const action = pickJourneyAction(actions, turn.text)
    if (action === undefined) {
      return {
        kind: 'not_understood',
        prompt: describeJourneyOptions(actions),
        reason: JOURNEY_TEXT.choiceNotUnderstood,
      }
    }
    return runJourneyAction(turn, action)
  }

  async function answerRouteOffer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
    const stop = (turn.request.state as RouteOfferState).routeOffer
    const choice = interpretDriverChoice(turn.text)
    // O passo `route.offer` só atende pedido aberto antes do menu de ações: lá o "2" era "Agora não".
    if (stop === undefined || choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
      return { kind: 'done', replies: [ROUTE_OFFER_TEXT.declined] }
    }
    if (choice === DRIVER_CHOICE.first) {
      return withStopPrefix(await flows.stop.departStop(turn, stop))
    }
    return {
      kind: 'not_understood',
      prompt: ROUTE_OFFER_TEXT.options.join('\n'),
      reason: 'responda 1 para iniciar a rota ou 2 para agora não',
    }
  }

  /** Sem a entrega ou a devolução montada (ex.: testes), a opção não aparece em vez de cair em ocorrência. */
  const menu = GROUP_DRIVER_MENU.filter(
    (item) =>
      (item.kind !== 'deliver' || delivery !== undefined) &&
      (item.kind !== 'return' || returnFlow !== undefined),
  )
  const menuText = menuOf(menu)

  async function choose(turn: GroupFlowTurn, item: MenuItem): Promise<GroupFlowOutcome> {
    if (item.kind === 'occurrence') return flows.occurrence.start({ ...turn, text: '' })
    if (item.kind === 'return' && returnFlow !== undefined) {
      return settleDelivery(turn, withReturnPrefix(await returnFlow.begin(turn, { numbers: [] })))
    }
    if (item.kind === 'deliver' && delivery !== undefined) {
      return settleDelivery(turn, withDeliveryPrefix(await delivery.begin(turn, [])))
    }
    if (item.kind === 'return' || item.kind === 'deliver') {
      return flows.occurrence.start({ ...turn, text: '' })
    }
    return withStopPrefix(await flows.stop.begin(turn, item.event, []))
  }

  const inner = (turn: GroupFlowTurn, prefix: string): GroupFlowTurn => ({
    ...turn,
    request: { ...turn.request, step: turn.request.step.slice(prefix.length) },
  })
  const notUnderstoodMenu = (): GroupFlowOutcome => ({
    kind: 'not_understood',
    prompt: formatOptions(menu),
    reason: GROUP_DRIVER_TEXT.notUnderstoodReason,
  })

  /**
   * Com o menu aberto, só a frase que diz o que lançar vira pedido direto: comando da rota, número de nota ou
   * "ocorrência". Conversa solta ("acabei de chegar, já vou fazer aqui") abria a ocorrência e o número digitado
   * em seguida para o menu escolhia uma nota.
   */
  function isDirectRequest(text: string): boolean {
    if (isDriverCommand(text) || /\d/u.test(text)) return true
    if (tripClose?.matches(text) === true) return true
    if ((flows.boletoResend?.interpret(text) ?? null) !== null) return true
    return normalizeDriverCommandText(text)
      .split(' ')
      .some((word) => isWordOf(word, OCCURRENCE_WORDS))
  }

  const flow: GroupRequestFlow = {
    async answer(turn) {
      const { step } = turn.request
      // Quem fez a pergunta (o dono do passo) é quem responde; passo sem dono não é de ninguém.
      switch (ownerOfStep(step)) {
        case 'menu': {
          // Spec 292 T9: a frase inteira no lugar da opção ("ocorrência, prorrogação do boleto da nota
          // 899877", por texto ou pelo áudio confirmado) vale como o pedido direto, com nota e tipo.
          if (isFreeSentence(turn.text)) {
            return isDirectRequest(turn.text) ? flow.start(turn) : notUnderstoodMenu()
          }
          const item = pickMenuItem(menu, turn.text)
          return item === undefined ? notUnderstoodMenu() : choose(turn, item)
        }
        case 'delivery': {
          if (delivery === undefined) return notUnderstoodMenu()
          const answered = await delivery.answer(inner(turn, GROUP_DRIVER_STEP.deliveryPrefix))
          return settleDelivery(turn, withDeliveryPrefix(answered))
        }
        case 'route':
          return answerRouteOffer(turn)
        case 'journey':
          return answerJourney(turn)
        case 'return': {
          if (returnFlow === undefined) return notUnderstoodMenu()
          const answered = await returnFlow.answer(inner(turn, GROUP_DRIVER_STEP.returnPrefix))
          return settleDelivery(turn, withReturnPrefix(answered))
        }
        case 'close':
          if (tripClose === undefined) return notUnderstoodMenu()
          return withClosePrefix(await tripClose.answer(inner(turn, GROUP_DRIVER_STEP.closePrefix)))
        case 'stop':
          return withStopPrefix(await flows.stop.answer(inner(turn, GROUP_DRIVER_STEP.stopPrefix)))
        case 'occurrence':
          return flows.occurrence.answer(turn)
        default:
          return notUnderstoodMenu()
      }
    },

    initialStep: flows.occurrence.initialStep,

    /** "Cancelar" vai ao fluxo dono do passo; sem dono com cancelamento próprio, o pedido só fecha. */
    async cancel(turn) {
      if (ownerOfStep(turn.request.step) !== 'delivery' || delivery === undefined) return null
      const cancelled = await delivery.cancel?.(inner(turn, GROUP_DRIVER_STEP.deliveryPrefix))
      return cancelled === null || cancelled === undefined ? null : withDeliveryPrefix(cancelled)
    },

    locationReceived(turn) {
      // Spec 294 RF24: o pedido de localização do "saí"/"cheguei" é das paradas; a ocorrência tem o seu.
      switch (ownerOfStep(turn.request.step)) {
        case 'stop':
          return flows.stop.locationReceived(inner(turn, GROUP_DRIVER_STEP.stopPrefix))
        case 'occurrence':
          return flows.occurrence.locationReceived?.(turn) ?? null
        default:
          return null
      }
    },

    async start(turn) {
      if (turn.text === '') {
        return {
          kind: 'continue',
          replies: [menuText],
          state: {},
          step: GROUP_DRIVER_STEP.menu,
        }
      }
      if (tripClose?.matches(turn.text) === true) {
        return withClosePrefix(await tripClose.begin(turn))
      }
      const resend = flows.boletoResend?.interpret(turn.text) ?? null
      if (resend !== null && flows.boletoResend !== undefined) {
        return flows.boletoResend.run(turn, resend.documentNumber)
      }
      const command = interpretDriverStopCommand(turn.text)
      if (command !== null) {
        return withStopPrefix(await flows.stop.begin(turn, command.event, command.documentNumbers))
      }
      const typed = interpretWhatsAppDriverEventCommand(turn.text)
      if (typed?.kind === 'return' && returnFlow !== undefined) {
        const settled = await flows.stop.settledDocument(turn, typed.numbers)
        if (settled !== null) return withStopPrefix(settled)
        const begun = await returnFlow.begin(turn, { numbers: typed.numbers, reason: typed.reason })
        return settleDelivery(turn, withReturnPrefix(begun))
      }
      if (delivery !== undefined) {
        const event = typed
        if (event?.kind === 'deliver') {
          const settled = await flows.stop.settledDocument(turn, event.numbers)
          if (settled !== null) return withStopPrefix(settled)
          return settleDelivery(turn, withDeliveryPrefix(await delivery.begin(turn, event.numbers)))
        }
        if (event?.kind === 'too_many_documents') {
          return withDeliveryPrefix(await delivery.begin(turn, ['', '']))
        }
        // "@bot 1", "@bot pular": a resposta a uma entrega em preparo, depois que o pedido venceu.
        if (await delivery.awaitingText(turn)) {
          const answered = await delivery.reply(turn)
          if (answered.kind !== 'not_understood') {
            return settleDelivery(turn, withDeliveryPrefix(answered))
          }
        }
      }
      return flows.occurrence.start(turn)
    },
  }
  return flow
}

/** "saí", "cheguei 17234", "entreguei 456", "não entreguei": um comando da rota, não a resposta do menu. */
function isDriverCommand(text: string): boolean {
  return (
    interpretDriverStopCommand(text) !== null ||
    interpretWhatsAppDriverEventCommand(text) !== undefined
  )
}

/** Duas palavras ou mais com letras: uma frase, não o número ou o nome curto de uma opção. */
function isFreeSentence(text: string): boolean {
  const words = normalizeDriverCommandText(text)
    .split(' ')
    .filter((word) => /[a-z]/u.test(word))
  return words.length >= 2
}

const OCCURRENCE_WORDS: ReadonlySet<string> = new Set(['ocorrencia', 'ocorrencias', 'ocorencia'])

/** O número da opção, ou o nome dela ("cheguei", "entreguei", "ocorrência"). */
function pickMenuItem(menu: readonly MenuItem[], text: string): MenuItem | undefined {
  const normalized = normalizeDriverCommandText(text)
  if (/^\d{1,2}$/u.test(normalized)) return menu[Number(normalized) - 1]
  const command = interpretDriverStopCommand(text)
  if (command !== null) {
    return menu.find((item) => item.kind === 'stop' && item.event === command.event)
  }
  if (normalized.startsWith('entreg')) return menu.find((item) => item.kind === 'deliver')
  if (normalized.startsWith('nao entreg')) return menu.find((item) => item.kind === 'return')
  return isWordOf(normalized, OCCURRENCE_WORDS)
    ? menu.find((item) => item.kind === 'occurrence')
    : undefined
}
