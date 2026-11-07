/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T0.1 §4: compõe as leituras que o bot já tem — coleta aberta (ocorrência, entrega em preparo, pergunta do
 * canhoto), pedido aberto do grupo, pergunta/escolha da sessão individual e áudio esperando confirmação — sem uma
 * segunda lista de tabelas.
 */
import { and, eq } from 'drizzle-orm'

import { fleetDriverWhatsappGroups, fleetDrivers } from '../../database/fleet.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import type { DriverOpenQuestionPort } from '../application/driver-open-question.port.js'
import { DRIVER_FLOW_NODE } from '../domain/whatsapp-driver-flow.constant.js'
import { readDriverPrompt } from '../domain/whatsapp-driver-prompt.policy.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'

export type DriverOpenQuestionContact = {
  readonly groupJid: string | undefined
  readonly phone: string | undefined
}

export type DriverOpenQuestionSessionPosition = {
  readonly context: Record<string, unknown>
  readonly currentNodeId: string | null
}

export function createDriverOpenQuestionReader(dependencies: {
  readonly hasOpenCollection: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<boolean>
  readonly hasOpenGroupRequest: (input: {
    readonly companyId: string
    readonly groupJid: string
    readonly now: Date
  }) => Promise<boolean>
  readonly hasPendingGroupAudio: (input: {
    readonly companyId: string
    readonly groupJid: string
  }) => boolean
  readonly hasPendingIndividualAudio: (input: {
    readonly companyId: string
    readonly phone: string
  }) => boolean
  readonly readContact: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<DriverOpenQuestionContact>
  readonly readSession: (input: {
    readonly companyId: string
    readonly phone: string
  }) => Promise<DriverOpenQuestionSessionPosition | undefined>
}): DriverOpenQuestionPort {
  return {
    async read({ companyId, driverId, now }) {
      const { groupJid, phone } = await dependencies.readContact({ companyId, driverId })
      const [hasOpenCollection, hasOpenGroupRequest, session] = await Promise.all([
        dependencies.hasOpenCollection({ companyId, driverId }),
        groupJid === undefined
          ? Promise.resolve(false)
          : dependencies.hasOpenGroupRequest({ companyId, groupJid, now }),
        phone === undefined
          ? Promise.resolve(undefined)
          : dependencies.readSession({ companyId, phone }),
      ])
      const hasPendingAudio =
        (phone !== undefined && dependencies.hasPendingIndividualAudio({ companyId, phone })) ||
        (groupJid !== undefined && dependencies.hasPendingGroupAudio({ companyId, groupJid }))
      return {
        hasOpenCollection,
        hasOpenGroupRequest,
        hasOpenStopChoice: session?.currentNodeId === DRIVER_FLOW_NODE.stopEntry,
        hasPendingAudio,
        hasPendingPrompt:
          session !== undefined && readDriverPrompt(session.context, now) !== undefined,
      }
    },
  }
}

const NINTH_DIGIT_INDEX = 4
const MOBILE_WITH_COUNTRY_LENGTH = 13

/** O `wa_id` da Meta às vezes chega sem o nono dígito: a sessão pode estar sob qualquer uma das duas formas. */
function sessionPhoneCandidates(rawPhone: string): readonly string[] {
  const phone = toWhatsAppPhone(rawPhone)
  if (phone === undefined) return []
  if (phone.length === MOBILE_WITH_COUNTRY_LENGTH && phone[NINTH_DIGIT_INDEX] === '9') {
    return [phone, `${phone.slice(0, NINTH_DIGIT_INDEX)}${phone.slice(NINTH_DIGIT_INDEX + 1)}`]
  }
  return [phone]
}

type AudioReader = {
  hasPendingInConversation(input: {
    readonly companyId: string
    readonly conversation: string
  }): boolean
}

/** A composição de `main.ts`: as mesmas instâncias do bot (coleta, áudio, pedido do grupo, sessão da Meta). */
export function createDriverOpenQuestionPort(dependencies: {
  readonly collections: {
    hasOpen(input: { readonly companyId: string; readonly driverId: string }): Promise<boolean>
  }
  readonly database: TripQueryable
  readonly groupAudio?: AudioReader | undefined
  readonly groupRequests: {
    findOpen(input: {
      readonly companyId: string
      readonly groupJid: string
      readonly now: Date
    }): Promise<unknown>
  }
  readonly individualAudio?: AudioReader | undefined
  readonly sessions: {
    getContext(
      companyId: string,
      whatsappNumber: string,
    ): Promise<DriverOpenQuestionSessionPosition | undefined>
  }
}): DriverOpenQuestionPort {
  const { database } = dependencies
  return createDriverOpenQuestionReader({
    hasOpenCollection: (input) => dependencies.collections.hasOpen(input),
    hasOpenGroupRequest: async (input) =>
      (await dependencies.groupRequests.findOpen(input)) !== null,
    hasPendingGroupAudio: ({ companyId, groupJid }) =>
      dependencies.groupAudio?.hasPendingInConversation({
        companyId,
        conversation: `group:${groupJid}`,
      }) ?? false,
    hasPendingIndividualAudio: ({ companyId, phone }) =>
      sessionPhoneCandidates(phone).some(
        (candidate) =>
          dependencies.individualAudio?.hasPendingInConversation({
            companyId,
            conversation: `user:${candidate}`,
          }) ?? false,
      ),
    readContact: async ({ companyId, driverId }) => {
      const [driver] = await database
        .select({ phone: fleetDrivers.phone })
        .from(fleetDrivers)
        .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.id, driverId)))
        .limit(1)
      const [group] = await database
        .select({ groupJid: fleetDriverWhatsappGroups.groupJid })
        .from(fleetDriverWhatsappGroups)
        .where(
          and(
            eq(fleetDriverWhatsappGroups.companyId, companyId),
            eq(fleetDriverWhatsappGroups.driverId, driverId),
          ),
        )
        .limit(1)
      return {
        groupJid: group?.groupJid,
        phone: driver === undefined || driver.phone === '' ? undefined : driver.phone,
      }
    },
    readSession: async ({ companyId, phone }) => {
      const positions = await Promise.all(
        sessionPhoneCandidates(phone).map((candidate) =>
          dependencies.sessions.getContext(companyId, candidate),
        ),
      )
      return positions.find((position) => position !== undefined)
    },
  })
}
