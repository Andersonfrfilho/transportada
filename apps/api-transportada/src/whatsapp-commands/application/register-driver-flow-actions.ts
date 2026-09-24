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
import {
  TripDocumentNotReachableError,
  TripStateTransitionNotAllowedError,
} from '../../trips/domain/trip.error.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import {
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
  DRIVER_FLOW_STEP,
  DRIVER_NOTE_SKIP_ANSWER,
  DRIVER_OCCURRENCE_NOTE_MAX_LENGTH,
  DRIVER_TRANSITION_BLOCK_MESSAGES,
  type DriverFlowStep,
} from '../domain/whatsapp-driver-flow.constant.js'
import { WHATSAPP_LIST_BUTTON_TEXT } from '../domain/whatsapp-menu.constant.js'
import { parseMenuPageNavigation, type WhatsAppMenuOption } from '../domain/whatsapp-menu.policy.js'
import { sendDynamicChoice } from './whatsapp-dynamic-choice.service.js'
import {
  rejectListAnswer,
  WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET,
} from './whatsapp-list-answer.service.js'
import type {
  WhatsAppAuthorizedActionHandler,
  WhatsAppFlowActionDefinition,
} from './with-authorized-actor.service.js'

const DRIVER_READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const DRIVER_REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const

type ReportOutcome = {
  readonly alreadySettled: boolean
}

export type DriverFlowActionDependencies = {
  readonly findCurrentTrip: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<FindCurrentDriverTripResult>
  readonly listOccurrenceTypes: (input: {
    readonly companyId: string
  }) => Promise<readonly OccurrenceTypeRecord[]>
  readonly registerOccurrence: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
  }) => Promise<TripOccurrence>
  readonly reportDelivery: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: null
  }) => Promise<ReportOutcome>
  readonly reportReturn: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
    readonly idempotencyKey: string
    readonly location: null
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
  const currentTrip: WhatsAppAuthorizedActionHandler = async ({ actor, channel, session }) => {
    const result = await deps.findCurrentTrip({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (!result.isRegisteredDriver) {
      await channel.sendText(
        session.whatsappNumber,
        'Sua conta não está ligada a um cadastro de motorista. Fale com o escritório.',
      )
      return { next: 'menu' }
    }
    const trip = result.trips[0]
    if (trip === undefined) {
      await channel.sendText(session.whatsappNumber, 'Você não tem viagem em andamento.')
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
      await channel.sendText(session.whatsappNumber, 'Esta viagem não está mais disponível.')
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }

    const documents = listOpenDocuments(trip)
    if (documents.length === 0) {
      await channel.sendText(session.whatsappNumber, 'Não há notas pendentes nesta viagem.')
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
      await channel.sendText(session.whatsappNumber, 'Esta viagem não está mais disponível.')
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
    if (step === DRIVER_FLOW_STEP.deliver)
      return completeDelivery({ actor, channel, documentId, session })
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
    readonly session: Parameters<WhatsAppAuthorizedActionHandler>[0]['session']
  }): Promise<FlowActionResult> {
    const { actor, channel, documentId, session } = input
    const driverId = await deps.resolveDriverId({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (driverId === null) {
      await channel.sendText(
        session.whatsappNumber,
        'Sua conta não está ligada a um cadastro de motorista.',
      )
      return { context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }

    try {
      const outcome = await deps.reportDelivery({
        actorUserId: actor.scope.userId,
        companyId: actor.scope.companyId,
        documentId,
        driverId,
        idempotencyKey: randomUUID(),
        location: null,
      })
      await channel.sendText(
        session.whatsappNumber,
        outcome.alreadySettled ? 'Já estava registrada.' : 'Entrega registrada. ✅',
      )
    } catch (error) {
      await channel.sendText(session.whatsappNumber, describeDocumentError(error))
    }
    return {
      context: { [DRIVER_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: DRIVER_FLOW_NODE.tripMenu,
    }
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
      await channel.sendText(
        session.whatsappNumber,
        'Sua conta não está ligada a um cadastro de motorista.',
      )
      return { next: 'menu' }
    }

    try {
      const outcome = await deps.reportReturn({
        actorUserId: actor.scope.userId,
        companyId: actor.scope.companyId,
        documentId,
        driverId,
        idempotencyKey: randomUUID(),
        location: null,
        reason,
      })
      await channel.sendText(
        session.whatsappNumber,
        outcome.alreadySettled ? 'Já estava registrada.' : 'Devolução registrada. ↩️',
      )
    } catch (error) {
      await channel.sendText(session.whatsappNumber, describeDocumentError(error))
    }
    return { next: DRIVER_FLOW_NODE.tripMenu }
  }

  const listOccurrenceTypesAction: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const catalog = await deps.listOccurrenceTypes({ companyId: actor.scope.companyId })
    const options = catalog.filter(
      (type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.delivery,
    )
    if (options.length === 0) {
      await channel.sendText(
        session.whatsappNumber,
        'Ainda não há tipos de ocorrência cadastrados para a rua. Fale com o escritório.',
      )
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

    const catalog = await deps.listOccurrenceTypes({ companyId: actor.scope.companyId })
    const offered = catalog.some(
      (type) => type.id === answer && type.active && type.stage === TRIP_OCCURRENCE_STAGE.delivery,
    )
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
      await channel.sendText(
        session.whatsappNumber,
        `Observação muito longa (máximo ${DRIVER_OCCURRENCE_NOTE_MAX_LENGTH} caracteres). Digite de novo ou toque em Pular.`,
      )
      return { next: DRIVER_FLOW_NODE.notePrompt }
    }

    const driverId = await deps.resolveDriverId({
      companyId: actor.scope.companyId,
      membershipId: actor.scope.membershipId,
    })
    if (driverId === null) {
      await channel.sendText(
        session.whatsappNumber,
        'Sua conta não está ligada a um cadastro de motorista.',
      )
      return { next: 'menu' }
    }

    try {
      await deps.registerOccurrence({
        actorUserId: actor.scope.userId,
        companyId: actor.scope.companyId,
        documentId,
        driverId,
        idempotencyKey: randomUUID(),
        note,
        occurrenceTypeId,
        productCode: '',
      })
      await channel.sendText(session.whatsappNumber, 'Ocorrência registrada. ⚠️')
    } catch (error) {
      await channel.sendText(session.whatsappNumber, describeDocumentError(error))
    }
    return { next: DRIVER_FLOW_NODE.tripMenu }
  }

  async function findTripById(input: {
    readonly actor: Parameters<WhatsAppAuthorizedActionHandler>[0]['actor']
    readonly tripId: string
  }): Promise<DriverTrip | undefined> {
    const result = await deps.findCurrentTrip({
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
  ]
}

/** Portão recusado (409) e nota inalcançável viram mensagem clara — nunca erro cru (D7). */
function describeDocumentError(error: unknown): string {
  if (error instanceof TripStateTransitionNotAllowedError) {
    return DRIVER_TRANSITION_BLOCK_MESSAGES[error.reason]
  }
  if (error instanceof TripDocumentNotReachableError) {
    return 'Essa nota não está mais disponível na sua viagem.'
  }
  throw error
}
