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
import { DRIVER_LIST_HEADING } from '../../whatsapp-commands/domain/whatsapp-driver-list-heading.constant.js'
import type {
  WhatsAppDocumentEventInput,
  WhatsAppDriverEventResult,
} from '../../whatsapp-commands/application/whatsapp-driver-events.service.js'
import type { WhatsAppDriverActor } from '../../whatsapp-commands/application/whatsapp-driver-events.service.js'
import {
  joinedTexts,
  type WhatsAppDeliveryPreparations,
  type WhatsAppRouteContinuation,
} from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { WhatsAppStopInProgress } from '../../whatsapp-commands/application/whatsapp-stop-in-progress.service.js'
import {
  formatAttendantBatch,
  formatOptions,
  formatReplyHint,
} from '../../whatsapp-commands/domain/whatsapp-message-format.policy.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'
import {
  SENDER_NOT_ALLOWED_TEXT,
  type ResolveWhatsAppSenderRole,
} from './whatsapp-sender-role.service.js'

export const GROUP_DELIVERY_STEP = { answer: 'answer', choose: 'choose' } as const

export type GroupDeliveryDocument = {
  readonly city?: string | undefined
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
  /**
   * A parada em andamento (chegou e falta a baixa, ou a caminho): o "entreguei" sem número segue por ela. Ausente, a
   * lista é a da viagem inteira, como antes.
   */
  readonly findStopInProgress?: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<null | WhatsAppStopInProgress>
  /** As notas ainda abertas das viagens ativas do motorista do grupo. */
  readonly listOpenDocuments: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly GroupDeliveryDocument[]>
  readonly preparations: WhatsAppDeliveryPreparations
  /**
   * Spec 294 RF21: a baixa do atendente pelo escritório, sem prova nenhuma (várias notas de uma vez).
   * Ausente, o lote do atendente não é atendido.
   */
  readonly deliverAsAttendant?: (
    input: WhatsAppDocumentEventInput,
  ) => Promise<WhatsAppDriverEventResult>
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
    [DRIVER_LIST_HEADING.deliverDocument, '', describeDocumentChoices(documents)].join('\n'),
  noDocuments: 'Não encontrei nota aberta na viagem do motorista deste grupo.',
  notFound: (number: string) =>
    `Não encontrei a NF ${number} aberta na viagem do motorista deste grupo.`,
  oneAtATime:
    'No grupo é uma nota por vez por enquanto. Mande "entreguei" com o número de uma nota.',
  tooManyNotes: (limit: number) => `Mande no máximo ${limit} notas por vez.`,
} as const

/** Teto de notas da baixa em lote (o mesmo da mensagem do motorista, spec 293 regra 8). */
const BATCH_LIMIT = 8

const DOCUMENT_REPLY_HINT = 'Responda com o número da opção ou da nota.'

const REASON = {
  answer: 'mande a foto pedida, ou responda "pular" se o item não for obrigatório',
  document: 'não achei essa nota na lista',
} as const

type FlowState = { readonly documents?: readonly GroupDeliveryDocument[] | undefined }

const strip = (value: string) => value.replace(/^0+(?=\d)/u, '')

function describeDocument(document: GroupDeliveryDocument): string {
  const name = document.recipientName?.trim()
  const city = document.city?.trim()
  return [`NF \`${strip(document.number)}\``, name ? `*${name}*` : '', city ?? '']
    .filter((part) => part !== '')
    .join(' · ')
}

/** RF1: as notas como opções (ícone + nota + cliente + cidade) e a instrução em itálico. */
function describeDocumentChoices(documents: readonly GroupDeliveryDocument[]): string {
  const options = documents
    .slice(0, BATCH_LIMIT)
    .map((document) => ({ action: describeDocument(document), icon: '🧾' }))
  return [formatOptions(options), '', formatReplyHint(DOCUMENT_REPLY_HINT)].join('\n')
}

export function createGroupDeliveryFlow(ports: GroupDeliveryFlowPorts) {
  /** Tripulação baixa em nome do motorista do grupo; atendente, em nome dele pelo escritório (RF19/RF20). */
  async function actorOf(turn: GroupFlowTurn): Promise<'refused' | null | WhatsAppDriverActor> {
    const { companyId, driverId } = turn.request
    const role = await ports.resolveSenderRole?.({ companyId, driverId, phone: turn.sender })
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

  /**
   * "entreguei" sem número: a entrega aberta é retomada; sem ela, a parada em andamento decide (uma nota segue direto,
   * com o bloco da parada; várias, a pergunta lista só as dela). `null`: nada em andamento.
   */
  async function continueInProgress(turn: GroupFlowTurn): Promise<GroupFlowOutcome | null> {
    const actor = await actorOf(turn)
    if (actor !== null && actor !== 'refused') {
      const resumed = await ports.preparations.resume?.({ actor })
      if (resumed !== null && resumed !== undefined && resumed.texts.length > 0) {
        return toOutcome({ ...resumed, texts: joinedTexts(resumed.texts) })
      }
    }
    const stop = await ports.findStopInProgress?.({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
    })
    if (stop === null || stop === undefined) return null
    const [only] = stop.documents
    if (stop.documents.length === 1 && only !== undefined) {
      const prepared = await prepare(turn, only)
      return stop.header === null || prepared.kind === 'not_understood'
        ? prepared
        : { ...prepared, replies: joinedTexts([stop.header, ...prepared.replies]) }
    }
    return askDocument(stop.documents)
  }

  function askDocument(documents: readonly GroupDeliveryDocument[]): GroupFlowOutcome {
    const state: FlowState = { documents: documents.slice(0, 8) }
    return {
      kind: 'continue',
      replies: [GROUP_DELIVERY_TEXT.askDocument(documents)],
      state,
      step: GROUP_DELIVERY_STEP.choose,
    }
  }

  async function deliverBatch(
    turn: GroupFlowTurn,
    actor: WhatsAppDriverActor,
    numbers: readonly string[],
  ): Promise<GroupFlowOutcome> {
    const deliver = ports.deliverAsAttendant
    if (deliver === undefined) return { kind: 'done', replies: [GROUP_DELIVERY_TEXT.oneAtATime] }
    if (numbers.length > BATCH_LIMIT || numbers.includes('')) {
      return { kind: 'done', replies: [GROUP_DELIVERY_TEXT.tooManyNotes(BATCH_LIMIT)] }
    }
    const documents = await ports.listOpenDocuments({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
    })
    const wanted = numbers.map(strip)
    const found = wanted.flatMap((number) => {
      const document = documents.find((item) => strip(item.number) === number)
      return document === undefined ? [] : [{ document, number }]
    })
    const settled = await Promise.allSettled(
      found.map(({ document }) =>
        deliver({
          ...actor,
          documentId: document.id,
          idempotencyKey: `whatsapp-group-request:${turn.request.id}:${document.id}`,
          location: null,
        }),
      ),
    )
    const outcomes = {
      alreadyDone: [] as string[],
      failed: [] as string[],
      missing: wanted.filter((number) => !found.some((item) => item.number === number)),
      pendingProof: [] as string[],
      registered: [] as string[],
    }
    settled.forEach((result, index) => {
      const number = found[index]?.number ?? ''
      if (result.status === 'rejected') return void outcomes.failed.push(number)
      const value = result.value
      if (value.kind === 'already_registered') return void outcomes.alreadyDone.push(number)
      if (value.kind === 'refused') return void outcomes.failed.push(number)
      outcomes.registered.push(number)
      if (value.details?.proofPending === true) outcomes.pendingProof.push(number)
    })
    return { kind: 'done', replies: [formatAttendantBatch(outcomes)] }
  }

  async function reply(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
    const actor = await actorOf(turn)
    if (actor === 'refused') {
      return { kind: 'not_understood', prompt: '', reason: SENDER_NOT_ALLOWED_TEXT }
    }
    if (actor === null) return notUnderstood()
    const answered = await ports.preparations.answer({ actor, text: turn.text })
    if (answered !== null) return toOutcome(answered)
    // Spec 294 RF22: pediu foto ou localização e veio fala: o pedido é repetido dizendo que o item vai por mídia.
    const again = await ports.preparations.repeatMediaRequest?.({ actor })
    if (again === null || again === undefined) return notUnderstood()
    const [reason = REASON.answer, ...prompt] = again.texts
    return { kind: 'not_understood', prompt: prompt.join('\n'), reason }
  }

  return {
    /** "entreguei" (com ou sem a nota), pelo comando direto ou pelo menu. */
    async begin(turn: GroupFlowTurn, numbers: readonly string[]): Promise<GroupFlowOutcome> {
      const actor = await actorOf(turn)
      if (actor === 'refused') return refusedOutcome()
      if (numbers.length > 1) {
        // Spec 294 RF21: o lote é do atendente; a tripulação segue uma nota por vez.
        if (actor === null || actor.attendant !== true || ports.deliverAsAttendant === undefined) {
          return { kind: 'done', replies: [GROUP_DELIVERY_TEXT.oneAtATime] }
        }
        return deliverBatch(turn, actor, numbers)
      }
      const [number] = numbers
      if (number === undefined) {
        const inProgress = await continueInProgress(turn)
        if (inProgress !== null) return inProgress
      }
      const documents = await ports.listOpenDocuments({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
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
      return askDocument(documents)
    },

    async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      if (turn.request.step === GROUP_DELIVERY_STEP.choose) {
        const documents = (turn.request.state as FlowState).documents ?? []
        const picked = pickDocument(documents, turn.text)
        if (picked === undefined) {
          return {
            kind: 'not_understood',
            prompt: describeDocumentChoices(documents),
            reason: REASON.document,
          }
        }
        return prepare(turn, picked)
      }
      return reply(turn)
    },

    /** A resposta em texto a uma entrega em preparo (o roteador já conferiu que há uma esperando). */
    reply,

    /**
     * "Cancelar" com a pergunta da entrega aberta: a lista de notas só deixa o pedido fechar (`null`); a entrega em
     * preparo é encerrada sem registrar nada. Nunca vira resposta ("não achei essa nota na lista").
     */
    async cancel(turn: GroupFlowTurn): Promise<GroupFlowOutcome | null> {
      if (turn.request.step === GROUP_DELIVERY_STEP.choose) return null
      const actor = await actorOf(turn)
      if (actor === null || actor === 'refused') return null
      const answered = await ports.preparations.answer({ actor, text: turn.text })
      return answered === null ? null : toOutcome(answered)
    },

    /** Há entrega ou ocorrência em coleta aberta deste motorista? (RNF1: a oferta da rota não pergunta por cima.) */
    hasOpen(turn: GroupFlowTurn): Promise<boolean> {
      return ports.preparations.hasOpen({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
    },

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
  readonly finished?: boolean
  readonly routeContinuation?: WhatsAppRouteContinuation
  readonly texts: readonly string[]
}): GroupFlowOutcome {
  // A entrega ainda aberta esperando foto ou localização também segura o pedido: o "pular" responde sem marcar o bot,
  // e a mídia chega pela porta das provas (a pergunta seguinte cai no mesmo passo).
  if (reply.awaitingText || reply.finished === false) {
    return { kind: 'continue', replies: reply.texts, state: {}, step: GROUP_DELIVERY_STEP.answer }
  }
  return {
    kind: 'done',
    replies: reply.texts,
    ...(reply.routeContinuation === undefined
      ? {}
      : { routeContinuation: reply.routeContinuation }),
  }
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
