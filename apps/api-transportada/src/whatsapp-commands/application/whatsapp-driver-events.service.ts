/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T11 — **os eventos da entrega que o motorista lança pelo WhatsApp, num lugar só.** Saí,
 * cheguei, entreguei, devolvi e ocorrência, sem saber de grupo, de botão nem de provedor: o grupo do
 * motorista (Evolution, spec 292) e a conversa individual (Meta, spec 144) só perguntam e confirmam,
 * e chamam estas funções.
 *
 * ⚠️ Nada aqui é caminho paralelo. Cada porta é a MESMA função composta das rotas `/me` do app
 * (`reportStopDeparture`, `reportStopArrival`, `reportDocumentDelivery`, `reportDocumentReturn`,
 * `registerDriverOccurrence`), montada em `main.ts` com `channel: 'whatsapp'`: mesma política de
 * estado, mesma idempotência, mesmo evento em `trip_stop_events`. O que esta camada faz é só
 * traduzir o retorno e os erros conhecidos num **resultado tipado** — registrado, já estava
 * registrado, ou recusado com um motivo — que as falas (`whatsapp-driver-event-speech.service.ts`)
 * transformam em texto para o motorista ou para o grupo.
 *
 * Erro que não é recusa de negócio (banco fora, bug) **sobe**: quem chama decide se loga e responde
 * "tente de novo" (grupo) ou deixa o despachante tratar (individual).
 */
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { DriverReturnReason } from '../../trips/domain/driver-return-reason.policy.js'
import { OccurrenceTypeNotAvailableForContractorError } from '../../trips/domain/occurrence-type-contractor-scope.error.js'
import type { TripTransitionBlock } from '../../trips/domain/trip-state.policy.js'
import {
  OccurrenceItemQuantityAboveDocumentError,
  TripDocumentNotReachableError,
  TripHasStopEnRouteError,
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceDeclaredAmountRequiredError,
  TripOccurrenceItemsMinimumNotMetError,
  TripOccurrenceItemsRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrencePhotoMinimumNotMetError,
  TripOccurrenceReferenceNumberRequiredError,
  TripOccurrenceSignatureRequiredError,
  TripStateTransitionNotAllowedError,
  TripStopNotReachableError,
} from '../../trips/domain/trip.error.js'
import { TripStopOutOfOrderError } from '../../trips/domain/stop-order.error.js'

export const WHATSAPP_DRIVER_EVENT = {
  arrive: 'arrive',
  depart: 'depart',
  deliver: 'deliver',
  occurrence: 'occurrence',
  return: 'return',
} as const

export type WhatsAppDriverEvent = (typeof WHATSAPP_DRIVER_EVENT)[keyof typeof WHATSAPP_DRIVER_EVENT]

/**
 * O campo que a exigência efetiva do tipo pede e o servidor recusou (spec 246). `contractor_scope` é
 * o tipo que não vale para a contratante da nota (spec 270): volta à lista de tipos.
 */
export type OccurrenceRequirementField =
  | 'contractor_scope'
  | 'declared_amount'
  | 'items'
  | 'note'
  | 'photo'
  | 'reference_number'
  | 'signature'

/** Por que o evento não foi gravado. Só motivo de negócio, nunca dado do cliente. */
export type WhatsAppDriverEventRefusal =
  /** O número/conta não está ligado a uma ficha de motorista (conversa individual). */
  | { readonly code: 'driver_not_linked' }
  /** A ficha do grupo não tem conta ativa no app; o evento precisa ficar no nome dele (grupo). */
  | { readonly code: 'driver_without_access' }
  | { readonly code: 'document_not_reachable' }
  | { readonly code: 'stop_not_reachable' }
  /** Uma parada a caminho por vez (spec 206 D4): a outra precisa chegar antes. */
  | { readonly code: 'stop_en_route'; readonly enRouteStopSequence: string }
  /** Spec 294 RF25: a parada não é a em andamento nem a próxima do roteiro (a pergunta 1/2 vem na T4.10). */
  | {
      readonly code: 'stop_out_of_order'
      readonly currentSequence: number | null
      readonly nextSequence: number | null
      readonly requestedSequence: number
    }
  /** O portão de estado da nota/viagem (`checkTripDocumentTransition`). */
  | { readonly code: 'transition_blocked'; readonly reason: TripTransitionBlock }
  | { readonly code: 'occurrence_requirement'; readonly field: OccurrenceRequirementField }

/** O que a baixa devolve e as falas usam; ausente conta como `false` (porta antiga). */
export type WhatsAppDocumentOutcomeDetails = {
  /** ADR-0070 §1: entregue, foto obrigatória e ainda sem foto. A T15 passa a colher antes da baixa. */
  readonly proofPending: boolean
  readonly stopCompleted: boolean
  readonly tripCompleted: boolean
}

export type WhatsAppDriverEventResult =
  | {
      readonly details?: WhatsAppDocumentOutcomeDetails
      readonly event: WhatsAppDriverEvent
      readonly kind: 'registered'
    }
  | { readonly event: WhatsAppDriverEvent; readonly kind: 'already_registered' }
  | {
      readonly event: WhatsAppDriverEvent
      readonly kind: 'refused'
      readonly refusal: WhatsAppDriverEventRefusal
    }

/** Quem lança: o motorista (ficha) e a conta dele, já resolvidos pelo canal. */
export type WhatsAppDriverActor = {
  readonly actorUserId: string
  /**
   * Spec 294 RF18/RF19: quem manda é um atendente cadastrado, não o motorista. `actorUserId` é o
   * usuário dele, `driverId` o motorista da viagem, e a baixa vai pelo caminho do escritório.
   */
  readonly attendant?: true
  readonly companyId: string
  readonly driverId: string
}

type EventBase = WhatsAppDriverActor & {
  /** Por pedido do canal: a mesma confirmação repetida não grava duas vezes. */
  readonly idempotencyKey: string
  /** O ponto compartilhado pelo motorista; `null` grava `unavailable` (nunca segura o evento). */
  readonly location: ReportedLocation | null
}

export type WhatsAppStopEventInput = EventBase & {
  /** Hora em que o motorista mandou a mensagem — o "toque" da saída/chegada (ADR-0088 §4). */
  readonly sentAt: Date
  readonly stopId: string
}

export type WhatsAppDocumentEventInput = EventBase & { readonly documentId: string }

export type WhatsAppReturnEventInput = WhatsAppDocumentEventInput & {
  readonly reason: DriverReturnReason
}

export type WhatsAppOccurrenceEventInput = WhatsAppDocumentEventInput &
  WhatsAppOccurrenceCollectedFields & {
    readonly note: string
    readonly occurrenceTypeId: string
  }

/**
 * Spec 293 T15: o que a ocorrência em coleta juntou (fotos já confirmadas como upload de ocorrência,
 * número do documento do cliente e valor pago). Ausente é não colhido, como no app.
 */
export type WhatsAppOccurrenceCollectedFields = {
  readonly attachmentObjectIds?: readonly string[] | undefined
  readonly declaredAmount?: string | undefined
  readonly referenceNumber?: string | undefined
}

type DocumentOutcome = {
  readonly alreadySettled: boolean
  readonly proofPending?: boolean
  readonly stopCompleted?: boolean
  readonly tripCompleted?: boolean
}

/** As funções do app, já com `channel: 'whatsapp'` e o relógio do servidor (composição em `main.ts`). */
export type WhatsAppDriverEventPorts = {
  readonly registerOccurrence: (
    input: WhatsAppOccurrenceCollectedFields & {
      readonly actorUserId: string
      readonly companyId: string
      readonly documentId: string
      readonly driverId: string
      readonly idempotencyKey: string
      readonly location: ReportedLocation | null
      readonly note: string
      readonly occurrenceTypeId: string
      readonly productCode: string
    },
  ) => Promise<unknown>
  /** Chegar de novo não reescreve a hora (spec 057): o retorno não diz se já estava. */
  readonly reportArrival: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
    readonly stopId: string
    readonly tappedAt: Date
  }) => Promise<unknown>
  readonly reportDelivery: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
  }) => Promise<DocumentOutcome>
  /** `changed: false` é a parada já a caminho/chegada/concluída, ou o toque velho (spec 206 D2). */
  readonly reportDeparture: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
    readonly stopId: string
    readonly tappedAt: Date
  }) => Promise<{ readonly changed: boolean }>
  readonly reportReturn: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
    readonly reason: DriverReturnReason
  }) => Promise<DocumentOutcome>
}

export type WhatsAppDriverEvents = {
  readonly arrive: (input: WhatsAppStopEventInput) => Promise<WhatsAppDriverEventResult>
  readonly depart: (input: WhatsAppStopEventInput) => Promise<WhatsAppDriverEventResult>
  readonly deliver: (input: WhatsAppDocumentEventInput) => Promise<WhatsAppDriverEventResult>
  readonly registerOccurrence: (
    input: WhatsAppOccurrenceEventInput,
  ) => Promise<WhatsAppDriverEventResult>
  readonly returnDocument: (input: WhatsAppReturnEventInput) => Promise<WhatsAppDriverEventResult>
}

/** Resultado de recusa montado pelo canal (motorista não resolvido), com o mesmo formato. */
export function refuseWhatsAppDriverEvent(
  event: WhatsAppDriverEvent,
  refusal: WhatsAppDriverEventRefusal,
): WhatsAppDriverEventResult {
  return { event, kind: 'refused', refusal }
}

export async function departWhatsAppDriverStop(
  ports: Pick<WhatsAppDriverEventPorts, 'reportDeparture'>,
  input: WhatsAppStopEventInput,
): Promise<WhatsAppDriverEventResult> {
  const event = WHATSAPP_DRIVER_EVENT.depart
  return settleWhatsAppDriverEvent(event, async () => {
    const outcome = await ports.reportDeparture({
      ...actorOf(input),
      idempotencyKey: input.idempotencyKey,
      location: input.location,
      stopId: input.stopId,
      tappedAt: input.sentAt,
    })
    return outcome.changed ? { event, kind: 'registered' } : { event, kind: 'already_registered' }
  })
}

export async function arriveWhatsAppDriverStop(
  ports: Pick<WhatsAppDriverEventPorts, 'reportArrival'>,
  input: WhatsAppStopEventInput,
): Promise<WhatsAppDriverEventResult> {
  const event = WHATSAPP_DRIVER_EVENT.arrive
  return settleWhatsAppDriverEvent(event, async () => {
    await ports.reportArrival({
      ...actorOf(input),
      idempotencyKey: input.idempotencyKey,
      location: input.location,
      stopId: input.stopId,
      tappedAt: input.sentAt,
    })
    return { event, kind: 'registered' }
  })
}

export async function deliverWhatsAppDriverDocument(
  ports: Pick<WhatsAppDriverEventPorts, 'reportDelivery'>,
  input: WhatsAppDocumentEventInput,
): Promise<WhatsAppDriverEventResult> {
  const event = WHATSAPP_DRIVER_EVENT.deliver
  return settleWhatsAppDriverEvent(event, async () =>
    toWhatsAppDocumentResult(
      event,
      await ports.reportDelivery({
        ...actorOf(input),
        documentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        location: input.location,
      }),
    ),
  )
}

export async function returnWhatsAppDriverDocument(
  ports: Pick<WhatsAppDriverEventPorts, 'reportReturn'>,
  input: WhatsAppReturnEventInput,
): Promise<WhatsAppDriverEventResult> {
  const event = WHATSAPP_DRIVER_EVENT.return
  return settleWhatsAppDriverEvent(event, async () =>
    toWhatsAppDocumentResult(
      event,
      await ports.reportReturn({
        ...actorOf(input),
        documentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        location: input.location,
        reason: input.reason,
      }),
    ),
  )
}

export async function registerWhatsAppDriverOccurrence(
  ports: Pick<WhatsAppDriverEventPorts, 'registerOccurrence'>,
  input: WhatsAppOccurrenceEventInput,
): Promise<WhatsAppDriverEventResult> {
  const event = WHATSAPP_DRIVER_EVENT.occurrence
  return settleWhatsAppDriverEvent(event, async () => {
    await ports.registerOccurrence({
      ...actorOf(input),
      documentId: input.documentId,
      idempotencyKey: input.idempotencyKey,
      location: input.location,
      note: input.note,
      occurrenceTypeId: input.occurrenceTypeId,
      productCode: '',
      ...collectedFieldsOf(input),
    })
    return { event, kind: 'registered' }
  })
}

/** Só o que foi colhido: chave ausente é "não informado" (`exactOptionalPropertyTypes`). */
function collectedFieldsOf(
  input: WhatsAppOccurrenceCollectedFields,
): WhatsAppOccurrenceCollectedFields {
  return {
    ...(input.attachmentObjectIds === undefined || input.attachmentObjectIds.length === 0
      ? {}
      : { attachmentObjectIds: input.attachmentObjectIds }),
    ...(input.declaredAmount === undefined ? {} : { declaredAmount: input.declaredAmount }),
    ...(input.referenceNumber === undefined ? {} : { referenceNumber: input.referenceNumber }),
  }
}

/** Os cinco eventos amarrados às portas do app — o que grupo e individual recebem. */
export function createWhatsAppDriverEvents(ports: WhatsAppDriverEventPorts): WhatsAppDriverEvents {
  return {
    arrive: (input) => arriveWhatsAppDriverStop(ports, input),
    depart: (input) => departWhatsAppDriverStop(ports, input),
    deliver: (input) => deliverWhatsAppDriverDocument(ports, input),
    registerOccurrence: (input) => registerWhatsAppDriverOccurrence(ports, input),
    returnDocument: (input) => returnWhatsAppDriverDocument(ports, input),
  }
}

/**
 * O erro conhecido das funções do app vira o motivo da recusa; `undefined` é erro que não é de
 * negócio e deve subir.
 */
export function classifyWhatsAppDriverEventError(
  error: unknown,
): WhatsAppDriverEventRefusal | undefined {
  if (error instanceof TripStateTransitionNotAllowedError) {
    return { code: 'transition_blocked', reason: error.reason }
  }
  if (error instanceof TripDocumentNotReachableError) return { code: 'document_not_reachable' }
  if (error instanceof TripStopNotReachableError) return { code: 'stop_not_reachable' }
  if (error instanceof TripHasStopEnRouteError) {
    return { code: 'stop_en_route', enRouteStopSequence: error.enRouteStopSequence }
  }
  if (error instanceof TripStopOutOfOrderError) {
    return {
      code: 'stop_out_of_order',
      currentSequence: error.violation.currentSequence,
      nextSequence: error.violation.nextSequence,
      requestedSequence: error.violation.requestedSequence,
    }
  }
  const field = classifyOccurrenceRequirement(error)
  return field === undefined ? undefined : { code: 'occurrence_requirement', field }
}

function classifyOccurrenceRequirement(error: unknown): OccurrenceRequirementField | undefined {
  if (error instanceof TripOccurrenceNoteRequiredError) return 'note'
  if (error instanceof TripOccurrenceSignatureRequiredError) return 'signature'
  if (
    error instanceof TripOccurrenceAttachmentRequiredError ||
    error instanceof TripOccurrencePhotoMinimumNotMetError
  ) {
    return 'photo'
  }
  if (
    error instanceof TripOccurrenceItemsRequiredError ||
    error instanceof TripOccurrenceItemsMinimumNotMetError
  ) {
    return 'items'
  }
  if (error instanceof TripOccurrenceReferenceNumberRequiredError) return 'reference_number'
  if (
    error instanceof TripOccurrenceDeclaredAmountRequiredError ||
    error instanceof OccurrenceItemQuantityAboveDocumentError
  ) {
    return 'declared_amount'
  }
  if (error instanceof OccurrenceTypeNotAvailableForContractorError) return 'contractor_scope'
  return undefined
}

export async function settleWhatsAppDriverEvent(
  event: WhatsAppDriverEvent,
  run: () => Promise<WhatsAppDriverEventResult>,
): Promise<WhatsAppDriverEventResult> {
  try {
    return await run()
  } catch (error) {
    const refusal = classifyWhatsAppDriverEventError(error)
    if (refusal === undefined) throw error
    return { event, kind: 'refused', refusal }
  }
}

export function toWhatsAppDocumentResult(
  event: WhatsAppDriverEvent,
  outcome: DocumentOutcome,
): WhatsAppDriverEventResult {
  if (outcome.alreadySettled) return { event, kind: 'already_registered' }
  return {
    details: {
      proofPending: outcome.proofPending ?? false,
      stopCompleted: outcome.stopCompleted ?? false,
      tripCompleted: outcome.tripCompleted ?? false,
    },
    event,
    kind: 'registered',
  }
}

function actorOf(input: WhatsAppDriverActor): WhatsAppDriverActor {
  return {
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    driverId: input.driverId,
  }
}
