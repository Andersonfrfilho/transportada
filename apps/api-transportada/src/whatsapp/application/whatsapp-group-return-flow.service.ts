/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * **"Não entreguei" no grupo do motorista.** A nota (citada, ou a única em aberto da parada em que ele chegou) e o
 * motivo da lista fechada (spec 057), depois a baixa pela MESMA função do app (`reportDocumentReturn`, pela camada
 * comum dos eventos). A baixa que fecha a parada segue para a oferta da próxima rota, como a entrega.
 */
import { DRIVER_LIST_HEADING } from '../../whatsapp-commands/domain/whatsapp-driver-list-heading.constant.js'
import {
  DRIVER_RETURN_REASONS,
  type DriverReturnReason,
} from '../../trips/domain/driver-return-reason.policy.js'
import { normalizeDriverCommandText } from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import { describeReturnReasonOption } from '../../whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import {
  formatNextStep,
  formatOptions,
  formatReplyHint,
} from '../../whatsapp-commands/domain/whatsapp-message-format.policy.js'
import type { WhatsAppRouteContinuation } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'
import {
  SENDER_NOT_ALLOWED_TEXT,
  type ResolveWhatsAppSenderRole,
} from './whatsapp-sender-role.service.js'

export const GROUP_RETURN_STEP = { reason: 'reason' } as const

export type GroupReturnDocument = {
  /** Spec 300: a cidade e o cliente da nota, para a citação da pergunta (melhor esforço). */
  readonly city?: string | undefined
  readonly clientName?: string | undefined
  readonly id: string
  readonly number: string
}

export type GroupReturnFlowPorts = {
  /** As notas em aberto do motorista do grupo; a da parada em que ele chegou vem marcada. */
  listOpenDocuments(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly (GroupReturnDocument & { readonly atArrivedStop: boolean })[]>
  returnDocument(input: {
    readonly companyId: string
    readonly documentId: string
    readonly documentNumber: string
    readonly driverId: string
    /** Por pedido: a mesma resposta repetida não grava duas vezes. */
    readonly idempotencyKey: string
    readonly reason: DriverReturnReason
  }): Promise<{
    readonly message: string
    readonly routeContinuation?: WhatsAppRouteContinuation
  }>
  /** Ausente, todo remetente é a tripulação. */
  readonly resolveSenderRole?: ResolveWhatsAppSenderRole
}

const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, '')

/** O desenho (spec 300, fluxo 6): as opções são só os motivos; o "não entendi" do pedido as repete. */
export const GROUP_RETURN_REASON_OPTIONS = formatOptions(
  DRIVER_RETURN_REASONS.map(describeReturnReasonOption),
)

function describeReturnClient(document: GroupReturnDocument): string[] {
  if (document.clientName === undefined || document.clientName === '') return []
  const city = document.city === undefined || document.city === '' ? '' : ` · ${document.city}`
  return [`> 🏪 ${document.clientName}${city}`]
}

export const GROUP_RETURN_TEXT = {
  askReason: (document: GroupReturnDocument) =>
    [
      `↩️ *Por que a NF \`${stripZeros(document.number)}\` não foi entregue?*`,
      ...describeReturnClient(document),
      '',
      GROUP_RETURN_REASON_OPTIONS,
      '',
      formatReplyHint('Responda com o número do motivo.'),
    ].join('\n'),
  whichDocument: [
    DRIVER_LIST_HEADING.returnDocument,
    'Mande *não entreguei* com o número da nota.',
    '➡️ _Exemplo:_ não entreguei 899836',
  ].join('\n'),
  attendantUsesOffice: [
    '↩️ *A devolução pelo atendente é feita no painel.*',
    formatNextStep('registre a devolução em Viagens.'),
  ].join('\n'),
} as const

type ReturnState = {
  readonly returnFor?: { readonly documentId: string; readonly documentNumber: string }
}

const REASON_WORDS: readonly (readonly [RegExp, DriverReturnReason])[] = [
  [/\b(ausente|ninguem)\b/u, 'recipient_absent'],
  [/\b(recusou|recusa|recusado)\b/u, 'recipient_refused'],
  [/\b(endereco|nao achei)\b/u, 'address_not_found'],
  [/\b(avaria|avariada|avariado|quebrada|danificada)\b/u, 'damaged_goods'],
  [/\b(fechado|fechada)\b/u, 'establishment_closed'],
]

const SPOKEN_NUMBERS: Readonly<Record<string, number>> = {
  cinco: 5,
  dois: 2,
  duas: 2,
  quatro: 4,
  tres: 3,
  um: 1,
  uma: 1,
}

/** O motivo pelo número ("2", "opção dois") ou pela palavra ("recusou"). */
export function pickReturnReason(text: string): DriverReturnReason | undefined {
  const normalized = normalizeDriverCommandText(text)
  const words = normalized
    .split(' ')
    .filter((word) => !['a', 'o', 'opcao', 'numero'].includes(word))
  const [only] = words
  if (words.length === 1 && only !== undefined) {
    const number = /^\d$/u.test(only) ? Number(only) : SPOKEN_NUMBERS[only]
    if (number !== undefined) return DRIVER_RETURN_REASONS[number - 1]
  }
  return REASON_WORDS.find(([pattern]) => pattern.test(normalized))?.[1]
}

export function createGroupReturnFlow(ports: GroupReturnFlowPorts) {
  async function register(
    turn: GroupFlowTurn,
    target: NonNullable<ReturnState['returnFor']>,
    reason: DriverReturnReason,
  ): Promise<GroupFlowOutcome> {
    const result = await ports.returnDocument({
      companyId: turn.request.companyId,
      documentId: target.documentId,
      documentNumber: target.documentNumber,
      driverId: turn.request.driverId,
      idempotencyKey: `whatsapp-group-request:${turn.request.id}:return`,
      reason,
    })
    return {
      kind: 'done',
      replies: [result.message],
      ...(result.routeContinuation === undefined
        ? { withoutFarewell: true as const }
        : { routeContinuation: result.routeContinuation }),
    }
  }

  async function isAllowed(turn: GroupFlowTurn): Promise<'attendant' | 'crew' | 'unknown'> {
    const role = await ports.resolveSenderRole?.({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
      phone: turn.sender,
    })
    return role?.kind ?? 'crew'
  }

  return {
    /** "não entreguei [nota] [motivo]": a nota citada ou a única em aberto da parada em que ele chegou. */
    async begin(
      turn: GroupFlowTurn,
      input: {
        readonly numbers: readonly string[]
        readonly reason?: DriverReturnReason | undefined
      },
    ): Promise<GroupFlowOutcome> {
      const role = await isAllowed(turn)
      if (role === 'unknown') return { kind: 'done', replies: [SENDER_NOT_ALLOWED_TEXT] }
      if (role === 'attendant') {
        return { kind: 'done', replies: [GROUP_RETURN_TEXT.attendantUsesOffice] }
      }
      const open = await ports.listOpenDocuments({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      const wanted = input.numbers.map((number) => stripZeros(number))
      const candidates =
        wanted.length > 0
          ? open.filter((document) => wanted.includes(stripZeros(document.number)))
          : open.filter((document) => document.atArrivedStop)
      const [document] = candidates
      if (document === undefined || candidates.length !== 1) {
        return { kind: 'done', replies: [GROUP_RETURN_TEXT.whichDocument], withoutFarewell: true }
      }
      const target = { documentId: document.id, documentNumber: document.number }
      if (input.reason !== undefined) return register(turn, target, input.reason)
      const state: ReturnState = { returnFor: target }
      return {
        kind: 'continue',
        replies: [GROUP_RETURN_TEXT.askReason(document)],
        state,
        step: GROUP_RETURN_STEP.reason,
      }
    },

    async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      const target = (turn.request.state as ReturnState).returnFor
      const reason = pickReturnReason(turn.text)
      // Pedido sem a nota guardada não é mais deste fluxo: fecha limpo, dizendo como recomeçar.
      if (target === undefined) {
        return { kind: 'done', replies: [GROUP_RETURN_TEXT.whichDocument], withoutFarewell: true }
      }
      if (reason === undefined) {
        return {
          kind: 'not_understood',
          prompt: GROUP_RETURN_REASON_OPTIONS,
          reason: 'responda com o número do motivo:',
        }
      }
      return register(turn, target, reason)
    },
  }
}
