/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T015 — o motorista entrega, devolve e registra ocorrência pela conversa do WhatsApp.
 *
 * ⚠️ Nada aqui é caminho paralelo: `reportDelivery`/`reportReturn`/`registerOccurrence` são as
 * MESMAS funções compostas que `createMeTripRoutes` (`me-trip.routes.ts`) injeta nas rotas
 * `POST /me/trips/current/documents/:documentId/{deliver,return}` e `.../occurrences` do PWA — o
 * motorista pelo WhatsApp grava o mesmo evento, pela mesma política de estado
 * (`checkTripDocumentTransition`), que o motorista pelo aplicativo.
 *
 * O grafo (`whatsapp-flow-graph.constant.ts`) não tem opção estática para nota, motivo de devolução
 * dinâmico ou tipo de ocorrência: essas listas variam por viagem/empresa. O padrão usado é sempre o
 * mesmo par `action → entrada_choice`: o nó de ação busca os dados, manda a mensagem ela mesma (via
 * `channel`, nunca via `context` — título com nome de destinatário nunca é persistido) e aponta para
 * um nó `entrada_choice` sem opções estáticas, que só captura o texto/id da resposta em
 * `context[contextKey]`; um segundo nó de ação (o "roteador") lê essa captura e decide: página
 * (`__more__`/`__back__`, reencaminha para o mesmo nó de ação) ou resposta real (segue o fluxo).
 */
import { randomUUID } from 'node:crypto'

import type {
  ChannelAdapterInterface,
  FlowActionResult,
} from '@adatechnology/meta-whatsapp-contracts'

import type {
  OccurrenceTypeRecord,
  TripOccurrence,
} from '../../trips/application/register-trip-occurrence.use-case.js'
import type {
  DriverTrip,
  DriverTripDocument,
  FindCurrentDriverTripResult,
} from '../../trips/application/find-current-driver-trip.use-case.js'
import {
  isDriverReturnReason,
  type DriverReturnReason,
} from '../../trips/domain/driver-return-reason.policy.js'
import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import { OCCURRENCE_MOMENT } from '../../shared/trip-occurrence.constant.js'
import { occurrenceTypeAcceptsMoment } from '../../trips/domain/occurrence-moment.policy.js'
import type { WhatsAppDriverEventCommand } from '../domain/whatsapp-driver-event-command.policy.js'
import {
  describeStopReference,
  resolveArrivalStop,
  resolveDepartureStop,
  type WhatsAppStopResolution,
} from '../../trips/domain/driver-stop-resolution.policy.js'
import {
  DRIVER_DIRECT_CONFIRM_ANSWER,
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
  DRIVER_FLOW_STEP,
  DRIVER_NOTE_SKIP_ANSWER,
  DRIVER_OCCURRENCE_NOTE_MAX_LENGTH,
  DRIVER_RETURN_REASON_LABELS,
  type DriverFlowStep,
} from '../domain/whatsapp-driver-flow.constant.js'
import { WHATSAPP_LIST_BUTTON_TEXT } from '../domain/whatsapp-menu.constant.js'
import { parseMenuPageNavigation, type WhatsAppMenuOption } from '../domain/whatsapp-menu.policy.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  readDriverPrompt,
} from '../domain/whatsapp-driver-prompt.policy.js'
import type { RouteOfferStop } from '../domain/whatsapp-driver-route-offer.policy.js'
import { buildRouteOfferReply } from './whatsapp-driver-prompts.service.js'
import { occurrenceRequirementNextNode } from './driver-occurrence-refusal.service.js'
import { describeWhatsAppDriverEventResult } from './whatsapp-driver-event-speech.service.js'
import {
  arriveWhatsAppDriverStop,
  deliverWhatsAppDriverDocument,
  departWhatsAppDriverStop,
  registerWhatsAppDriverOccurrence,
  returnWhatsAppDriverDocument,
  type WhatsAppDriverEventResult,
  type WhatsAppDriverEventPorts,
} from './whatsapp-driver-events.service.js'
import { sendDynamicChoice } from './whatsapp-dynamic-choice.service.js'
import type { WhatsAppSharedLocationStore } from './whatsapp-shared-location.service.js'
import type { WhatsAppOccurrenceDrafts } from './whatsapp-occurrence-draft.service.js'
import type { WhatsAppDeliveryPreparations } from './whatsapp-delivery-preparation.service.js'
import {
  rejectListAnswer,
  WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET,
} from './whatsapp-list-answer.service.js'
import {
  CATALOG_BOT_SPEECH,
  createBotSayer,
  type WhatsAppBotSpeechPort,
} from './whatsapp-bot-speech.service.js'
import type {
  WhatsAppAuthorizedActionHandler,
  WhatsAppFlowActionDefinition,
} from './with-authorized-actor.service.js'

const DRIVER_READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const DRIVER_REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const
/**
 * Spec 293 T11: a plateia das falas dos eventos. Portão recusado (409) e nota inalcançável viram
 * mensagem clara — nunca erro cru (D7).
 */
const DRIVER = { kind: 'driver' } as const

type ReportOutcome = {
  readonly alreadySettled: boolean
  readonly nextStop?: RouteOfferStop | null
  readonly proofPending?: boolean
  readonly stopCompleted?: boolean
  readonly tripCompleted?: boolean
}

export type DriverFlowActionDependencies = {
  /**
   * Spec 293 T15: "Entregar" abre a entrega em preparo da nota (provas antes da baixa). Ausente, a
   * baixa é direta, como antes.
   */
  readonly deliveryPreparations?: WhatsAppDeliveryPreparations
  /**
   * Spec 293 T15: o tipo que pede foto, número do documento do cliente ou valor pago abre a ocorrência
   * em coleta em vez da recusa "registre pelo aplicativo". Ausente, a recusa de sempre.
   */
  readonly occurrenceDrafts?: WhatsAppOccurrenceDrafts
  /** Spec 286 T8: as falas vêm do grafo publicado; sem isto, o padrão do código. */
  readonly speech?: WhatsAppBotSpeechPort
  /** Spec 196 T3.6: o ponto que o motorista mandou antes do toque; `null` é `unavailable`. */
  readonly consumeSharedLocation: WhatsAppSharedLocationStore['consume']
  readonly findCurrentTrip: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<FindCurrentDriverTripResult>
  /** Spec 270: com `documentId` a lista já vem filtrada pela contratante da nota; sem ele, só os tipos `all`. */
  readonly listOccurrenceTypes: (input: {
    readonly companyId: string
    readonly documentId?: string | undefined
  }) => Promise<readonly OccurrenceTypeRecord[]>
  /** Spec 293 T15: com o que a ocorrência em coleta juntou (fotos, número, valor pago). */
  readonly registerOccurrence: (
    input: Parameters<WhatsAppDriverEventPorts['registerOccurrence']>[0],
  ) => Promise<TripOccurrence>
  /** Spec 293 T14: "Cheguei" — a mesma função da rota `/me` (portas da camada T11). */
  readonly reportArrival: WhatsAppDriverEventPorts['reportArrival']
  /** Spec 293 T14: "Saí para a entrega". */
  readonly reportDeparture: WhatsAppDriverEventPorts['reportDeparture']
  /** Relógio do toque de saí/cheguei; ausente, a hora do servidor. */
  readonly now?: () => Date
  readonly reportDelivery: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
  }) => Promise<ReportOutcome>
  readonly reportReturn: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: ReportedLocation | null
    readonly reason: DriverReturnReason
  }) => Promise<ReportOutcome>
  readonly resolveDriverId: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<string | null>
}

function isOpenDocument(document: DriverTripDocument): boolean {
  return document.separationStatus !== 'delivered' && document.separationStatus !== 'returned'
}

function listOpenDocuments(trip: DriverTrip): readonly DriverTripDocument[] {
  return trip.stops.flatMap((stop) => stop.documents.filter(isOpenDocument))
}

function toDocumentOption(document: DriverTripDocument): WhatsAppMenuOption {
  return { id: document.id, title: `${document.number} · ${document.recipientName}` }
}

function readPage(context: Record<string, unknown>): number {
  const page = context[DRIVER_FLOW_CONTEXT_KEY.listPage]
  return typeof page === 'number' && page > 0 ? page : 1
}

function readStringContext(context: Record<string, unknown>, key: string): string | undefined {
  const value = context[key]
  return typeof value === 'string' ? value : undefined
}

/** Número da NF como o motorista digita: "017234" e "17234" são a mesma nota. */
function sameDocumentNumber(left: string, right: string): boolean {
  const strip = (value: string) => value.trim().replace(/^0+(?=\d)/u, '')
  return strip(left) === strip(right)
}

function firstDocumentNumber(stop: {
  readonly documents: readonly { readonly number: string }[]
}): string | undefined {
  return stop.documents[0]?.number.replace(/^0+(?=\d)/u, '')
}

function readStringList(context: Record<string, unknown>, key: string): readonly string[] {
  const value = context[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

const DIRECT_COMMAND_KINDS = ['arrive', 'deliver', 'depart', 'return', 'too_many_documents']

/** O comando direto vem do jsonb da sessão: confere o formato em vez de confiar nele. */
function readDirectCommand(
  context: Record<string, unknown>,
): WhatsAppDriverEventCommand | undefined {
  const value = context[DRIVER_FLOW_CONTEXT_KEY.directCommand]
  if (typeof value !== 'object' || value === null) return undefined
  const { kind, numbers, reason } = value as Record<string, unknown>
  if (typeof kind !== 'string' || !DIRECT_COMMAND_KINDS.includes(kind)) return undefined
  const list = Array.isArray(numbers)
    ? numbers.filter((item): item is string => typeof item === 'string')
    : []
  if (kind === 'deliver') return { kind, numbers: list }
  if (kind === 'return') {
    return isDriverReturnReason(reason) ? { kind, numbers: list, reason } : { kind, numbers: list }
  }
  return { kind } as WhatsAppDriverEventCommand
}

/** "2 entregues, 1 já estava registrada, 1 recusada." — sem dado de cliente. */
function summarizeBatch(results: readonly WhatsAppDriverEventResult[]): string {
  const registered = results.filter((result) => result.kind === 'registered').length
  const already = results.filter((result) => result.kind === 'already_registered').length
  const refused = results.filter((result) => result.kind === 'refused').length
  const parts = [
    `${registered} registrada(s)`,
    ...(already > 0 ? [`${already} já estava(m) registrada(s)`] : []),
    ...(refused > 0 ? [`${refused} recusada(s)`] : []),
  ]
  return `${parts.join(', ')}.`
}

function toStepLabel(step: DriverFlowStep): string {
  if (step === DRIVER_FLOW_STEP.deliver) return 'entregar'
  if (step === DRIVER_FLOW_STEP.return) return 'devolver'
  return 'registrar ocorrência para'
}

/**
 * Spec 144 T015 — as `FlowAction`s do ramo "Minha viagem" (D7/AC7). Cada `WhatsAppFlowActionDefinition`
 * carrega a política certa: leitura (`trip.read`) para consultar a viagem, ação (`trip.report`) para
 * qualquer coisa que grave algo. `withAuthorizedActor` (T006) já resolve o ator de novo a cada
 * chamada — o handler recebe `actor` pronto e nunca confia em nada do `context`/`session` para isso.
 */
export function createDriverWhatsAppFlowActions(
  deps: DriverFlowActionDependencies,
): readonly WhatsAppFlowActionDefinition[] {
  const say = createBotSayer(deps.speech ?? CATALOG_BOT_SPEECH)

  /** Spec 225: a lista do app traz a concluída recente; a conversa só trabalha viagem em andamento. */
  async function findCurrentTrip(
    input: Parameters<DriverFlowActionDependencies['findCurrentTrip']>[0],
  ): Promise<FindCurrentDriverTripResult> {
    const result = await deps.findCurrentTrip(input)

    return {
      ...result,
      trips: result.trips.filter(
        (trip) => !(TRIP_TERMINAL_STATUSES as readonly string[]).includes(trip.status),
      ),
    }
  }

  /** O número da nota como o motorista o vê (sem zeros à esquerda), da viagem em andamento. */
  async function findDocumentNumber(
    actor: Parameters<WhatsAppAuthorizedActionHandler>[0]['actor'],
    documentId: string,
  ): Promise<string | undefined> {
    const result = await findCurrentTrip({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    const number = result.trips
      .flatMap((trip) => trip.stops)
      .flatMap((stop) => stop.documents)
      .find((document) => document.id === documentId)?.number
    return number?.replace(/^0+(?=\d)/u, '')
  }

  /** Só as três ações do motorista chamam isto; a do operador não recebe o armazém. */
  function consumeLocation(input: {
    readonly actor: Parameters<WhatsAppAuthorizedActionHandler>[0]['actor']
    readonly session: Parameters<WhatsAppAuthorizedActionHandler>[0]['session']
  }): ReportedLocation | null {
    return deps.consumeSharedLocation({
      companyId: input.actor.scope.companyId,
      whatsappNumber: input.session.whatsappNumber,
    })
  }

  const currentTrip: WhatsAppAuthorizedActionHandler = async ({ actor, channel, session }) => {
    const result = await findCurrentTrip({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (!result.isRegisteredDriver) {
      await say({ actor, channel, session }, 'driverNotLinkedOffice')
      return { next: 'menu' }
    }
    const trip = result.trips[0]
    if (trip === undefined) {
      await say({ actor, channel, session }, 'driverNoActiveTrip')
      return { next: 'menu' }
    }

    return {
      context: { [DRIVER_FLOW_CONTEXT_KEY.tripId]: trip.id },
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }

  const listDocuments: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const step = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice) as
      | DriverFlowStep
      | undefined
    const tripId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripId)
    if (step === undefined || tripId === undefined) return { next: 'menu' }

    const trip = await findTripById({ actor, tripId })
    if (trip === undefined) {
      await say({ actor, channel, session }, 'tripUnavailable')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }

    const documents = listOpenDocuments(trip)
    if (documents.length === 0) {
      await say({ actor, channel, session }, 'driverNoPendingDocuments')
      return {
        context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
        next: DRIVER_FLOW_NODE.tripMenu,
      }
    }

    await sendDynamicChoice({
      body: `Toque na nota que você quer ${toStepLabel(step)}.`,
      channel,
      options: documents.map(toDocumentOption),
      page: readPage(context),
      to: session.whatsappNumber,
    })
    return { context: WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET, next: DRIVER_FLOW_NODE.documentEntry }
  }

  const documentRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    node,
    session,
  }) => {
    const answer = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.documentAnswer)
    const step = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice) as
      | DriverFlowStep
      | undefined
    if (answer === undefined || step === undefined) return { next: 'menu' }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return {
        context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: page },
        next: DRIVER_FLOW_NODE.listDocuments,
      }
    }

    // T020 (B5): a resposta é conferida contra as notas da viagem relida, nunca usada crua como id.
    const tripId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripId)
    const trip = tripId === undefined ? undefined : await findTripById({ actor, tripId })
    if (trip === undefined) {
      await say({ actor, channel, session }, 'tripUnavailable')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }
    const offered = trip.stops.some((stop) =>
      stop.documents.some((document) => document.id === answer),
    )
    if (!offered) {
      return rejectListAnswer({
        channel,
        context,
        entryNode: DRIVER_FLOW_NODE.documentEntry,
        node,
        session,
      })
    }

    const documentId = answer
    if (step === DRIVER_FLOW_STEP.deliver) {
      const documentNumber = trip.stops
        .flatMap((stop) => stop.documents)
        .find((document) => document.id === documentId)?.number
      return completeDelivery({ actor, channel, documentId, documentNumber, session })
    }
    if (step === DRIVER_FLOW_STEP.return) {
      return {
        context: {
          [DRIVER_FLOW_CONTEXT_KEY.documentId]: documentId,
          [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
        },
        next: DRIVER_FLOW_NODE.returnReasonMenu,
      }
    }
    return {
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.documentId]: documentId,
        [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
      },
      next: DRIVER_FLOW_NODE.listOccurrenceTypes,
    }
  }

  async function completeDelivery(input: {
    readonly actor: Parameters<WhatsAppAuthorizedActionHandler>[0]['actor']
    readonly channel: ChannelAdapterInterface
    readonly documentId: string
    readonly documentNumber?: string | undefined
    readonly session: Parameters<WhatsAppAuthorizedActionHandler>[0]['session']
  }): Promise<FlowActionResult> {
    const { actor, channel, documentId, session } = input
    const driverId = await deps.resolveDriverId({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (driverId === null) {
      await say({ actor, channel, session }, 'driverNotLinked')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }

    // Spec 293 T15: as provas antes da baixa — a mesma entrega em preparo do grupo.
    if (deps.deliveryPreparations !== undefined && input.documentNumber !== undefined) {
      const reply = await deps.deliveryPreparations.begin({
        actor: { actorUserId: actor.scope.userId, companyId: actor.scope.companyId, driverId },
        channel: 'individual',
        documentId,
        documentNumber: input.documentNumber.replace(/^0+(?=\d)/u, ''),
        location: consumeLocation({ actor, session }),
      })
      for (const text of reply.texts) await say({ actor, channel, session }, { text })
      // A resposta à pergunta da preparação vem antes do menu (`acceptDeliveryProof` no despachante).
      return {
        context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
        next: DRIVER_FLOW_NODE.tripMenu,
      }
    }

    // Spec 293 T11: a mesma camada de eventos do grupo do motorista.
    const result = await deliverWhatsAppDriverDocument(deps, {
      actorUserId: actor.scope.userId,
      companyId: actor.scope.companyId,
      documentId,
      driverId,
      idempotencyKey: randomUUID(),
      location: consumeLocation({ actor, session }),
    })
    await say({ actor, channel, session }, describeWhatsAppDriverEventResult(result, DRIVER))
    return {
      context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }

  /**
   * Spec 294 RF8–RF10: a baixa que fechou a parada oferece a próxima rota (ou diz que a rota fechou). O pedido
   * fica no contexto da sessão e só nasce quando nada mais espera resposta deste motorista (RNF1).
   */
  async function offerNextRoute(input: {
    readonly actor: Parameters<WhatsAppAuthorizedActionHandler>[0]['actor']
    readonly channel: ChannelAdapterInterface
    readonly context: Record<string, unknown>
    readonly driverId: string
    readonly result: WhatsAppDriverEventResult
    readonly session: Parameters<WhatsAppAuthorizedActionHandler>[0]['session']
  }): Promise<{ readonly context?: Record<string, unknown> }> {
    const { actor, channel, context, driverId, result, session } = input
    if (result.kind !== 'registered' || result.details?.stopCompleted !== true) return {}
    const scope = { actorUserId: actor.scope.userId, companyId: actor.scope.companyId, driverId }
    const offer = buildRouteOfferReply({
      continuation: {
        nextStop: result.details.nextStop ?? null,
        tripCompleted: result.details.tripCompleted,
      },
      gate: {
        hasOpenCollection:
          (await deps.deliveryPreparations?.hasOpen(scope)) === true ||
          (await deps.occurrenceDrafts?.hasOpen(scope)) === true,
        hasOpenStopChoice: false,
        hasPendingAudio: false,
        hasPendingPrompt: readDriverPrompt(context, nowOf()) !== undefined,
      },
      now: nowOf(),
    })
    for (const text of offer.texts) await say({ actor, channel, session }, { text })
    return offer.prompt === undefined
      ? {}
      : { context: { [DRIVER_PROMPT_CONTEXT_KEY]: offer.prompt } }
  }

  const returnReasonRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const reason = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.returnReason)
    const documentId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.documentId)
    if (reason === undefined || documentId === undefined || !isDriverReturnReason(reason)) {
      return { next: DRIVER_FLOW_NODE.tripMenu }
    }

    const driverId = await deps.resolveDriverId({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (driverId === null) {
      await say({ actor, channel, session }, 'driverNotLinked')
      return { next: 'menu' }
    }

    const result = await returnWhatsAppDriverDocument(deps, {
      actorUserId: actor.scope.userId,
      companyId: actor.scope.companyId,
      documentId,
      driverId,
      idempotencyKey: randomUUID(),
      location: consumeLocation({ actor, session }),
      reason,
    })
    await say({ actor, channel, session }, describeWhatsAppDriverEventResult(result, DRIVER))
    const offered = await offerNextRoute({
      actor,
      channel,
      context,
      driverId,
      result,
      session,
    })
    return { ...offered, next: DRIVER_FLOW_NODE.tripMenu }
  }

  const listOccurrenceTypesAction: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const catalog = await deps.listOccurrenceTypes({
      companyId: actor.scope.companyId,
      documentId: readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.documentId),
    })
    const options = catalog.filter(isOfferedToDriver)
    if (options.length === 0) {
      await say({ actor, channel, session }, 'driverNoStreetOccurrenceTypes')
      return {
        context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
        next: DRIVER_FLOW_NODE.tripMenu,
      }
    }

    await sendDynamicChoice({
      body: 'O que aconteceu? Toque no tipo da ocorrência.',
      channel,
      options: options.map((type) => ({ id: type.id, title: type.name })),
      page: readPage(context),
      to: session.whatsappNumber,
    })
    return {
      context: WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET,
      next: DRIVER_FLOW_NODE.occurrenceTypeEntry,
    }
  }

  const occurrenceTypeRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    node,
    session,
  }) => {
    const answer = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeAnswer)
    if (answer === undefined) return { next: DRIVER_FLOW_NODE.tripMenu }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return {
        context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: page },
        next: DRIVER_FLOW_NODE.listOccurrenceTypes,
      }
    }

    const catalog = await deps.listOccurrenceTypes({
      companyId: actor.scope.companyId,
      documentId: readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.documentId),
    })
    const offered = catalog.some((type) => type.id === answer && isOfferedToDriver(type))
    if (!offered) {
      return rejectListAnswer({
        channel,
        context,
        entryNode: DRIVER_FLOW_NODE.occurrenceTypeEntry,
        node,
        session,
      })
    }

    return {
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
        [DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeId]: answer,
      },
      next: DRIVER_FLOW_NODE.notePrompt,
    }
  }

  const notePrompt: WhatsAppAuthorizedActionHandler = async ({ channel, session }) => {
    const body = `Alguma observação sobre a ocorrência? Digite o texto (até ${DRIVER_OCCURRENCE_NOTE_MAX_LENGTH} caracteres) ou toque em Pular.`
    await channel.sendInteractiveList({
      body,
      buttonLabel: WHATSAPP_LIST_BUTTON_TEXT,
      rows: [{ id: DRIVER_NOTE_SKIP_ANSWER, title: '⏭️ Pular' }],
      to: session.whatsappNumber,
    })
    return { next: DRIVER_FLOW_NODE.noteEntry }
  }

  const noteRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const answer = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.noteAnswer)
    const documentId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.documentId)
    const occurrenceTypeId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.occurrenceTypeId)
    if (answer === undefined || documentId === undefined || occurrenceTypeId === undefined) {
      return { next: DRIVER_FLOW_NODE.tripMenu }
    }

    const note = answer === DRIVER_NOTE_SKIP_ANSWER ? '' : answer.trim()
    if (note.length > DRIVER_OCCURRENCE_NOTE_MAX_LENGTH) {
      await say({ actor, channel, session }, 'driverNoteTooLong', {
        max: DRIVER_OCCURRENCE_NOTE_MAX_LENGTH,
      })
      return { next: DRIVER_FLOW_NODE.notePrompt }
    }

    const driverId = await deps.resolveDriverId({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (driverId === null) {
      await say({ actor, channel, session }, 'driverNotLinked')
      return { next: 'menu' }
    }

    const location = consumeLocation({ actor, session })
    // Spec 293 T15: o que o tipo pede e o WhatsApp colhe (foto, número, valor) é pedido antes do registro.
    if (deps.occurrenceDrafts !== undefined) {
      const documentNumber = await findDocumentNumber(actor, documentId)
      const collecting =
        documentNumber === undefined
          ? null
          : await deps.occurrenceDrafts.begin({
              actor: {
                actorUserId: actor.scope.userId,
                companyId: actor.scope.companyId,
                driverId,
              },
              channel: 'individual',
              documentId,
              documentNumber,
              location,
              note,
              occurrenceTypeId,
            })
      if (collecting !== null) {
        for (const text of collecting.texts) await say({ actor, channel, session }, { text })
        // A resposta à coleta vem antes do menu (`acceptDeliveryProof` no despachante).
        return { next: DRIVER_FLOW_NODE.tripMenu }
      }
    }

    const result = await registerWhatsAppDriverOccurrence(deps, {
      actorUserId: actor.scope.userId,
      companyId: actor.scope.companyId,
      documentId,
      driverId,
      idempotencyKey: randomUUID(),
      location,
      note,
      occurrenceTypeId,
    })
    await say({ actor, channel, session }, describeWhatsAppDriverEventResult(result, DRIVER))
    /** Spec 246 (RF13): exigência de campo que o canal não colhe volta ao passo que a corrige. */
    if (result.kind === 'refused' && result.refusal.code === 'occurrence_requirement') {
      return { next: occurrenceRequirementNextNode(result.refusal.field) }
    }
    return { next: DRIVER_FLOW_NODE.tripMenu }
  }

  const nowOf = deps.now ?? (() => new Date())

  type StopStep = typeof DRIVER_FLOW_STEP.arrive | typeof DRIVER_FLOW_STEP.depart
  type ActionInput = Parameters<WhatsAppAuthorizedActionHandler>[0]

  function isStopStep(step: string | undefined): step is StopStep {
    return step === DRIVER_FLOW_STEP.arrive || step === DRIVER_FLOW_STEP.depart
  }

  function resolveStops(step: StopStep, trip: DriverTrip) {
    return step === DRIVER_FLOW_STEP.depart
      ? resolveDepartureStop(trip.stops)
      : resolveArrivalStop(trip.stops)
  }

  /** O fim de qualquer evento da viagem: limpa o rastro do passo e volta ao menu da viagem. */
  function backToTripMenu(tripId: string): FlowActionResult {
    return {
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.directCommand]: undefined,
        [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: tripId,
      },
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }

  /** Spec 293 T14: o `saí`/`cheguei` pela mesma camada de eventos do grupo (T11). */
  async function registerStopEvent(
    input: ActionInput & {
      readonly documentNumber?: string | undefined
      readonly step: StopStep
      readonly stopId: string
      readonly tripId: string
    },
  ): Promise<FlowActionResult> {
    const { actor, channel, documentNumber, session, step, stopId, tripId } = input
    const driverId = await deps.resolveDriverId({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (driverId === null) {
      await say({ actor, channel, session }, 'driverNotLinked')
      return { next: 'menu' }
    }

    const event = {
      actorUserId: actor.scope.userId,
      companyId: actor.scope.companyId,
      driverId,
      idempotencyKey: randomUUID(),
      location: consumeLocation({ actor, session }),
      sentAt: nowOf(),
      stopId,
    }
    const result =
      step === DRIVER_FLOW_STEP.depart
        ? await departWhatsAppDriverStop(deps, event)
        : await arriveWhatsAppDriverStop(deps, event)
    await say(
      { actor, channel, session },
      describeWhatsAppDriverEventResult(result, {
        ...(documentNumber === undefined ? {} : { documentNumber }),
        kind: 'driver',
      }),
    )
    return backToTripMenu(tripId)
  }

  async function resolveStopEvent(
    input: ActionInput & { readonly step: StopStep; readonly trip: DriverTrip },
  ): Promise<FlowActionResult> {
    const { actor, channel, session, step, trip } = input
    const resolution: WhatsAppStopResolution<DriverTrip['stops'][number]> = resolveStops(step, trip)
    if (resolution.kind === 'none') {
      await say(
        { actor, channel, session },
        step === DRIVER_FLOW_STEP.depart ? 'driverNoStopToDepart' : 'driverNoStopToArrive',
      )
      return backToTripMenu(trip.id)
    }
    if (resolution.kind === 'en_route') {
      await say({ actor, channel, session }, 'stopEnRoute', {
        sequence: String(resolution.stop.sequence),
      })
      return backToTripMenu(trip.id)
    }
    if (resolution.kind === 'single') {
      return registerStopEvent({
        ...input,
        documentNumber: firstDocumentNumber(resolution.stop),
        stopId: resolution.stop.id,
        tripId: trip.id,
      })
    }
    return {
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: trip.id,
        [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: step,
      },
      next: DRIVER_FLOW_NODE.listStops,
    }
  }

  function stopEventAction(step: StopStep): WhatsAppAuthorizedActionHandler {
    return async (input) => {
      const { actor, channel, context, session } = input
      const tripId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripId)
      const trip = tripId === undefined ? undefined : await findTripById({ actor, tripId })
      if (trip === undefined) {
        await say({ actor, channel, session }, 'tripUnavailable')
        return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
      }
      return resolveStopEvent({ ...input, step, trip })
    }
  }

  /** Mais de uma parada possível: a lista, pela primeira nota e pelo cliente (spec 294 RF17). */
  const listStops: WhatsAppAuthorizedActionHandler = async (input) => {
    const { actor, channel, context, session } = input
    const step = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice)
    const tripId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripId)
    if (!isStopStep(step) || tripId === undefined) return { next: 'menu' }

    const trip = await findTripById({ actor, tripId })
    if (trip === undefined) {
      await say({ actor, channel, session }, 'tripUnavailable')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }
    const resolution = resolveStops(step, trip)
    if (resolution.kind !== 'choose') return resolveStopEvent({ ...input, step, trip })

    await sendDynamicChoice({
      body: `Toque na parada em que você ${step === DRIVER_FLOW_STEP.depart ? 'vai sair para' : 'chegou'}.`,
      channel,
      options: resolution.stops.map((stop) => ({
        id: stop.id,
        title: `${stop.sequence}ª · ${describeStopReference(stop)}`,
      })),
      page: readPage(context),
      to: session.whatsappNumber,
    })
    return { context: WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET, next: DRIVER_FLOW_NODE.stopEntry }
  }

  const stopRouter: WhatsAppAuthorizedActionHandler = async (input) => {
    const { actor, channel, context, node, session } = input
    const answer = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.stopAnswer)
    const step = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice)
    const tripId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripId)
    if (answer === undefined || !isStopStep(step) || tripId === undefined) return { next: 'menu' }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return {
        context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: page },
        next: DRIVER_FLOW_NODE.listStops,
      }
    }

    const trip = await findTripById({ actor, tripId })
    if (trip === undefined) {
      await say({ actor, channel, session }, 'tripUnavailable')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }
    // A resposta é conferida contra as paradas que a regra oferece agora, nunca usada crua como id.
    const resolution = resolveStops(step, trip)
    const offered =
      resolution.kind === 'choose'
        ? resolution.stops.some((stop) => stop.id === answer)
        : resolution.kind === 'single' && resolution.stop.id === answer
    if (!offered) {
      return rejectListAnswer({
        channel,
        context,
        entryNode: DRIVER_FLOW_NODE.stopEntry,
        node,
        session,
      })
    }
    const chosen = trip.stops.find((stop) => stop.id === answer)
    return registerStopEvent({
      ...input,
      documentNumber: chosen === undefined ? undefined : firstDocumentNumber(chosen),
      step,
      stopId: answer,
      tripId,
    })
  }

  /**
   * Spec 293 T14: o comando direto digitado (`entreguei 17234`, `cheguei`, `devolvi 17234 ausente`).
   * `saí`/`cheguei` registram direto; entregar e devolver sempre confirmam (1-Sim / 2-Não).
   */
  const directCommand: WhatsAppAuthorizedActionHandler = async (input) => {
    const { actor, channel, context, session } = input
    const command = readDirectCommand(context)
    const result = await findCurrentTrip({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (!result.isRegisteredDriver) {
      await say({ actor, channel, session }, 'driverNotLinkedOffice')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.directCommand]: undefined }, next: 'menu' }
    }
    const trip = result.trips[0]
    if (command === undefined || trip === undefined) {
      if (trip === undefined) await say({ actor, channel, session }, 'driverNoActiveTrip')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.directCommand]: undefined }, next: 'menu' }
    }

    if (command.kind === 'depart' || command.kind === 'arrive') {
      return resolveStopEvent({ ...input, step: command.kind, trip })
    }
    if (command.kind === 'too_many_documents') {
      await say({ actor, channel, session }, 'driverDirectTooManyDocuments')
      return backToTripMenu(trip.id)
    }
    if (command.numbers.length === 0) {
      return {
        context: {
          [DRIVER_FLOW_CONTEXT_KEY.directCommand]: undefined,
          [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
          [DRIVER_FLOW_CONTEXT_KEY.tripId]: trip.id,
          [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: command.kind,
        },
        next: DRIVER_FLOW_NODE.listDocuments,
      }
    }

    const open = listOpenDocuments(trip)
    const matched = command.numbers.map((number) => ({
      document: open.find((document) => sameDocumentNumber(document.number, number)),
      number,
    }))
    const missing = matched.filter((item) => item.document === undefined).map((item) => item.number)
    if (missing.length > 0) {
      await say({ actor, channel, session }, 'driverDocumentsNotOpen', {
        numbers: missing.join(', '),
      })
      return backToTripMenu(trip.id)
    }
    const documents = matched.flatMap((item) =>
      item.document === undefined ? [] : [item.document],
    )

    if (command.kind === 'return') {
      const [only] = documents
      if (only === undefined || documents.length > 1) {
        await say({ actor, channel, session }, 'driverDirectReturnOneAtATime')
        return backToTripMenu(trip.id)
      }
      if (command.reason === undefined) {
        // Sem motivo no texto: o menu de motivos já existente (tocar o motivo é a confirmação).
        return {
          context: {
            [DRIVER_FLOW_CONTEXT_KEY.directCommand]: undefined,
            [DRIVER_FLOW_CONTEXT_KEY.documentId]: only.id,
            [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined,
            [DRIVER_FLOW_CONTEXT_KEY.tripId]: trip.id,
            [DRIVER_FLOW_CONTEXT_KEY.tripMenuChoice]: DRIVER_FLOW_STEP.return,
          },
          next: DRIVER_FLOW_NODE.returnReasonMenu,
        }
      }
    }

    const reasonLabel =
      command.kind === 'return' && command.reason !== undefined
        ? ` (${DRIVER_RETURN_REASON_LABELS[command.reason] ?? command.reason})`
        : ''
    const verb = command.kind === 'return' ? 'Devolver' : 'Entregar'
    await say({ actor, channel, session }, 'driverDirectConfirm', {
      documents: documents.map((document) => `NF ${document.number}`).join(', '),
      reason: reasonLabel,
      verb,
    })
    return {
      context: {
        [DRIVER_FLOW_CONTEXT_KEY.directCommand]: undefined,
        [DRIVER_FLOW_CONTEXT_KEY.directDocumentIds]: documents.map((document) => document.id),
        [DRIVER_FLOW_CONTEXT_KEY.directEvent]: command.kind,
        [DRIVER_FLOW_CONTEXT_KEY.directReason]:
          command.kind === 'return' ? command.reason : undefined,
        [DRIVER_FLOW_CONTEXT_KEY.tripId]: trip.id,
      },
      next: DRIVER_FLOW_NODE.directConfirm,
    }
  }

  const directConfirmRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const answer = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.directConfirmAnswer)
    const event = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.directEvent)
    const documentIds = readStringList(context, DRIVER_FLOW_CONTEXT_KEY.directDocumentIds)
    const tripId = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.tripId)
    const cleared = {
      [DRIVER_FLOW_CONTEXT_KEY.directConfirmAnswer]: undefined,
      [DRIVER_FLOW_CONTEXT_KEY.directDocumentIds]: undefined,
      [DRIVER_FLOW_CONTEXT_KEY.directEvent]: undefined,
      [DRIVER_FLOW_CONTEXT_KEY.directReason]: undefined,
    }
    if (
      answer !== DRIVER_DIRECT_CONFIRM_ANSWER.yes ||
      tripId === undefined ||
      documentIds.length === 0 ||
      (event !== DRIVER_FLOW_STEP.deliver && event !== DRIVER_FLOW_STEP.return)
    ) {
      if (answer === DRIVER_DIRECT_CONFIRM_ANSWER.no) {
        await say({ actor, channel, session }, 'driverDirectCancelled')
      }
      return {
        context: cleared,
        next: tripId === undefined ? 'menu' : DRIVER_FLOW_NODE.tripMenu,
      }
    }

    const reason = readStringContext(context, DRIVER_FLOW_CONTEXT_KEY.directReason)
    if (event === DRIVER_FLOW_STEP.return && !isDriverReturnReason(reason)) {
      return { context: cleared, next: DRIVER_FLOW_NODE.tripMenu }
    }
    const driverId = await deps.resolveDriverId({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (driverId === null) {
      await say({ actor, channel, session }, 'driverNotLinked')
      return { context: cleared, next: 'menu' }
    }

    // A localização é uma vez só para o lote inteiro.
    const location = consumeLocation({ actor, session })

    // Spec 293 T15: "entreguei" abre a entrega em preparo de cada nota (provas antes da baixa).
    const preparations = deps.deliveryPreparations
    if (event === DRIVER_FLOW_STEP.deliver && preparations !== undefined) {
      const trip = await findTripById({ actor, tripId })
      const numbers = new Map(
        (trip?.stops ?? []).flatMap((stop) =>
          stop.documents.map((document) => [document.id, document.number] as const),
        ),
      )
      for (const documentId of documentIds) {
        const number = numbers.get(documentId)
        if (number === undefined) continue
        const reply = await preparations.begin({
          actor: { actorUserId: actor.scope.userId, companyId: actor.scope.companyId, driverId },
          channel: 'individual',
          documentId,
          documentNumber: number.replace(/^0+(?=\d)/u, ''),
          location,
        })
        for (const text of reply.texts) await say({ actor, channel, session }, { text })
      }
      return {
        context: { ...cleared, [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
        next: DRIVER_FLOW_NODE.tripMenu,
      }
    }

    const results: WhatsAppDriverEventResult[] = []
    for (const documentId of documentIds) {
      const base = {
        actorUserId: actor.scope.userId,
        companyId: actor.scope.companyId,
        documentId,
        driverId,
        idempotencyKey: randomUUID(),
        location,
      }
      results.push(
        event === DRIVER_FLOW_STEP.return && isDriverReturnReason(reason)
          ? await returnWhatsAppDriverDocument(deps, { ...base, reason })
          : await deliverWhatsAppDriverDocument(deps, base),
      )
    }
    const [only] = results
    if (results.length === 1 && only !== undefined) {
      await say({ actor, channel, session }, describeWhatsAppDriverEventResult(only, DRIVER))
    } else {
      await say({ actor, channel, session }, { text: summarizeBatch(results) })
    }
    return {
      context: { ...cleared, [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }

  async function findTripById(input: {
    readonly actor: Parameters<WhatsAppAuthorizedActionHandler>[0]['actor']
    readonly tripId: string
  }): Promise<DriverTrip | undefined> {
    const result = await findCurrentTrip({
      companyId: input.actor.scope.companyId,
      membershipId: input.actor.scope.membershipId,
    })
    return result.trips.find((trip) => trip.id === input.tripId)
  }

  return [
    { handler: currentTrip, kind: DRIVER_FLOW_ACTION_KIND.currentTrip, policy: DRIVER_READ_POLICY },
    {
      handler: listDocuments,
      kind: DRIVER_FLOW_ACTION_KIND.listDocuments,
      policy: DRIVER_REPORT_POLICY,
    },
    {
      handler: documentRouter,
      kind: DRIVER_FLOW_ACTION_KIND.documentRouter,
      policy: DRIVER_REPORT_POLICY,
    },
    {
      handler: returnReasonRouter,
      kind: DRIVER_FLOW_ACTION_KIND.completeReturn,
      policy: DRIVER_REPORT_POLICY,
    },
    {
      handler: listOccurrenceTypesAction,
      kind: DRIVER_FLOW_ACTION_KIND.listOccurrenceTypes,
      policy: DRIVER_REPORT_POLICY,
    },
    {
      handler: occurrenceTypeRouter,
      kind: DRIVER_FLOW_ACTION_KIND.occurrenceTypeRouter,
      policy: DRIVER_REPORT_POLICY,
    },
    { handler: notePrompt, kind: DRIVER_FLOW_ACTION_KIND.notePrompt, policy: DRIVER_REPORT_POLICY },
    {
      handler: noteRouter,
      kind: DRIVER_FLOW_ACTION_KIND.completeOccurrence,
      policy: DRIVER_REPORT_POLICY,
    },
    {
      handler: stopEventAction(DRIVER_FLOW_STEP.depart),
      kind: DRIVER_FLOW_ACTION_KIND.depart,
      policy: DRIVER_REPORT_POLICY,
    },
    {
      handler: stopEventAction(DRIVER_FLOW_STEP.arrive),
      kind: DRIVER_FLOW_ACTION_KIND.arrive,
      policy: DRIVER_REPORT_POLICY,
    },
    { handler: listStops, kind: DRIVER_FLOW_ACTION_KIND.listStops, policy: DRIVER_REPORT_POLICY },
    { handler: stopRouter, kind: DRIVER_FLOW_ACTION_KIND.stopRouter, policy: DRIVER_REPORT_POLICY },
    {
      handler: directCommand,
      kind: DRIVER_FLOW_ACTION_KIND.directCommand,
      policy: DRIVER_REPORT_POLICY,
    },
    {
      handler: directConfirmRouter,
      kind: DRIVER_FLOW_ACTION_KIND.directConfirmRouter,
      policy: DRIVER_REPORT_POLICY,
    },
  ]
}

/**
 * Spec 246 (RF0b, T1b.2): o WhatsApp do motorista registra pela rota de nota
 * (`registerDriverOccurrence`), momento `document` — a lista perde os tipos de parada, que o canal
 * nunca conseguiu registrar.
 */
export function isOfferedToDriver(type: OccurrenceTypeRecord): boolean {
  return type.active && occurrenceTypeAcceptsMoment({ moment: OCCURRENCE_MOMENT.document, type })
}
