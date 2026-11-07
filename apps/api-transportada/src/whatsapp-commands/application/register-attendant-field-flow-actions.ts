/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21: **o atendente direto com o bot** (conversa individual, spec 144). Três ações do fluxo:
 *
 * - `fieldCommand`: "entreguei 17234 17235" baixa as notas pelo caminho do escritório (as mesmas funções
 *   das rotas `field-delivery`), e "encerrar a rota [NF]" escolhe a viagem pela NF ou pela lista das
 *   viagens na rua;
 * - `tripRouter`: o toque numa viagem da lista, que leva à confirmação;
 * - `closeRouter`: o "1 - Sim / 2 - Não" que chama a função de `POST /trips/:id/close`.
 *
 * Quantas notas seguem abertas vem de `countOpenTripDocumentsForClose`, a regra do servidor.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  countOpenTripDocumentsForClose,
  type TripCloseDocumentState,
} from '../../trips/domain/trip-close.policy.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../../trips/domain/trip-permission.constant.js'
import {
  ATTENDANT_CLOSE_ANSWER,
  ATTENDANT_FLOW_ACTION_KIND,
  ATTENDANT_FLOW_CONTEXT_KEY,
  ATTENDANT_FLOW_NODE,
  ATTENDANT_TEXT,
} from '../domain/whatsapp-attendant-flow.constant.js'
import {
  interpretWhatsAppDriverEventCommand,
  WHATSAPP_DRIVER_COMMAND_MAX_DOCUMENTS,
} from '../domain/whatsapp-driver-event-command.policy.js'
import type { WhatsAppDriverEventResult } from './whatsapp-driver-events.service.js'
import { parseMenuPageNavigation } from '../domain/whatsapp-menu.policy.js'
import { formatAttendantBatch } from '../domain/whatsapp-message-format.policy.js'
import { interpretCloseTripCommand } from '../domain/whatsapp-trip-close-command.policy.js'
import { sendDynamicChoice } from './whatsapp-dynamic-choice.service.js'
import type {
  WhatsAppAuthorizedActionHandler,
  WhatsAppFlowActionDefinition,
} from './with-authorized-actor.service.js'

export type AttendantRoadDocument = TripCloseDocumentState & {
  readonly id: string
  readonly number: string
}

export type AttendantRoadTrip = {
  readonly documents: readonly AttendantRoadDocument[]
  readonly id: string
  readonly vehiclePlate: string
}

/** O comando já interpretado que o despachante grava no contexto da sessão. */
export type AttendantFieldCommand =
  | { readonly kind: 'close'; readonly documentNumber: null | string }
  | { readonly kind: 'deliver'; readonly numbers: readonly string[] }
  | { readonly kind: 'too_many_documents' }

export type AttendantFieldDependencies = {
  readonly closeTrip: (input: {
    readonly context: CompanyContext
    readonly tripId: string
  }) => Promise<unknown>
  /** A baixa pelo escritório (mesma função da rota); o motorista é o efetivo da viagem da nota. */
  readonly deliverDocument: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly idempotencyKey: string
  }) => Promise<WhatsAppDriverEventResult>
  readonly listRoadTrips: (input: {
    readonly companyId: string
  }) => Promise<readonly AttendantRoadTrip[]>
}

const POLICY = { permission: TRIP_REPORT_ON_BEHALF_PERMISSION, scope: 'company' } as const
const KEY = ATTENDANT_FLOW_CONTEXT_KEY
const NODE = ATTENDANT_FLOW_NODE

const stripZeros = (value: string) => value.trim().replace(/^0+(?=\d)/u, '')

function isOpenDocument(document: AttendantRoadDocument): boolean {
  return countOpenTripDocumentsForClose([document]) > 0
}

function readString(context: Record<string, unknown>, key: string): string | undefined {
  const value = context[key]
  return typeof value === 'string' ? value : undefined
}

function readStrings(context: Record<string, unknown>, key: string): readonly string[] {
  const value = context[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function readCommand(context: Record<string, unknown>): AttendantFieldCommand | undefined {
  const value = context[KEY.fieldCommand]
  if (typeof value !== 'object' || value === null) return undefined
  const kind = (value as { kind?: unknown }).kind
  if (kind === 'too_many_documents') return { kind }
  if (kind === 'close') {
    const number = (value as { documentNumber?: unknown }).documentNumber
    return { documentNumber: typeof number === 'string' ? number : null, kind }
  }
  const numbers = (value as { numbers?: unknown }).numbers
  if (kind === 'deliver' && Array.isArray(numbers)) {
    return { kind, numbers: numbers.filter((item): item is string => typeof item === 'string') }
  }
  return undefined
}

/** O texto digitado vira o comando do atendente (baixa ou encerrar a rota), ou `undefined`. */
export function interpretAttendantFieldCommand(text: string): AttendantFieldCommand | undefined {
  const close = interpretCloseTripCommand(text)
  if (close !== null) return { documentNumber: close.documentNumber, kind: 'close' }
  const event = interpretWhatsAppDriverEventCommand(text)
  if (event?.kind === 'deliver') return { kind: 'deliver', numbers: event.numbers }
  if (event?.kind === 'too_many_documents') return { kind: 'too_many_documents' }
  return undefined
}

export function createAttendantFieldFlowActions(
  deps: AttendantFieldDependencies,
): readonly WhatsAppFlowActionDefinition[] {
  const cleared = {
    [KEY.closeAnswer]: undefined,
    [KEY.closeOpenNumbers]: undefined,
    [KEY.fieldCommand]: undefined,
    [KEY.listPage]: undefined,
    [KEY.tripAnswer]: undefined,
    [KEY.tripId]: undefined,
  }

  async function askClose(input: {
    readonly channel: Parameters<WhatsAppAuthorizedActionHandler>[0]['channel']
    readonly session: Parameters<WhatsAppAuthorizedActionHandler>[0]['session']
    readonly trip: AttendantRoadTrip
  }) {
    const openNumbers = input.trip.documents
      .filter(isOpenDocument)
      .map((document) => document.number)
    await input.channel.sendText(input.session.whatsappNumber, ATTENDANT_TEXT.confirm(openNumbers))
    return {
      context: { ...cleared, [KEY.closeOpenNumbers]: openNumbers, [KEY.tripId]: input.trip.id },
      next: NODE.closeMenu,
    }
  }

  const fieldCommand: WhatsAppAuthorizedActionHandler = async (input) => {
    const { actor, channel, context, session } = input
    const to = session.whatsappNumber
    const command = readCommand(context)
    if (command === undefined) return { context: cleared, next: 'menu' }

    if (command.kind === 'too_many_documents') {
      await channel.sendText(to, ATTENDANT_TEXT.tooManyNotes(WHATSAPP_DRIVER_COMMAND_MAX_DOCUMENTS))
      return { context: cleared, next: 'menu' }
    }
    const trips = await deps.listRoadTrips({ companyId: actor.scope.companyId })

    if (command.kind === 'deliver') {
      if (command.numbers.length === 0) {
        await channel.sendText(to, ATTENDANT_TEXT.askNumbers)
        return { context: cleared, next: 'menu' }
      }
      await channel.sendText(to, await deliverNotes({ actor, command, trips }))
      return { context: cleared, next: 'menu' }
    }

    if (command.documentNumber !== null) {
      const wanted = stripZeros(command.documentNumber)
      const trip = trips.find((candidate) =>
        candidate.documents.some((document) => stripZeros(document.number) === wanted),
      )
      if (trip === undefined) {
        await channel.sendText(to, ATTENDANT_TEXT.tripNotFound(wanted))
        return { context: cleared, next: 'menu' }
      }
      return askClose({ channel, session, trip })
    }
    const [only, ...others] = trips
    if (only === undefined) {
      await channel.sendText(to, ATTENDANT_TEXT.noRoadTrips)
      return { context: cleared, next: 'menu' }
    }
    if (others.length === 0) return askClose({ channel, session, trip: only })
    await sendDynamicChoice({
      body: ATTENDANT_TEXT.tripChoice,
      channel,
      options: trips.map((trip) => ({
        id: trip.id,
        title: `${trip.vehiclePlate} · ${countOpenTripDocumentsForClose(trip.documents)} abertas`,
      })),
      page: 1,
      to,
    })
    return { context: { ...cleared, [KEY.fieldCommand]: command }, next: NODE.tripEntry }
  }

  async function deliverNotes(input: {
    readonly actor: Parameters<WhatsAppAuthorizedActionHandler>[0]['actor']
    readonly command: { readonly numbers: readonly string[] }
    readonly trips: readonly AttendantRoadTrip[]
  }): Promise<string> {
    const open = input.trips.flatMap((trip) => trip.documents).filter(isOpenDocument)
    const wanted = input.command.numbers.map(stripZeros)
    const found = wanted.flatMap((number) => {
      const document = open.find((item) => stripZeros(item.number) === number)
      return document === undefined ? [] : [{ document, number }]
    })
    const settled = await Promise.allSettled(
      found.map(({ document }) =>
        deps.deliverDocument({
          actorUserId: input.actor.scope.userId,
          companyId: input.actor.scope.companyId,
          documentId: document.id,
          idempotencyKey: `whatsapp-attendant:${document.id}`,
        }),
      ),
    )
    const registered: string[] = []
    const pendingProof: string[] = []
    const alreadyDone: string[] = []
    const failed: string[] = []
    settled.forEach((result, index) => {
      const number = found[index]?.number ?? ''
      if (result.status === 'rejected') return void failed.push(number)
      const value = result.value
      if (value.kind === 'already_registered') return void alreadyDone.push(number)
      if (value.kind === 'refused') return void failed.push(number)
      registered.push(number)
      if (value.details?.proofPending === true) pendingProof.push(number)
    })
    const missing = wanted.filter((number) => !found.some((item) => item.number === number))
    return formatAttendantBatch({ alreadyDone, failed, missing, pendingProof, registered })
  }

  const tripRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const answer = readString(context, KEY.tripAnswer)
    if (answer === undefined) return { context: cleared, next: 'menu' }
    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      await sendDynamicChoice({
        body: ATTENDANT_TEXT.tripChoice,
        channel,
        options: (await deps.listRoadTrips({ companyId: actor.scope.companyId })).map((trip) => ({
          id: trip.id,
          title: `${trip.vehiclePlate} · ${countOpenTripDocumentsForClose(trip.documents)} abertas`,
        })),
        page,
        to: session.whatsappNumber,
      })
      return { context: { [KEY.tripAnswer]: undefined }, next: NODE.tripEntry }
    }
    const trips = await deps.listRoadTrips({ companyId: actor.scope.companyId })
    const trip = trips.find((candidate) => candidate.id === answer)
    if (trip === undefined) {
      await channel.sendText(session.whatsappNumber, ATTENDANT_TEXT.tripUnavailable)
      return { context: cleared, next: 'menu' }
    }
    return askClose({ channel, session, trip })
  }

  const closeRouter: WhatsAppAuthorizedActionHandler = async ({
    actor,
    channel,
    context,
    session,
  }) => {
    const to = session.whatsappNumber
    const tripId = readString(context, KEY.tripId)
    const answer = readString(context, KEY.closeAnswer)
    if (tripId === undefined || answer !== ATTENDANT_CLOSE_ANSWER.confirm) {
      if (answer === ATTENDANT_CLOSE_ANSWER.cancel) {
        await channel.sendText(to, ATTENDANT_TEXT.cancelled)
      }
      return { context: cleared, next: 'menu' }
    }
    try {
      await deps.closeTrip({ context: actor.scope, tripId })
      await channel.sendText(to, ATTENDANT_TEXT.closed(readStrings(context, KEY.closeOpenNumbers)))
    } catch {
      await channel.sendText(to, ATTENDANT_TEXT.closeFailed)
    }
    return { context: cleared, next: 'menu' }
  }

  return [
    { handler: fieldCommand, kind: ATTENDANT_FLOW_ACTION_KIND.fieldCommand, policy: POLICY },
    { handler: tripRouter, kind: ATTENDANT_FLOW_ACTION_KIND.tripRouter, policy: POLICY },
    { handler: closeRouter, kind: ATTENDANT_FLOW_ACTION_KIND.closeRouter, policy: POLICY },
  ]
}
