/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: **"entreguei 17234" no grupo do motorista, com as provas antes da baixa.** O pedido
 * abre a entrega em preparo da nota (`whatsapp-delivery-preparation.service.ts`, a mesma da conversa
 * individual) e repassa ao motorista o que a configuração do comprovante pede. A foto e a localização
 * chegam como mídia, fora do pedido (`whatsapp-group-proof-intake.service.ts`); as respostas em texto
 * (quem recebeu, nome, "pular", 1/2 da confirmação) chegam por aqui.
 *
 * Uma nota por vez: o lote ("entreguei 17234 17235") e o "devolvi" são da T13. A nota é citada pelo número
 * e pelo cliente (spec 294 RF17).
 */
import type { WhatsAppDriverActor } from '../../whatsapp-commands/application/whatsapp-driver-events.service.js'
import type { WhatsAppDeliveryPreparations } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'
import {
  SENDER_NOT_ALLOWED_TEXT,
  type ResolveWhatsAppSenderRole,
} from './whatsapp-sender-role.service.js'

export const GROUP_DELIVERY_STEP = { answer: 'answer', choose: 'choose' } as const

export type GroupDeliveryDocument = {
  readonly id: string
  readonly number: string
  readonly recipientName?: string | undefined
}

export type GroupDeliveryFlowPorts = {
  /** A conta do motorista do grupo (o evento fica no nome dele); `null` sem acesso ao app. */
  readonly findActorUserId: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<null | string>
  /** O ponto que o motorista compartilhou no grupo há pouco, consumido por um evento só. */
  readonly consumeLocation: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => null | ReportedLocation
  /** As notas ainda abertas das viagens ativas do motorista do grupo. */
  readonly listOpenDocuments: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly GroupDeliveryDocument[]>
  readonly preparations: WhatsAppDeliveryPreparations
  /**
   * Spec 294 RF18: quem mandou — tripulação, atendente ou ninguém. Ausente, todo remetente conta como
   * tripulação (o comportamento de antes da 294).
   */
  readonly resolveSenderRole?: ResolveWhatsAppSenderRole
  /** A frase do grupo para motorista sem acesso ao app (catálogo editável). */
  readonly withoutAccessText: (companyId: string) => Promise<string>
}

export const GROUP_DELIVERY_TEXT = {
  askDocument: (documents: readonly GroupDeliveryDocument[]) =>
    [
      'Qual nota você entregou? Responda com o número da nota:',
      ...documents
        .slice(0, 8)
        .map((document, index) => `${index + 1}. ${describeDocument(document)}`),
    ].join('\n'),
  noDocuments: 'Não encontrei nota aberta na viagem do motorista deste grupo.',
  notFound: (number: string) =>
    `Não encontrei a NF ${number} aberta na viagem do motorista deste grupo.`,
  oneAtATime:
    'No grupo é uma nota por vez por enquanto. Mande "entreguei" com o número de uma nota.',
} as const

const REASON = {
  answer: 'mande a foto pedida, ou responda "pular" se o item não for obrigatório',
  document: 'não achei essa nota na lista',
} as const

type FlowState = { readonly documents?: readonly GroupDeliveryDocument[] | undefined }

const strip = (value: string) => value.replace(/^0+(?=\d)/u, '')

function describeDocument(document: GroupDeliveryDocument): string {
  const name = document.recipientName?.trim()
  return name ? `NF ${strip(document.number)} · ${name}` : `NF ${strip(document.number)}`
}

export function createGroupDeliveryFlow(ports: GroupDeliveryFlowPorts) {
  /** Tripulação baixa em nome do motorista do grupo; atendente, em nome dele pelo escritório (RF19/RF20). */
  async function actorOf(turn: GroupFlowTurn): Promise<'refused' | null | WhatsAppDriverActor> {
    const { companyId, driverId } = turn.request
    const role = await ports.resolveSenderRole?.({ companyId, phone: turn.sender })
    if (role?.kind === 'unknown') return 'refused'
    if (role?.kind === 'attendant') {
      return { actorUserId: role.actorUserId, attendant: true, companyId, driverId }
    }
    const actorUserId = await ports.findActorUserId({ companyId, driverId })
    return actorUserId === null ? null : { actorUserId, companyId, driverId }
  }

  const refusedOutcome = (): GroupFlowOutcome => ({
    kind: 'done',
    replies: [SENDER_NOT_ALLOWED_TEXT],
  })

  async function prepare(turn: GroupFlowTurn, document: GroupDeliveryDocument) {
    const actor = await actorOf(turn)
    if (actor === 'refused') return refusedOutcome()
    if (actor === null) {
      return {
        kind: 'done',
        replies: [await ports.withoutAccessText(turn.request.companyId)],
      } satisfies GroupFlowOutcome
    }
    const reply = await ports.preparations.begin({
      actor,
      channel: 'group',
      documentId: document.id,
      documentNumber: strip(document.number),
      location: ports.consumeLocation(actor),
    })
    return toOutcome(reply)
  }

  async function reply(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
    const actor = await actorOf(turn)
    if (actor === 'refused') {
      return { kind: 'not_understood', prompt: '', reason: SENDER_NOT_ALLOWED_TEXT }
    }
    if (actor === null) return notUnderstood()
    const answered = await ports.preparations.answer({ actor, text: turn.text })
    return answered === null ? notUnderstood() : toOutcome(answered)
  }

  return {
    /** "entreguei" (com ou sem a nota), pelo comando direto ou pelo menu. */
    async begin(turn: GroupFlowTurn, numbers: readonly string[]): Promise<GroupFlowOutcome> {
      if ((await actorOf(turn)) === 'refused') return refusedOutcome()
      if (numbers.length > 1) return { kind: 'done', replies: [GROUP_DELIVERY_TEXT.oneAtATime] }
      const documents = await ports.listOpenDocuments({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      const [number] = numbers
      if (number !== undefined) {
        const document = documents.find((item) => strip(item.number) === strip(number))
        return document === undefined
          ? { kind: 'done', replies: [GROUP_DELIVERY_TEXT.notFound(strip(number))] }
          : prepare(turn, document)
      }
      if (documents.length === 0)
        return { kind: 'done', replies: [GROUP_DELIVERY_TEXT.noDocuments] }
      const [only] = documents
      if (documents.length === 1 && only !== undefined) return prepare(turn, only)
      const state: FlowState = { documents: documents.slice(0, 8) }
      return {
        kind: 'continue',
        replies: [GROUP_DELIVERY_TEXT.askDocument(documents)],
        state,
        step: GROUP_DELIVERY_STEP.choose,
      }
    },

    async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      if (turn.request.step === GROUP_DELIVERY_STEP.choose) {
        const documents = (turn.request.state as FlowState).documents ?? []
        const picked = pickDocument(documents, turn.text)
        if (picked === undefined) {
          return {
            kind: 'not_understood',
            prompt: GROUP_DELIVERY_TEXT.askDocument(documents),
            reason: REASON.document,
          }
        }
        return prepare(turn, picked)
      }
      return reply(turn)
    },

    /** A resposta em texto a uma entrega em preparo (o roteador já conferiu que há uma esperando). */
    reply,

    /** Há entrega em preparo esperando resposta em texto deste motorista? */
    awaitingText(turn: GroupFlowTurn): Promise<boolean> {
      return ports.preparations.awaitingText({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
    },
  }
}

function notUnderstood(): GroupFlowOutcome {
  return { kind: 'not_understood', prompt: '', reason: REASON.answer }
}

function toOutcome(reply: {
  readonly awaitingText: boolean
  readonly texts: readonly string[]
}): GroupFlowOutcome {
  return reply.awaitingText
    ? { kind: 'continue', replies: reply.texts, state: {}, step: GROUP_DELIVERY_STEP.answer }
    : { kind: 'done', replies: reply.texts }
}

function pickDocument(
  documents: readonly GroupDeliveryDocument[],
  text: string,
): GroupDeliveryDocument | undefined {
  const digits = text.replace(/\D/gu, '')
  if (digits === '') return undefined
  const byNumber = documents.find((document) => strip(document.number) === strip(digits))
  if (byNumber !== undefined) return byNumber
  return /^\d{1,2}$/u.test(text.trim()) ? documents[Number(text.trim()) - 1] : undefined
}
