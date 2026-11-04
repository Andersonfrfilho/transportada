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
 * ocorrência ficam como sempre foram, então pedido aberto antes do deploy continua andando. As etapas
 * T13 (entreguei, devolvi) entram como novos itens do menu, sem mexer neste desenho.
 */
import {
  interpretDriverStopCommand,
  normalizeDriverCommandText,
  WHATSAPP_DRIVER_STOP_COMMAND,
  type WhatsAppDriverStopCommandEvent,
} from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import type { createGroupStopFlow } from './whatsapp-group-stop-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequestFlow,
} from './whatsapp-group-request.port.js'

export const GROUP_DRIVER_STEP = { menu: 'menu', stopPrefix: 'stop.' } as const

type MenuItem =
  | {
      readonly kind: 'stop'
      readonly event: WhatsAppDriverStopCommandEvent
      readonly label: string
    }
  | { readonly kind: 'occurrence'; readonly label: string }

/** A ordem do menu. T13 acrescenta "Entreguei" e "Devolvi". */
export const GROUP_DRIVER_MENU: readonly MenuItem[] = [
  { event: WHATSAPP_DRIVER_STOP_COMMAND.depart, kind: 'stop', label: 'Saí para a entrega' },
  { event: WHATSAPP_DRIVER_STOP_COMMAND.arrive, kind: 'stop', label: 'Cheguei' },
  { kind: 'occurrence', label: 'Ocorrência' },
]

export const GROUP_DRIVER_TEXT = {
  menu: [
    'O que você quer lançar?',
    ...GROUP_DRIVER_MENU.map((item, index) => `${index + 1}. ${item.label}`),
  ].join('\n'),
} as const

export function createGroupDriverFlow(flows: {
  readonly occurrence: GroupRequestFlow
  readonly stop: ReturnType<typeof createGroupStopFlow>
}): GroupRequestFlow {
  const withStopPrefix = (outcome: GroupFlowOutcome): GroupFlowOutcome =>
    outcome.kind === 'continue'
      ? { ...outcome, step: `${GROUP_DRIVER_STEP.stopPrefix}${outcome.step}` }
      : outcome

  async function choose(turn: GroupFlowTurn, item: MenuItem): Promise<GroupFlowOutcome> {
    if (item.kind === 'occurrence') return flows.occurrence.start({ ...turn, text: '' })
    return withStopPrefix(await flows.stop.begin(turn, item.event, []))
  }

  return {
    async answer(turn) {
      const { step } = turn.request
      if (step === GROUP_DRIVER_STEP.menu) {
        const item = pickMenuItem(turn.text)
        if (item === undefined) {
          return {
            kind: 'not_understood',
            prompt: GROUP_DRIVER_TEXT.menu,
            reason: 'responda com o número da opção',
          }
        }
        return choose(turn, item)
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
          replies: [GROUP_DRIVER_TEXT.menu],
          state: {},
          step: GROUP_DRIVER_STEP.menu,
        }
      }
      const command = interpretDriverStopCommand(turn.text)
      if (command !== null) {
        return withStopPrefix(await flows.stop.begin(turn, command.event, command.documentNumbers))
      }
      return flows.occurrence.start(turn)
    },
  }
}

/** O número da opção, ou o nome dela ("cheguei", "ocorrência"). */
function pickMenuItem(text: string): MenuItem | undefined {
  const normalized = normalizeDriverCommandText(text)
  if (/^\d{1,2}$/u.test(normalized)) return GROUP_DRIVER_MENU[Number(normalized) - 1]
  const command = interpretDriverStopCommand(text)
  if (command !== null) {
    return GROUP_DRIVER_MENU.find((item) => item.kind === 'stop' && item.event === command.event)
  }
  return normalized.startsWith('ocorrencia')
    ? GROUP_DRIVER_MENU.find((item) => item.kind === 'occurrence')
    : undefined
}
