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
  describeRouteOffer,
  ROUTE_OFFER_TEXT,
} from '../../whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import type { WhatsAppRouteContinuation } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { GROUP_OCCURRENCE_STEP } from './whatsapp-group-occurrence-flow.service.js'
import type { GroupBoletoResend } from './whatsapp-group-boleto-resend.service.js'
import type { createGroupDeliveryFlow } from './whatsapp-group-delivery-flow.service.js'
import type { createGroupTripCloseFlow } from './whatsapp-group-trip-close-flow.service.js'
import type { createGroupStopFlow } from './whatsapp-group-stop-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequestFlow,
} from './whatsapp-group-request.port.js'

/** Os passos que a ocorrência é dona: sem prefixo de outro fluxo, só estes chegam a ela. */
const OCCURRENCE_OWNED_STEPS: ReadonlySet<string> = new Set(Object.values(GROUP_OCCURRENCE_STEP))

export const GROUP_DRIVER_STEP = {
  closePrefix: 'close.',
  deliveryPrefix: 'delivery.',
  menu: 'menu',
  routePrefix: 'route.',
  stopPrefix: 'stop.',
} as const

/** Spec 294 RF8: o passo que espera o "1 - Sim, iniciar rota / 2 - Agora não" da próxima parada. */
export const GROUP_ROUTE_STEP = { offer: 'offer' } as const

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
      readonly label: string
    }
  | { readonly kind: 'deliver'; readonly label: string }
  | { readonly kind: 'occurrence'; readonly label: string }

/** A ordem do menu. T13 acrescenta "Devolvi". */
export const GROUP_DRIVER_MENU: readonly MenuItem[] = [
  { event: WHATSAPP_DRIVER_STOP_COMMAND.depart, kind: 'stop', label: 'Saí para a entrega' },
  { event: WHATSAPP_DRIVER_STOP_COMMAND.arrive, kind: 'stop', label: 'Cheguei' },
  { kind: 'deliver', label: 'Entreguei' },
  { kind: 'occurrence', label: 'Ocorrência' },
]

const menuOf = (items: readonly MenuItem[]) =>
  ['O que você quer lançar?', ...items.map((item, index) => `${index + 1}. ${item.label}`)].join(
    '\n',
  )

const MENU_WITHOUT_DELIVERY = GROUP_DRIVER_MENU.filter((item) => item.kind !== 'deliver')

export const GROUP_DRIVER_TEXT = {
  menu: menuOf(GROUP_DRIVER_MENU),
  /** Sem a entrega em preparo montada (ex.: testes da T12), "Entreguei" não aparece. */
  menuWithoutDelivery: menuOf(MENU_WITHOUT_DELIVERY),
} as const

export function createGroupDriverFlow(flows: {
  /** Spec 292 T7: "pedir boleto de novo"; ausente, o texto segue para o fluxo de ocorrência como antes. */
  readonly boletoResend?: GroupBoletoResend
  /** Spec 293 T15: ausente, "entreguei" segue para o fluxo de ocorrência como antes. */
  readonly delivery?: ReturnType<typeof createGroupDeliveryFlow>
  readonly occurrence: GroupRequestFlow
  readonly stop: ReturnType<typeof createGroupStopFlow>
  /** Spec 294 RF21: "encerrar a rota" do atendente; ausente, o texto segue como antes. */
  readonly tripClose?: ReturnType<typeof createGroupTripCloseFlow>
}): GroupRequestFlow {
  const prefixed =
    (prefix: string) =>
    (outcome: GroupFlowOutcome): GroupFlowOutcome =>
      outcome.kind === 'continue' ? { ...outcome, step: `${prefix}${outcome.step}` } : outcome
  const withStopPrefix = prefixed(GROUP_DRIVER_STEP.stopPrefix)
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
      return { kind: 'done', replies: [...outcome.replies, ROUTE_OFFER_TEXT.routeCompleted] }
    }
    if (nextStop === null) return { kind: 'done', replies: outcome.replies }
    const asks = canAskRouteOffer({
      hasOpenCollection: delivery === undefined ? false : await delivery.hasOpen(turn),
      hasOpenStopChoice: false,
      hasPendingAudio: false,
      hasPendingPrompt: false,
    })
    if (!asks) {
      return {
        kind: 'done',
        replies: [...outcome.replies, describeRouteOffer(nextStop, { asks: false })],
      }
    }
    const state: RouteOfferState = {
      routeOffer: { documentNumber: nextStop.documents[0]?.number, stopId: nextStop.id },
    }
    return {
      kind: 'continue',
      replies: [...outcome.replies, describeRouteOffer(nextStop, { asks: true })],
      state,
      step: `${GROUP_DRIVER_STEP.routePrefix}${GROUP_ROUTE_STEP.offer}`,
    }
  }

  async function answerRouteOffer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
    const stop = (turn.request.state as RouteOfferState).routeOffer
    const choice = interpretDriverChoice(turn.text)
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

  const menu = delivery === undefined ? MENU_WITHOUT_DELIVERY : GROUP_DRIVER_MENU
  const menuText =
    delivery === undefined ? GROUP_DRIVER_TEXT.menuWithoutDelivery : GROUP_DRIVER_TEXT.menu

  async function choose(turn: GroupFlowTurn, item: MenuItem): Promise<GroupFlowOutcome> {
    if (item.kind === 'occurrence') return flows.occurrence.start({ ...turn, text: '' })
    if (item.kind === 'deliver') {
      return delivery === undefined
        ? flows.occurrence.start({ ...turn, text: '' })
        : settleDelivery(turn, withDeliveryPrefix(await delivery.begin(turn, [])))
    }
    return withStopPrefix(await flows.stop.begin(turn, item.event, []))
  }

  const flow: GroupRequestFlow = {
    async answer(turn) {
      const { step } = turn.request
      if (step === GROUP_DRIVER_STEP.menu) {
        // Spec 292 T9: a frase inteira no lugar da opção ("ocorrência, prorrogação do boleto da nota
        // 899877", por texto ou pelo áudio confirmado) vale como o pedido direto, com nota e tipo.
        if (isFreeSentence(turn.text)) return flow.start(turn)
        const item = pickMenuItem(menu, turn.text)
        if (item === undefined) {
          return {
            kind: 'not_understood',
            prompt: menuText,
            reason: 'responda com o número da opção',
          }
        }
        return choose(turn, item)
      }
      if (delivery !== undefined && step.startsWith(GROUP_DRIVER_STEP.deliveryPrefix)) {
        const answered = await delivery.answer({
          ...turn,
          request: {
            ...turn.request,
            step: step.slice(GROUP_DRIVER_STEP.deliveryPrefix.length),
          },
        })
        return settleDelivery(turn, withDeliveryPrefix(answered))
      }
      if (step.startsWith(GROUP_DRIVER_STEP.routePrefix)) return answerRouteOffer(turn)
      if (tripClose !== undefined && step.startsWith(GROUP_DRIVER_STEP.closePrefix)) {
        return withClosePrefix(
          await tripClose.answer({
            ...turn,
            request: { ...turn.request, step: step.slice(GROUP_DRIVER_STEP.closePrefix.length) },
          }),
        )
      }
      if (step.startsWith(GROUP_DRIVER_STEP.stopPrefix)) {
        return withStopPrefix(
          await flows.stop.answer({
            ...turn,
            request: { ...turn.request, step: step.slice(GROUP_DRIVER_STEP.stopPrefix.length) },
          }),
        )
      }
      if (!OCCURRENCE_OWNED_STEPS.has(step)) {
        return {
          kind: 'not_understood',
          prompt: menuText,
          reason: 'responda com o número da opção',
        }
      }
      return flows.occurrence.answer(turn)
    },

    initialStep: flows.occurrence.initialStep,

    locationReceived(turn) {
      const { step } = turn.request
      // Spec 294 RF24: o pedido de localização do "saí"/"cheguei" é das paradas.
      if (step.startsWith(GROUP_DRIVER_STEP.stopPrefix)) {
        return flows.stop.locationReceived({
          ...turn,
          request: { ...turn.request, step: step.slice(GROUP_DRIVER_STEP.stopPrefix.length) },
        })
      }
      if (
        step === GROUP_DRIVER_STEP.menu ||
        step.startsWith(GROUP_DRIVER_STEP.deliveryPrefix) ||
        step.startsWith(GROUP_DRIVER_STEP.closePrefix) ||
        step.startsWith(GROUP_DRIVER_STEP.routePrefix) ||
        step.startsWith(GROUP_DRIVER_STEP.stopPrefix)
      ) {
        return null
      }
      if (!OCCURRENCE_OWNED_STEPS.has(step)) return null
      return flows.occurrence.locationReceived?.(turn) ?? null
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
      if (delivery !== undefined) {
        const event = interpretWhatsAppDriverEventCommand(turn.text)
        if (event?.kind === 'deliver') {
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
  return isWordOf(normalized, OCCURRENCE_WORDS)
    ? menu.find((item) => item.kind === 'occurrence')
    : undefined
}
