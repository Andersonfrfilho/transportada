/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T016 — o operador separa, carrega e despacha viagens do armazém pela conversa do
 * WhatsApp (D7/D8).
 *
 * ⚠️ Nada aqui é caminho paralelo: `separateDocument`/`loadDocument`/`dispatchTrip`/`batchTransition`
 * são as MESMAS funções compostas que `createTripLifecycleUseCase` (`trip-lifecycle.use-case.ts`)
 * injeta nas rotas `POST /trips/:id/documents/:documentId/{separate,load}`,
 * `POST /trips/:id/documents/batch-status` e `POST /trips/:id/dispatch` do painel — o operador pelo
 * WhatsApp grava o mesmo evento, pela mesma política de estado (`trip-state.policy.ts`), que o
 * operador pelo painel. `registerOccurrence` é a mesma `registerTripOccurrence` que
 * `POST /trips/:id/documents/:documentId/occurrences` usa.
 *
 * As ações oferecidas em cada nó são derivadas de `resolveOperatorTripActions`
 * (`operator-trip-actions.policy.ts`), que por sua vez deriva de `checkTripAcceptsDocumentWork` e
 * `checkTripTransition` — nunca uma tabela nova que possa discordar da máquina real.
 */

import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { OFFICE_PROOF_MAX_BYTES } from '../../trips/domain/delivery-proof.policy.js'
import type { DispatchTripResult } from '../../trips/application/dispatch-trip.use-case.js'
import type { TripOccurrenceAttachmentPosition } from '../../trips/application/register-trip-occurrence.use-case.js'
import type {
  OccurrenceTypeRecord,
  TripOccurrence,
} from '../../trips/application/register-trip-occurrence.use-case.js'
import type { TransitionTripDocumentResult } from '../../trips/application/transition-trip-document.use-case.js'
import type { TransitionTripDocumentsBatchResult } from '../../trips/application/transition-trip-documents-batch.use-case.js'
import type { WarehouseTrip } from '../../trips/application/list-warehouse-trips.use-case.js'
import {
  resolveOperatorTripActions,
  type OperatorTripActionId,
} from '../../trips/domain/operator-trip-actions.policy.js'
import {
  TripDeliveryProofRejectedError,
  TripDocumentNotFoundError,
  TripDispatchForceReasonRequiredError,
  TripFieldReportKeyReusedError,
  TripHasUnloadedDocumentsError,
  TripHasUnscheduledStopsError,
  TripNotFoundError,
  TripOccurrenceAttachmentLimitError,
  TripStateTransitionNotAllowedError,
} from '../../trips/domain/trip.error.js'
import {
  OPERATOR_BATCH_ALL_ANSWER,
  OPERATOR_DISPATCH_CONFIRM_ANSWER,
  OPERATOR_FLOW_ACTION_KIND,
  OPERATOR_FLOW_CONTEXT_KEY,
  OPERATOR_FLOW_NODE,
  OPERATOR_NOTE_SKIP_ANSWER,
  OPERATOR_OCCURRENCE_NOTE_MAX_LENGTH,
  OPERATOR_OCCURRENCE_PHOTO_ANSWER,
  OPERATOR_TRANSITION_BLOCK_MESSAGES,
} from '../domain/whatsapp-operator-flow.constant.js'
import {
  WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY,
  WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF,
} from '../domain/whatsapp-command.constant.js'
import { WhatsAppCommandHandoffRequestedError } from '../domain/whatsapp-command.error.js'
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

const OPERATOR_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const OPERATOR_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const

const OPERATOR_ACTION_LABEL: Readonly<Record<OperatorTripActionId, string>> = {
  dispatch: '🚚 Despachar',
  load: '📥 Carregar',
  occurrence: '⚠️ Ocorrência',
  separate: '📦 Separar',
}

export type OperatorFlowActionDependencies = {
  /** Spec 161 T15 (RF18c): segunda foto em diante da mesma ocorrência — a mesma
   * `attachOccurrencePhoto` (T7) que `POST .../occurrences/:occurrenceId/attachments` usa. */
  readonly attachOccurrencePhoto: (input: {
    readonly actorUserId: string
    readonly attachment: { readonly bytes: Uint8Array; readonly mimeType: string }
    readonly companyId: string
    readonly occurrenceId: string
  }) => Promise<TripOccurrenceAttachmentPosition>
  readonly batchTransition: (input: {
    readonly action: 'separate' | 'load'
    readonly context: CompanyContext
    readonly documentIds: readonly string[]
    readonly tripId: string
  }) => Promise<TransitionTripDocumentsBatchResult>
  readonly dispatchTrip: (input: {
    readonly context: CompanyContext
    readonly tripId: string
  }) => Promise<DispatchTripResult>
  readonly listOccurrenceTypes: (input: {
    readonly companyId: string
  }) => Promise<readonly OccurrenceTypeRecord[]>
  readonly listWarehouseTrips: (input: {
    readonly companyId: string
  }) => Promise<readonly WarehouseTrip[]>
  readonly loadDocument: (input: {
    readonly context: CompanyContext
    readonly documentId: string
    readonly tripId: string
  }) => Promise<TransitionTripDocumentResult>
  readonly registerOccurrence: (input: {
    readonly actorUserId: string
    /**
     * Spec 161 T13/T15: a foto baixada do WhatsApp (RF16/RF19). Ausente aqui ainda recusa com
     * `OccurrencePhotoRequiredError` (D1/RF4) — é a T15 que passa a preencher este campo a partir
     * do passo de foto do fluxo do operador.
     */
    readonly attachment?: {
      readonly bytes: Uint8Array
      readonly mimeType: string
      readonly thumbnail?: { readonly bytes: Uint8Array; readonly mimeType: string }
    }
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly tripId: string
  }) => Promise<TripOccurrence>
  readonly separateDocument: (input: {
    readonly context: CompanyContext
    readonly documentId: string
    readonly tripId: string
  }) => Promise<TransitionTripDocumentResult>
}

type Actor = Parameters<WhatsAppAuthorizedActionHandler>[0]['actor']
/** `actor.scope` já É o `CompanyContext` que `createTripLifecycleUseCase` espera. */
function toContext(actor: Actor): CompanyContext {
  return actor.scope
}

/** Nota viva (não liberada) que ainda não chegou a `loaded` — o que trava despacho sem `force`. */
function isUnloadedDocument(document: WarehouseTrip['documents'][number]): boolean {
  return document.separationStatus === 'pending' || document.separationStatus === 'separated'
}

function toDocumentOption(document: WarehouseTrip['documents'][number]): WhatsAppMenuOption {
  return { id: document.id, title: `${document.number} · ${document.recipientName}` }
}

function toTripOption(trip: WarehouseTrip): WhatsAppMenuOption {
  return { id: trip.id, title: `${trip.vehiclePlate} · ${trip.documents.length} notas` }
}

function readPage(context: Record<string, unknown>): number {
  const page = context[OPERATOR_FLOW_CONTEXT_KEY.listPage]
  return typeof page === 'number' && page > 0 ? page : 1
}

function readStringContext(context: Record<string, unknown>, key: string): string | undefined {
  const value = context[key]
  return typeof value === 'string' ? value : undefined
}

function readNumberContext(context: Record<string, unknown>, key: string): number | undefined {
  const value = context[key]
  return typeof value === 'number' ? value : undefined
}

/** Spec 161 T14/T15: o descritor que o despachante escreveu — nunca lido de outra forma. */
function readIncomingImageContext(
  context: Record<string, unknown>,
): { readonly mediaId: string; readonly mimeType: string } | undefined {
  const value = context[WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY]
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as { mediaId?: unknown }).mediaId !== 'string' ||
    typeof (value as { mimeType?: unknown }).mimeType !== 'string'
  ) {
    return undefined
  }
  return value as { readonly mediaId: string; readonly mimeType: string }
}

/** Spec 161 T15: sai do passo de foto — apaga tudo que só ele usava (D8, jsonb enxuto). */
function clearPhotoStepContext(): Record<string, undefined> {
  return {
    [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined,
    [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: undefined,
    [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: undefined,
    [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId]: undefined,
    [OPERATOR_FLOW_CONTEXT_KEY.photoAnswer]: undefined,
    [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: undefined,
    [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: undefined,
  }
}

function isOperatorAction(value: string | undefined): value is OperatorTripActionId {
  return value === 'separate' || value === 'load' || value === 'dispatch' || value === 'occurrence'
}

export function createOperatorWhatsAppFlowActions(
  deps: OperatorFlowActionDependencies,
): readonly WhatsAppFlowActionDefinition[] {
  async function findWarehouseTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<WarehouseTrip | undefined> {
    const trips = await deps.listWarehouseTrips({ companyId: input.companyId })
    return trips.find((trip) => trip.id === input.tripId)
  }

  const listTrips: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const trips = await deps.listWarehouseTrips({ companyId: actor.scope.companyId })
    if (trips.length === 0) {
      await channel.sendText(session.whatsappNumber, 'Não há viagens no armazém agora.')
      return { next: 'menu' }
    }

    await sendDynamicChoice({
      body: 'Toque na viagem que você quer trabalhar.',
      channel,
      options: trips.map(toTripOption),
      page: readPage(context),
      to: session.whatsappNumber,
    })
    return { next: OPERATOR_FLOW_NODE.tripEntry }
  }

  const tripRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const answer = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripAnswer)
    if (answer === undefined) return { next: 'menu' }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: page },
        next: OPERATOR_FLOW_NODE.listTrips,
      }
    }

    const trip = await findWarehouseTrip({ companyId: actor.scope.companyId, tripId: answer })
    if (trip === undefined) {
      await channel.sendText(session.whatsappNumber, 'Esta viagem não está mais disponível.')
      return { context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined }, next: 'menu' }
    }

    return {
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.tripId]: trip.id,
      },
      next: OPERATOR_FLOW_NODE.tripActionMenu,
    }
  }

  const tripActionMenu: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const tripId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripId)
    if (tripId === undefined) return { next: 'menu' }

    const trip = await findWarehouseTrip({ companyId: actor.scope.companyId, tripId })
    if (trip === undefined) {
      await channel.sendText(session.whatsappNumber, 'Esta viagem não está mais disponível.')
      return { context: { [OPERATOR_FLOW_CONTEXT_KEY.tripId]: undefined }, next: 'menu' }
    }

    const actions = resolveOperatorTripActions({
      hasPendingDocuments: trip.documents.some(isUnloadedDocument),
      hasRoute: trip.hasRoute,
      tripStatus: trip.status,
    })
    if (actions.length === 0) {
      await channel.sendText(session.whatsappNumber, 'Esta viagem não aceita mais ações por aqui.')
      return { context: { [OPERATOR_FLOW_CONTEXT_KEY.tripId]: undefined }, next: 'menu' }
    }

    await sendDynamicChoice({
      body: 'O que você quer fazer com esta viagem?',
      channel,
      options: actions.map((action) => ({ id: action, title: OPERATOR_ACTION_LABEL[action] })),
      page: readPage(context),
      to: session.whatsappNumber,
    })
    return {
      context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: OPERATOR_FLOW_NODE.actionEntry,
    }
  }

  const actionRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const answer = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.actionAnswer)
    const tripId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripId)
    if (answer === undefined || tripId === undefined) return { next: 'menu' }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: page },
        next: OPERATOR_FLOW_NODE.tripActionMenu,
      }
    }
    if (!isOperatorAction(answer)) return { next: OPERATOR_FLOW_NODE.tripActionMenu }

    if (answer === 'dispatch') {
      const trip = await findWarehouseTrip({ companyId: actor.scope.companyId, tripId })
      const pending = trip?.documents.filter(isUnloadedDocument) ?? []
      if (pending.length > 0) {
        await channel.sendText(
          session.whatsappNumber,
          `Há ${pending.length} notas pendentes — despache pelo painel.`,
        )
        return { next: OPERATOR_FLOW_NODE.tripActionMenu }
      }
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: answer },
        next: OPERATOR_FLOW_NODE.dispatchConfirmMenu,
      }
    }

    return {
      context: { [OPERATOR_FLOW_CONTEXT_KEY.actionChoice]: answer },
      next: OPERATOR_FLOW_NODE.listDocuments,
    }
  }

  const listDocuments: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const step = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.actionChoice)
    const tripId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripId)
    if (!isOperatorAction(step) || tripId === undefined) return { next: 'menu' }

    const trip = await findWarehouseTrip({ companyId: actor.scope.companyId, tripId })
    if (trip === undefined) {
      await channel.sendText(session.whatsappNumber, 'Esta viagem não está mais disponível.')
      return { context: { [OPERATOR_FLOW_CONTEXT_KEY.tripId]: undefined }, next: 'menu' }
    }

    const candidates = trip.documents.filter((document) => {
      if (step === 'separate') return document.separationStatus === 'pending'
      if (step === 'load') return document.separationStatus === 'separated'
      return true
    })
    if (candidates.length === 0) {
      await channel.sendText(session.whatsappNumber, 'Não há notas para esta ação nesta viagem.')
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined },
        next: OPERATOR_FLOW_NODE.tripActionMenu,
      }
    }

    const options: WhatsAppMenuOption[] =
      step === 'separate' || step === 'load'
        ? [
            { id: OPERATOR_BATCH_ALL_ANSWER, title: '✅ Todas as pendentes' },
            ...candidates.map(toDocumentOption),
          ]
        : candidates.map(toDocumentOption)

    await sendDynamicChoice({
      body: 'Toque na nota da lista acima.',
      channel,
      options,
      page: readPage(context),
      to: session.whatsappNumber,
    })
    return { context: WHATSAPP_LIST_ANSWER_ATTEMPTS_RESET, next: OPERATOR_FLOW_NODE.documentEntry }
  }

  async function applyDocumentTransition(input: {
    readonly action: 'separate' | 'load'
    readonly actor: Actor
    readonly documentId: string
    readonly tripId: string
  }): Promise<TransitionTripDocumentResult> {
    const context = toContext(input.actor)
    return input.action === 'separate'
      ? deps.separateDocument({ context, documentId: input.documentId, tripId: input.tripId })
      : deps.loadDocument({ context, documentId: input.documentId, tripId: input.tripId })
  }

  async function applyBatch(input: {
    readonly action: 'separate' | 'load'
    readonly actor: Actor
    readonly documentIds: readonly string[]
    readonly tripId: string
  }): Promise<TransitionTripDocumentsBatchResult> {
    return deps.batchTransition({
      action: input.action,
      context: toContext(input.actor),
      documentIds: input.documentIds,
      tripId: input.tripId,
    })
  }

  const documentRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    node,
    session,
  }) => {
    const answer = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.documentAnswer)
    const step = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.actionChoice)
    const tripId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripId)
    if (answer === undefined || !isOperatorAction(step) || tripId === undefined) {
      return { next: 'menu' }
    }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: page },
        next: OPERATOR_FLOW_NODE.listDocuments,
      }
    }

    /**
     * T020 (B5): a resposta é conferida contra as notas **da viagem** relida, não só as da ação —
     * a nota já separada tocada de novo com a rede ruim tem de convergir em "Já estava registrada".
     */
    const currentTrip = await findWarehouseTrip({ companyId: actor.scope.companyId, tripId })
    if (currentTrip === undefined) {
      await channel.sendText(session.whatsappNumber, 'Esta viagem não está mais disponível.')
      return { context: { [OPERATOR_FLOW_CONTEXT_KEY.tripId]: undefined }, next: 'menu' }
    }
    const offered =
      (answer === OPERATOR_BATCH_ALL_ANSWER && step !== 'occurrence') ||
      currentTrip.documents.some((document) => document.id === answer)
    if (!offered) {
      return rejectListAnswer({
        channel,
        context,
        entryNode: OPERATOR_FLOW_NODE.documentEntry,
        node,
        session,
      })
    }

    if (step === 'occurrence') {
      return {
        context: {
          [OPERATOR_FLOW_CONTEXT_KEY.documentId]: answer,
          [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined,
        },
        next: OPERATOR_FLOW_NODE.listOccurrenceTypes,
      }
    }

    // `step` é `separate` ou `load` a partir daqui — `dispatch` nunca chega a esta lista de notas.
    if (step !== 'separate' && step !== 'load') return { next: OPERATOR_FLOW_NODE.tripActionMenu }

    if (answer === OPERATOR_BATCH_ALL_ANSWER) {
      const trip = await findWarehouseTrip({ companyId: actor.scope.companyId, tripId })
      const candidates = (trip?.documents ?? []).filter((document) =>
        step === 'separate'
          ? document.separationStatus === 'pending'
          : document.separationStatus === 'separated',
      )
      try {
        const result = await applyBatch({
          action: step,
          actor,
          documentIds: candidates.map((document) => document.id),
          tripId,
        })
        const applied = result.items.filter((item) => item.outcome === 'applied').length
        await channel.sendText(
          session.whatsappNumber,
          `${applied} de ${result.items.length} notas atualizadas. ✅`,
        )
      } catch (error) {
        await channel.sendText(session.whatsappNumber, describeTripError(error))
      }
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined },
        next: OPERATOR_FLOW_NODE.tripActionMenu,
      }
    }

    /**
     * `transitionTripDocument` não devolve se foi `applied` ou `unchanged` (a mesma forma dos dois
     * — `{document, tripStatus}` — é o que o painel consome). O status **antes** de chamar já diz:
     * se a nota já está no alvo, repetir a ação é o replay idempotente de RF-8.
     */
    const before = (
      await findWarehouseTrip({ companyId: actor.scope.companyId, tripId })
    )?.documents.find((document) => document.id === answer)
    const alreadyAtTarget =
      before?.separationStatus === (step === 'separate' ? 'separated' : 'loaded')

    try {
      await applyDocumentTransition({ action: step, actor, documentId: answer, tripId })
      await channel.sendText(
        session.whatsappNumber,
        alreadyAtTarget ? 'Já estava registrada.' : describeDocumentSuccess(step),
      )
    } catch (error) {
      await channel.sendText(session.whatsappNumber, describeTripError(error))
    }
    return {
      context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined },
      next: OPERATOR_FLOW_NODE.tripActionMenu,
    }
  }

  const dispatchConfirmRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const answer = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.dispatchConfirmAnswer)
    const tripId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripId)
    if (tripId === undefined) return { next: 'menu' }
    if (answer !== OPERATOR_DISPATCH_CONFIRM_ANSWER.confirm) {
      return { next: OPERATOR_FLOW_NODE.tripActionMenu }
    }

    try {
      const result = await deps.dispatchTrip({ context: toContext(actor), tripId })
      await channel.sendText(session.whatsappNumber, describeDispatchSuccess(result))
    } catch (error) {
      await channel.sendText(session.whatsappNumber, describeTripError(error))
    }
    return {
      context: { [OPERATOR_FLOW_CONTEXT_KEY.tripId]: undefined },
      next: OPERATOR_FLOW_NODE.listTrips,
    }
  }

  const listOccurrenceTypesAction: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const catalog = await deps.listOccurrenceTypes({ companyId: actor.scope.companyId })
    const options = catalog.filter((type) => type.active && type.stage === 'separation')
    if (options.length === 0) {
      await channel.sendText(
        session.whatsappNumber,
        'Ainda não há tipos de ocorrência cadastrados para o armazém. Fale com o escritório.',
      )
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined },
        next: OPERATOR_FLOW_NODE.tripActionMenu,
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
      next: OPERATOR_FLOW_NODE.occurrenceTypeEntry,
    }
  }

  const occurrenceTypeRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    node,
    session,
  }) => {
    const answer = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeAnswer)
    if (answer === undefined) return { next: OPERATOR_FLOW_NODE.tripActionMenu }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return {
        context: { [OPERATOR_FLOW_CONTEXT_KEY.listPage]: page },
        next: OPERATOR_FLOW_NODE.listOccurrenceTypes,
      }
    }

    const catalog = await deps.listOccurrenceTypes({ companyId: actor.scope.companyId })
    const offered = catalog.some(
      (type) => type.id === answer && type.active && type.stage === 'separation',
    )
    if (!offered) {
      return rejectListAnswer({
        channel,
        context,
        entryNode: OPERATOR_FLOW_NODE.occurrenceTypeEntry,
        node,
        session,
      })
    }

    return {
      context: {
        [OPERATOR_FLOW_CONTEXT_KEY.listPage]: undefined,
        [OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId]: answer,
      },
      next: OPERATOR_FLOW_NODE.notePrompt,
    }
  }

  const notePrompt: WhatsAppAuthorizedActionHandler = async ({ channel, session }) => {
    const body = `Alguma observação sobre a ocorrência? Digite o texto (até ${OPERATOR_OCCURRENCE_NOTE_MAX_LENGTH} caracteres) ou toque em Pular.`
    await channel.sendInteractiveList({
      body,
      buttonLabel: WHATSAPP_LIST_BUTTON_TEXT,
      rows: [{ id: OPERATOR_NOTE_SKIP_ANSWER, title: '⏭️ Pular' }],
      to: session.whatsappNumber,
    })
    return { next: OPERATOR_FLOW_NODE.noteEntry }
  }

  /**
   * Spec 161 T15 (RF18/D1/RF4): a observação não completa mais a ocorrência — pede a foto. Sem
   * foto nada é registrado (a ocorrência só nasce com a primeira, D1); é isso que o aviso diz.
   */
  const photoPrompt: WhatsAppAuthorizedActionHandler = async ({ channel, context, session }) => {
    const answer = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.noteAnswer)
    const documentId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.documentId)
    const occurrenceTypeId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId)
    const tripId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripId)
    if (
      answer === undefined ||
      documentId === undefined ||
      occurrenceTypeId === undefined ||
      tripId === undefined
    ) {
      return { next: OPERATOR_FLOW_NODE.tripActionMenu }
    }

    const note = answer === OPERATOR_NOTE_SKIP_ANSWER ? '' : answer.trim()
    if (note.length > OPERATOR_OCCURRENCE_NOTE_MAX_LENGTH) {
      await channel.sendText(
        session.whatsappNumber,
        `Observação muito longa (máximo ${OPERATOR_OCCURRENCE_NOTE_MAX_LENGTH} caracteres). Digite de novo ou toque em Pular.`,
      )
      return { next: OPERATOR_FLOW_NODE.notePrompt }
    }

    await channel.sendInteractiveList({
      body: 'Sem foto nada é registrado. Envie a foto da ocorrência; depois de anexar ao menos uma, toque em ✅ Concluir. Para desistir, toque em ❌ Cancelar ocorrência.',
      buttonLabel: WHATSAPP_LIST_BUTTON_TEXT,
      rows: [
        { id: OPERATOR_OCCURRENCE_PHOTO_ANSWER.done, title: '✅ Concluir' },
        { id: OPERATOR_OCCURRENCE_PHOTO_ANSWER.cancel, title: '❌ Cancelar ocorrência' },
      ],
      to: session.whatsappNumber,
    })
    /** A observação já resolvida (`Pular` virou `''`) some do lugar cru e some para o passo de
     * foto reler sem repetir a lógica de `OPERATOR_NOTE_SKIP_ANSWER`. */
    return {
      context: { [OPERATOR_FLOW_CONTEXT_KEY.noteAnswer]: note },
      next: OPERATOR_FLOW_NODE.photoEntry,
    }
  }

  /**
   * Spec 161 T15 (RF18b/RF18c/RF19/RF20): baixa a imagem por `channel.fetchMediaAsBase64` (o
   * `media-id` some do contexto no mesmo turno — T14), valida e grava a primeira foto pela mesma
   * `persistSeparationOccurrenceWithAttachment` da rota HTTP (T13), as demais por
   * `attachOccurrencePhoto` (T7). Texto que não é `Concluir`/`Cancelar` conta para o handoff (D8) —
   * contador próprio deste passo, porque o do despachante é zerado a cada turno antes de a
   * `FlowAction` rodar.
   */
  const photoRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const documentId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.documentId)
    const occurrenceTypeId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.occurrenceTypeId)
    const tripId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.tripId)
    if (documentId === undefined || occurrenceTypeId === undefined || tripId === undefined) {
      return { next: OPERATOR_FLOW_NODE.tripActionMenu }
    }
    const note = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.noteAnswer) ?? ''
    const occurrenceId = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.occurrenceId)
    const photoCount = readNumberContext(context, OPERATOR_FLOW_CONTEXT_KEY.photoCount) ?? 0

    const image = readIncomingImageContext(context)
    if (image !== undefined) {
      return handlePhotoUpload({
        actor,
        channel,
        documentId,
        image,
        note,
        occurrenceId,
        occurrenceTypeId,
        photoCount,
        session,
        tripId,
      })
    }

    const answer = readStringContext(context, OPERATOR_FLOW_CONTEXT_KEY.photoAnswer)
    if (answer === OPERATOR_OCCURRENCE_PHOTO_ANSWER.done) {
      if (occurrenceId === undefined) {
        await channel.sendText(
          session.whatsappNumber,
          'Ainda não há foto anexada. Envie ao menos uma antes de concluir.',
        )
        return { next: OPERATOR_FLOW_NODE.photoEntry }
      }
      await channel.sendText(
        session.whatsappNumber,
        `Ocorrência registrada com ${photoCount} foto(s). ✅`,
      )
      return { context: clearPhotoStepContext(), next: OPERATOR_FLOW_NODE.tripActionMenu }
    }
    if (answer === OPERATOR_OCCURRENCE_PHOTO_ANSWER.cancel) {
      await channel.sendText(
        session.whatsappNumber,
        occurrenceId === undefined
          ? 'Ocorrência cancelada — nada foi registrado.'
          : `Encerrado. A ocorrência já registrada com ${photoCount} foto(s) continua salva.`,
      )
      return { context: clearPhotoStepContext(), next: OPERATOR_FLOW_NODE.tripActionMenu }
    }

    /** Qualquer outra resposta (texto, ou uma opção que não existe) não é imagem nem um dos dois
     * botões — conta para o handoff, como qualquer resposta fora do menu (D8). */
    const attempts =
      (readNumberContext(context, OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts) ?? 0) + 1
    if (attempts >= WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF) {
      throw new WhatsAppCommandHandoffRequestedError()
    }
    await channel.sendText(
      session.whatsappNumber,
      'Envie a foto, toque em ✅ Concluir ou em ❌ Cancelar ocorrência.',
    )
    return {
      context: { [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: attempts },
      next: OPERATOR_FLOW_NODE.photoEntry,
    }
  }

  /**
   * Spec 161 T15 (RF19/RF20): a foto baixada vira a primeira (`registerOccurrence`, T13) ou uma
   * das seguintes (`attachOccurrencePhoto`, T7) — teto de bytes do WhatsApp é `OFFICE_PROOF_MAX_BYTES`
   * (960 KiB), maior que o da web (D13/T15: o teto virou parâmetro para isso), porque a foto do
   * WhatsApp não passa pelo reencode do navegador.
   */
  async function handlePhotoUpload(input: {
    readonly actor: Actor
    readonly channel: Parameters<WhatsAppAuthorizedActionHandler>[0]['channel']
    readonly documentId: string
    readonly image: { readonly mediaId: string; readonly mimeType: string }
    readonly note: string
    readonly occurrenceId: string | undefined
    readonly occurrenceTypeId: string
    readonly photoCount: number
    readonly session: Parameters<WhatsAppAuthorizedActionHandler>[0]['session']
    readonly tripId: string
  }): Promise<import('@adatechnology/meta-whatsapp-contracts').FlowActionResult> {
    const {
      actor,
      channel,
      documentId,
      image,
      note,
      occurrenceId,
      occurrenceTypeId,
      session,
      tripId,
    } = input

    let downloaded: { readonly data: string; readonly mimeType: string }
    try {
      downloaded = await channel.fetchMediaAsBase64(image.mediaId)
    } catch {
      /** RF20 (falha de download não grava ocorrência): nunca loga `mediaId`. */
      await channel.sendText(session.whatsappNumber, 'Não consegui baixar a foto. Envie de novo.')
      return { next: OPERATOR_FLOW_NODE.photoEntry }
    }
    const attachment = {
      bytes: Uint8Array.from(Buffer.from(downloaded.data, 'base64')),
      mimeType: downloaded.mimeType,
    }

    try {
      if (occurrenceId === undefined) {
        const registered = await deps.registerOccurrence({
          actorUserId: actor.scope.userId,
          attachment,
          companyId: actor.scope.companyId,
          documentId,
          note,
          occurrenceTypeId,
          tripId,
        })
        await channel.sendText(
          session.whatsappNumber,
          'Foto 1 anexada. Envie outra, toque em ✅ Concluir ou em ❌ Cancelar ocorrência.',
        )
        return {
          context: {
            [OPERATOR_FLOW_CONTEXT_KEY.occurrenceId]: registered.id,
            [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: 1,
            [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: 0,
          },
          next: OPERATOR_FLOW_NODE.photoEntry,
        }
      }

      const position = await deps.attachOccurrencePhoto({
        actorUserId: actor.scope.userId,
        attachment,
        companyId: actor.scope.companyId,
        occurrenceId,
      })
      await channel.sendText(
        session.whatsappNumber,
        `Foto ${position.position} anexada. Envie outra, toque em ✅ Concluir ou em ❌ Cancelar ocorrência.`,
      )
      return {
        context: {
          [OPERATOR_FLOW_CONTEXT_KEY.photoCount]: position.position,
          [OPERATOR_FLOW_CONTEXT_KEY.photoInvalidAttempts]: 0,
        },
        next: OPERATOR_FLOW_NODE.photoEntry,
      }
    } catch (error) {
      if (error instanceof TripOccurrenceAttachmentLimitError) {
        await channel.sendText(
          session.whatsappNumber,
          `Limite de 5 fotos por ocorrência atingido. Ocorrência registrada com ${input.photoCount} foto(s). ✅`,
        )
        return { context: clearPhotoStepContext(), next: OPERATOR_FLOW_NODE.tripActionMenu }
      }
      await channel.sendText(session.whatsappNumber, describeTripError(error))
      return { next: OPERATOR_FLOW_NODE.photoEntry }
    }
  }

  return [
    { handler: listTrips, kind: OPERATOR_FLOW_ACTION_KIND.listTrips, policy: OPERATOR_READ_POLICY },
    {
      handler: tripRouter,
      kind: OPERATOR_FLOW_ACTION_KIND.tripRouter,
      policy: OPERATOR_READ_POLICY,
    },
    {
      handler: tripActionMenu,
      kind: OPERATOR_FLOW_ACTION_KIND.tripActionMenu,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: actionRouter,
      kind: OPERATOR_FLOW_ACTION_KIND.actionRouter,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: listDocuments,
      kind: OPERATOR_FLOW_ACTION_KIND.listDocuments,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: documentRouter,
      kind: OPERATOR_FLOW_ACTION_KIND.documentRouter,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: dispatchConfirmRouter,
      kind: OPERATOR_FLOW_ACTION_KIND.dispatchConfirmRouter,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: listOccurrenceTypesAction,
      kind: OPERATOR_FLOW_ACTION_KIND.listOccurrenceTypes,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: occurrenceTypeRouter,
      kind: OPERATOR_FLOW_ACTION_KIND.occurrenceTypeRouter,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: notePrompt,
      kind: OPERATOR_FLOW_ACTION_KIND.notePrompt,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: photoPrompt,
      kind: OPERATOR_FLOW_ACTION_KIND.photoPrompt,
      policy: OPERATOR_MANAGE_POLICY,
    },
    {
      handler: photoRouter,
      kind: OPERATOR_FLOW_ACTION_KIND.photoRouter,
      policy: OPERATOR_MANAGE_POLICY,
    },
  ]
}

function describeDocumentSuccess(step: 'separate' | 'load'): string {
  const verb = step === 'separate' ? 'Separação' : 'Carregamento'
  return `${verb} registrado. ✅`
}

function describeDispatchSuccess(result: DispatchTripResult): string {
  return result.tripStatus === 'dispatched'
    ? 'Viagem despachada. 🚚'
    : 'A viagem já estava despachada.'
}

/** Portão recusado (409), pendência e nota inalcançável viram mensagem clara — nunca erro cru (D7). */
function describeTripError(error: unknown): string {
  if (error instanceof TripStateTransitionNotAllowedError) {
    return OPERATOR_TRANSITION_BLOCK_MESSAGES[error.reason]
  }
  if (error instanceof TripHasUnloadedDocumentsError) {
    return `Há ${error.documentIds.length} notas pendentes — despache pelo painel.`
  }
  if (error instanceof TripHasUnscheduledStopsError) {
    return 'Há paradas sem agendamento — despache pelo painel.'
  }
  if (error instanceof TripDispatchForceReasonRequiredError) {
    return 'Esta viagem precisa de despacho forçado — use o painel.'
  }
  if (error instanceof TripDocumentNotFoundError || error instanceof TripNotFoundError) {
    return 'Essa nota não está mais disponível nesta viagem.'
  }
  /**
   * Spec 161 T15 (RF20): a mesma validação de bytes/tipo/assinatura de T6/T7
   * (`assertOccurrenceUploadAccepted`) reaproveitada — `describeTripError` ganha os dois casos que
   * `TripDeliveryProofRejectedError` já cobre para o canhoto, agora também para a foto do WhatsApp.
   * A mensagem diz o limite (o do WhatsApp, `OFFICE_PROOF_MAX_BYTES` — 960 KiB) e a saída.
   */
  if (
    error instanceof TripDeliveryProofRejectedError &&
    error.code === 'TRIP_DELIVERY_PROOF_TOO_LARGE'
  ) {
    return `Essa foto é maior que o tamanho aceito (${Math.floor(OFFICE_PROOF_MAX_BYTES / 1024)} KiB). Envie uma foto menor ou toque em ❌ Cancelar ocorrência.`
  }
  if (
    error instanceof TripDeliveryProofRejectedError &&
    error.code === 'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE'
  ) {
    return 'O arquivo enviado precisa ser uma imagem (JPEG, PNG ou WEBP). Envie a foto de novo ou toque em ❌ Cancelar ocorrência.'
  }
  /**
   * Spec 161 T16 (RF20b): a mesma chave (sha256 do arquivo) com nota/tipo/produto diferentes —
   * caso raro, nunca deveria acontecer com a mesma foto, mas a idempotência não deixa passar em
   * silêncio (é erro do cliente, não repetição, no mesmo molde de `TripFieldReportKeyReusedError`
   * na web).
   */
  if (error instanceof TripFieldReportKeyReusedError) {
    return 'Essa foto já foi processada com outros dados. Envie a foto de novo.'
  }
  throw error
}
