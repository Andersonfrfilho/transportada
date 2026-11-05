/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { fleetDrivers, userCompanyMemberships } from '../../database/database.schema.js'
import { TRIP_TERMINAL_STATUSES } from '../../database/trip.schema.js'
import type { DriverTrip } from '../../trips/application/find-current-driver-trip.use-case.js'
import type { DriverClientContactsUseCase } from '../../delivery-clients/application/driver-client-contacts.use-case.js'
import {
  DeliveryClientEmailLimitReachedError,
  DeliveryClientNotFoundError,
} from '../../delivery-clients/domain/delivery-client.error.js'
import { DriverClientEmailInvalidError } from '../../delivery-clients/domain/driver-client-contact.error.js'
import { ContractorReplyWhatsAppNumberInvalidError } from '../../occurrence-conversation/domain/contractor-reply-whatsapp.error.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import type { TripOccurrence } from '../../trips/application/register-trip-occurrence.use-case.js'
import { sameBrazilianPhone } from './whatsapp-group-delivery.adapter.js'
import { listOccurrenceTypesForNote } from '../../trips/infrastructure/occurrence-types-for-note.query.js'
import {
  type DriverFlowActionDependencies,
  isOfferedToDriver,
} from '../../whatsapp-commands/application/register-driver-flow-actions.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
  type BotSpeechLine,
  type WhatsAppBotSpeechPort,
} from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  describeWhatsAppDriverEventResult,
  WHATSAPP_GROUP_EVENT_FAILED,
} from '../../whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import {
  refuseWhatsAppDriverEvent,
  registerWhatsAppDriverOccurrence,
  WHATSAPP_DRIVER_EVENT,
  type WhatsAppDriverEventResult,
} from '../../whatsapp-commands/application/whatsapp-driver-events.service.js'
import type { WhatsAppDeliveryPreparations } from '../../whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type { WhatsAppOccurrenceDrafts } from '../../whatsapp-commands/application/whatsapp-occurrence-draft.service.js'
import { BOT_SPEECH_DEFAULTS } from '../../whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import type {
  GroupOccurrenceFlowPorts,
  GroupOccurrenceRegistration,
} from '../application/whatsapp-group-occurrence-flow.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Os padrões das falas de recusa do grupo (spec 293 T11: catálogo `group*` das falas do bot). */
export const GROUP_OCCURRENCE_REFUSAL = {
  documentGone: BOT_SPEECH_DEFAULTS.groupDocumentNotReachable,
  failed: BOT_SPEECH_DEFAULTS.groupRegisterFailed,
  noAccess: BOT_SPEECH_DEFAULTS.groupDriverWithoutAccess,
} as const

/**
 * Spec 292 T5: as portas do fluxo do grupo montadas sobre o que o WhatsApp do motorista já usa —
 * as viagens ativas do motorista, a lista de tipos da nota (`isOfferedToDriver`: só tipo ativo) e o
 * mesmo `registerDriverOccurrence`. A ocorrência fica no nome do motorista do grupo (regra 11): o
 * autor é a conta dele, por isso motorista sem acesso ao app não registra pelo grupo.
 */
export function createGroupOccurrencePorts(dependencies: {
  /** Spec 292 T6: os contatos do cliente da nota (a mesma regra do app); sem isto o passo do contato some. */
  readonly contacts?: DriverClientContactsUseCase
  /** A localização que o motorista compartilhou no grupo há pouco (opcional); lida uma vez e esquecida. */
  readonly consumeLocation?: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => null | ReportedLocation
  /**
   * Spec 293 T15: a ocorrência em coleta (foto, número, valor pago) e a fachada que manda a resposta em
   * texto para a coleta certa. Ausentes, o tipo que pede o que o WhatsApp não colhe é recusado como antes.
   */
  readonly collections?: {
    readonly answers: WhatsAppDeliveryPreparations
    readonly occurrences: WhatsAppOccurrenceDrafts
  }
  readonly database: Database
  readonly listActiveTrips: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly DriverTrip[]>
  readonly logger?: { warn(message: string, fields?: Record<string, unknown>): void }
  readonly registerOccurrence: (
    input: Parameters<DriverFlowActionDependencies['registerOccurrence']>[0],
  ) => Promise<TripOccurrence>
  /** Spec 293 T11: as falas editáveis do grafo; sem isto, o padrão do código. */
  readonly speech?: WhatsAppBotSpeechPort
}): GroupOccurrenceFlowPorts {
  const terminal = new Set<string>(TRIP_TERMINAL_STATUSES)
  const speech = dependencies.speech ?? CATALOG_BOT_SPEECH

  async function refusedWith(
    companyId: string,
    line: BotSpeechLine,
    retry: 'note' | 'type' | null,
  ): Promise<GroupOccurrenceRegistration> {
    return {
      kind: 'refused',
      message: await renderBotSpeechLine({ companyId, line, speech }),
      retry,
    }
  }

  const contacts = dependencies.contacts
  const contactPorts: Pick<GroupOccurrenceFlowPorts, 'addClientContact' | 'listClientContacts'> =
    contacts === undefined
      ? {}
      : {
          async addClientContact(input) {
            const userId = await findDriverUserId(dependencies.database, input)
            if (userId === null) return { kind: 'refused', reason: 'o motorista não tem acesso' }
            try {
              const { contact } = await contacts.add({
                actor: { ...actorOf(input, userId) },
                address: input.address,
                channel: input.channel,
                documentId: input.documentId,
                label: 'Informado pelo grupo',
              })
              return {
                contact: { addressMasked: contact.addressMasked, channel: input.channel },
                kind: 'added',
              }
            } catch (error) {
              return { kind: 'refused', reason: describeContactFailure(error) }
            }
          },
          async listClientContacts(input) {
            const userId = await findDriverUserId(dependencies.database, input)
            if (userId === null) return []
            try {
              const list = await contacts.list({
                actor: actorOf(input, userId),
                documentId: input.documentId,
              })
              return list.map((contact) => ({
                addressMasked: contact.addressMasked,
                channel: contact.channel,
              }))
            } catch {
              return []
            }
          },
        }

  return {
    ...contactPorts,
    async isCrewMember({ companyId, phone }) {
      const rows = await dependencies.database
        .select({ phone: fleetDrivers.phone })
        .from(fleetDrivers)
        .where(eq(fleetDrivers.companyId, companyId))
      return rows.some((row) => sameBrazilianPhone(row.phone, phone))
    },
    async answerCollection({ companyId, driverId, text }) {
      const collections = dependencies.collections
      if (collections === undefined) return null
      const actorUserId = await findDriverUserId(dependencies.database, { companyId, driverId })
      if (actorUserId === null) return null
      // A coleta terminou (a foto fechou, ou o motorista cancelou pelo individual): o pedido fecha.
      if (!(await collections.occurrences.hasOpen({ companyId, driverId }))) {
        return { awaitingText: false, replies: [] }
      }
      const answered = await collections.answers.answer({
        actor: { actorUserId, companyId, driverId },
        text,
      })
      return answered === null
        ? null
        : { awaitingText: answered.awaitingText, replies: answered.texts }
    },

    async listDriverDocuments({ companyId, driverId }) {
      const trips = await dependencies.listActiveTrips({ companyId, driverId })
      const seen = new Map<string, { id: string; number: string }>()
      for (const trip of trips) {
        if (terminal.has(trip.status)) continue
        for (const stop of trip.stops) {
          for (const document of stop.documents) {
            if (!seen.has(document.id))
              seen.set(document.id, { id: document.id, number: document.number })
          }
        }
      }
      return [...seen.values()]
    },

    async listOccurrenceTypes({ companyId, documentId }) {
      const types = await listOccurrenceTypesForNote(dependencies.database, {
        companyId,
        documentId,
      })
      return types
        .filter(isOfferedToDriver)
        .map((type) => ({ contactChannels: contactChannelsOf(type), id: type.id, name: type.name }))
    },

    /**
     * Spec 293 T11: pela camada comum dos eventos (a mesma do WhatsApp individual). A ocorrência fica
     * no nome do motorista do grupo: sem conta ativa, recusa com a frase do grupo.
     */
    async register(input) {
      const actorUserId = await findDriverUserId(dependencies.database, input)
      let result: WhatsAppDriverEventResult
      if (actorUserId === null) {
        result = refuseWhatsAppDriverEvent(WHATSAPP_DRIVER_EVENT.occurrence, {
          code: 'driver_without_access',
        })
      } else {
        try {
          const collecting = await dependencies.collections?.occurrences.begin({
            actor: { actorUserId, companyId: input.companyId, driverId: input.driverId },
            channel: 'group',
            documentId: input.documentId,
            documentNumber: input.documentNumber,
            location: null,
            note: input.note,
            occurrenceTypeId: input.occurrenceTypeId,
          })
          if (collecting !== undefined && collecting !== null) {
            return {
              awaitingText: collecting.awaitingText,
              kind: 'collecting',
              replies: collecting.texts,
            }
          }
          result = await registerWhatsAppDriverOccurrence(dependencies, {
            actorUserId,
            companyId: input.companyId,
            documentId: input.documentId,
            driverId: input.driverId,
            idempotencyKey: input.idempotencyKey,
            location: dependencies.consumeLocation?.(input) ?? null,
            note: input.note,
            occurrenceTypeId: input.occurrenceTypeId,
          })
        } catch (error) {
          dependencies.logger?.warn('whatsapp_group_request.register_failed', {
            companyId: input.companyId,
            errorName: error instanceof Error ? error.name : typeof error,
          })
          return refusedWith(input.companyId, WHATSAPP_GROUP_EVENT_FAILED, null)
        }
      }
      if (result.kind !== 'refused') {
        return {
          kind: 'registered',
          summary: await noteSummaryOf(dependencies.database, input).catch(() => ({
            clientName: '',
            series: '',
          })),
        }
      }
      const { refusal } = result
      const retry =
        refusal.code !== 'occurrence_requirement'
          ? null
          : refusal.field === 'note'
            ? 'note'
            : refusal.field === 'contractor_scope'
              ? 'type'
              : null
      return refusedWith(
        input.companyId,
        describeWhatsAppDriverEventResult(result, { kind: 'group' }),
        retry,
      )
    },
  }
}

/** A série e o destinatário da nota da viagem, para o resumo do registro no grupo; vazios quando não há. */
async function noteSummaryOf(
  database: Database,
  input: { readonly companyId: string; readonly documentId: string },
): Promise<{ readonly clientName: string; readonly series: string }> {
  const [row] = (await database.execute(sql`
    select coalesce(note.series, '') as series,
           coalesce((select coalesce(nullif(participant.legal_name, ''), nullif(participant.trade_name, ''))
                       from nfe_participants participant
                      where participant.company_id = note.company_id and participant.document_id = note.id
                        and participant.role = 'recipient'
                      limit 1), '') as client_name
      from trip_documents document
      join nfe_documents note on note.company_id = document.company_id and note.id = document.nfe_document_id
     where document.company_id = ${input.companyId}::uuid and document.id = ${input.documentId}::uuid
     limit 1`)) as unknown as readonly { client_name?: unknown; series?: unknown }[]
  return {
    clientName: typeof row?.client_name === 'string' ? row.client_name.trim() : '',
    series: typeof row?.series === 'string' ? row.series.trim() : '',
  }
}

/** A conta do motorista nesta empresa (vínculo ativo da ficha), ou `null`. */
export async function findDriverUserId(
  database: Database,
  input: { readonly companyId: string; readonly driverId: string },
): Promise<null | string> {
  const [row] = await database
    .select({ userId: userCompanyMemberships.userId })
    .from(fleetDrivers)
    .innerJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.id, fleetDrivers.membershipId),
        eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
      ),
    )
    .where(
      and(
        eq(fleetDrivers.companyId, input.companyId),
        eq(fleetDrivers.id, input.driverId),
        eq(userCompanyMemberships.status, 'active'),
      ),
    )
    .limit(1)
  return row?.userId ?? null
}

/** Spec 281 T8b: o tipo pede o contato quando liga o pedido e o canal com o cliente não está desligado. */
function contactChannelsOf(type: {
  readonly asksClientContact?: boolean
  readonly clientChannel?: string
}): readonly ('email' | 'whatsapp')[] {
  if (type.asksClientContact !== true) return []
  switch (type.clientChannel ?? 'email') {
    case 'off':
      return []
    case 'whatsapp':
      return ['whatsapp']
    case 'both':
      return ['email', 'whatsapp']
    default:
      return ['email']
  }
}

function actorOf(input: { readonly companyId: string; readonly driverId: string }, userId: string) {
  return {
    companyId: input.companyId,
    correlationId: crypto.randomUUID(),
    driverId: input.driverId,
    userId,
  }
}

function describeContactFailure(error: unknown): string {
  if (error instanceof ContractorReplyWhatsAppNumberInvalidError) {
    return 'esse telefone não parece válido (digite com DDD)'
  }
  if (error instanceof DriverClientEmailInvalidError) return 'esse e-mail não parece válido'
  if (error instanceof DeliveryClientEmailLimitReachedError) {
    return 'o cliente já tem o máximo de contatos cadastrados'
  }
  if (error instanceof DeliveryClientNotFoundError) {
    return 'não achei o cadastro do cliente desta nota'
  }
  return 'não consegui guardar o contato agora'
}
