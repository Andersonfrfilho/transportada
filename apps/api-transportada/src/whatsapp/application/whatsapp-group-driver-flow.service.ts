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
  normalizeDriverCommandText,
  WHATSAPP_DRIVER_STOP_COMMAND,
  type WhatsAppDriverStopCommandEvent,
} from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import type { GroupBoletoResend } from './whatsapp-group-boleto-resend.service.js'
import type { createGroupDeliveryFlow } from './whatsapp-group-delivery-flow.service.js'
import type { createGroupStopFlow } from './whatsapp-group-stop-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequestFlow,
} from './whatsapp-group-request.port.js'

export const GROUP_DRIVER_STEP = {
  deliveryPrefix: 'delivery.',
  menu: 'menu',
  stopPrefix: 'stop.',
} as const

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
}): GroupRequestFlow {
  const prefixed =
    (prefix: string) =>
    (outcome: GroupFlowOutcome): GroupFlowOutcome =>
      outcome.kind === 'continue' ? { ...outcome, step: `${prefix}${outcome.step}` } : outcome
  const withStopPrefix = prefixed(GROUP_DRIVER_STEP.stopPrefix)
  const withDeliveryPrefix = prefixed(GROUP_DRIVER_STEP.deliveryPrefix)
  const { delivery } = flows
  const menu = delivery === undefined ? MENU_WITHOUT_DELIVERY : GROUP_DRIVER_MENU
  const menuText =
    delivery === undefined ? GROUP_DRIVER_TEXT.menuWithoutDelivery : GROUP_DRIVER_TEXT.menu

  async function choose(turn: GroupFlowTurn, item: MenuItem): Promise<GroupFlowOutcome> {
    if (item.kind === 'occurrence') return flows.occurrence.start({ ...turn, text: '' })
    if (item.kind === 'deliver') {
      return delivery === undefined
        ? flows.occurrence.start({ ...turn, text: '' })
        : withDeliveryPrefix(await delivery.begin(turn, []))
    }
    return withStopPrefix(await flows.stop.begin(turn, item.event, []))
  }

  return {
    async answer(turn) {
      const { step } = turn.request
      if (step === GROUP_DRIVER_STEP.menu) {
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
        return withDeliveryPrefix(
          await delivery.answer({
            ...turn,
            request: {
              ...turn.request,
              step: step.slice(GROUP_DRIVER_STEP.deliveryPrefix.length),
            },
          }),
        )
      }
      if (step.startsWith(GROUP_DRIVER_STEP.stopPrefix)) {
        return flows.stop.answer({
          ...turn,
          request: { ...turn.request, step: step.slice(GROUP_DRIVER_STEP.stopPrefix.length) },
        })
      }
      return flows.occurrence.answer(turn)
    },

    initialStep: flows.occurrence.initialStep,

    async start(turn) {
      if (turn.text === '') {
        return {
          kind: 'continue',
          replies: [menuText],
          state: {},
          step: GROUP_DRIVER_STEP.menu,
        }
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
        if (event?.kind === 'deliver')
          return withDeliveryPrefix(await delivery.begin(turn, event.numbers))
        if (event?.kind === 'too_many_documents')
          return withDeliveryPrefix(await delivery.begin(turn, ['', '']))
        // "@bot 1", "@bot pular": a resposta a uma entrega em preparo, depois que o pedido venceu.
        if (await delivery.awaitingText(turn)) {
          const answered = await delivery.reply(turn)
          if (answered.kind !== 'not_understood') return withDeliveryPrefix(answered)
        }
      }
      return flows.occurrence.start(turn)
    },
  }
}

/** O número da opção, ou o nome dela ("cheguei", "entreguei", "ocorrência"). */
function pickMenuItem(menu: readonly MenuItem[], text: string): MenuItem | undefined {
  const normalized = normalizeDriverCommandText(text)
  if (/^\d{1,2}$/u.test(normalized)) return menu[Number(normalized) - 1]
  const command = interpretDriverStopCommand(text)
  if (command !== null) {
    return menu.find((item) => item.kind === 'stop' && item.event === command.event)
  }
  if (normalized.startsWith('entreg')) return menu.find((item) => item.kind === 'deliver')
  return normalized.startsWith('ocorrencia')
    ? menu.find((item) => item.kind === 'occurrence')
    : undefined
}
