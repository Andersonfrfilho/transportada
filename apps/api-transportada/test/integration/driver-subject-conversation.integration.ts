/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (ADR-0101), contra Postgres real — lado de leitura do motorista:
 * - BOLA: nota ou viagem de outra empresa, de outra viagem ou de tripulação alheia é o mesmo 404;
 * - `open` idempotente (201 e depois 200), protocolo `AAMMDD-XXXX` do trigger;
 * - a lista traz protocolo, canais, ícone do tipo, "espera resposta" e o estado efetivo (nota liberada,
 *   viagem cancelada); o `retarget` leva a conversa ao novo principal, e o anterior recebe 404.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  companyOccurrenceTypes,
  fleetDrivers,
  occurrenceConversationReads,
  occurrenceConversations,
  tripDocuments,
  tripDrivers,
  trips,
} from '../../src/database/database.schema.js'
import {
  seedMailScenario,
  withConversationDatabase,
} from '../fixtures/occurrence-conversation-database.fixture.js'
import {
  createSubjectHarness,
  firstTripOf,
  insertSubjectMessage,
  rejection,
  swapPrincipal,
} from '../fixtures/driver-subject-conversation-database.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
} from '../fixtures/trip-field-office-database.fixture.js'

const PROTOCOL = /^[0-9]{6}-[2-9A-HJKMNP-Z]{4}$/u
const NOT_FOUND = { code: 'CONVERSATION_NOT_FOUND', status: 404 }

describe('a conversa por assunto do motorista contra Postgres (spec 260 T2.4)', () => {
  testWithPostgres(
    'BOLA: o mesmo 404 para nota alheia, de outra empresa, de outra viagem e de tripulação alheia',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { company } = seeded
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const actor = {
          companyId: company.companyId,
          driverId: company.firstDriverId,
          driverUserId,
        }
        const harness = createSubjectHarness(database.db)
        const [link] = await database.db
          .select({ id: tripDocuments.id })
          .from(tripDocuments)
          .where(eq(tripDocuments.companyId, company.companyId))
        if (link === undefined) throw new Error('EXPECTED_LINK')

        const foreign = await seedCompany(database)
        const foreignTrip = await seedTrip(database, foreign, 'in_transit')
        const sameCompanyOtherTrip = await seedTrip(database, company, 'in_transit')
        await database.db
          .delete(tripDrivers)
          .where(eq(tripDrivers.tripId, sameCompanyOtherTrip.tripId))
        const outsider = await linkDriverMembership(database, company, company.secondDriverId)
        await database.db
          .delete(tripDrivers)
          .where(eq(tripDrivers.driverId, company.secondDriverId))

        const unreachable = [
          { ...actor, subjectId: foreignTrip.documentId, subjectType: 'document' as const },
          { ...actor, subjectId: foreignTrip.tripId, subjectType: 'trip' as const },
          {
            ...actor,
            subjectId: sameCompanyOtherTrip.documentId,
            subjectType: 'document' as const,
          },
          { ...actor, subjectId: crypto.randomUUID(), subjectType: 'document' as const },
          { ...actor, subjectId: crypto.randomUUID(), subjectType: 'occurrence' as const },
          {
            ...actor,
            companyId: foreign.companyId,
            subjectId: link.id,
            subjectType: 'document' as const,
          },
          {
            companyId: company.companyId,
            driverId: company.secondDriverId,
            driverUserId: outsider,
            subjectId: link.id,
            subjectType: 'document' as const,
          },
        ]
        for (const input of unreachable) {
          expect(await rejection(() => harness.messages.list(input))).toMatchObject(NOT_FOUND)
          expect(await rejection(() => harness.markRead.markRead(input))).toMatchObject(NOT_FOUND)
          if (input.subjectType !== 'occurrence') {
            expect(
              await rejection(() =>
                harness.open.open({ ...input, subjectType: input.subjectType }),
              ),
            ).toMatchObject(NOT_FOUND)
          }
        }
        const conversations = await database.db.select().from(occurrenceConversations)
        expect(conversations).toEqual([])
        expect(
          await harness.messages.list({ ...actor, subjectId: link.id, subjectType: 'document' }),
        ).toEqual([])
      })
    },
    90_000,
  )

  testWithPostgres(
    'open idempotente, protocolo, lista com canais, ícone e espera; encerrada por nota liberada e viagem cancelada',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { company } = seeded
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const actor = {
          companyId: company.companyId,
          driverId: company.firstDriverId,
          driverUserId,
        }
        const harness = createSubjectHarness(database.db)
        const tripId = await firstTripOf(database.db, company)
        const [link] = await database.db
          .select({ id: tripDocuments.id })
          .from(tripDocuments)
          .where(eq(tripDocuments.companyId, company.companyId))
        if (link === undefined) throw new Error('EXPECTED_LINK')

        const opened = await harness.open.open({
          ...actor,
          subjectId: link.id,
          subjectType: 'document',
        })
        expect(opened.created).toBe(true)
        const protocol = opened.summary.protocol
        expect(protocol).toMatch(PROTOCOL)
        expect(opened.summary).toMatchObject({
          awaitingDriver: false,
          channels: [],
          status: 'open',
          subjectId: link.id,
          subjectLabel: expect.stringMatching(/^NF [0-9]+/u),
          subjectType: 'document',
          tripId,
          unreadCount: 0,
        })
        const again = await harness.open.open({
          ...actor,
          subjectId: link.id,
          subjectType: 'document',
        })
        expect(again.created).toBe(false)
        expect(again.summary.protocol).toBe(protocol)
        const tripOpened = await harness.open.open({
          ...actor,
          subjectId: tripId,
          subjectType: 'trip',
        })
        expect(tripOpened.created).toBe(true)
        expect(tripOpened.summary.subjectLabel).toBe('Viagem de 16/09')
        expect(tripOpened.summary.protocol).not.toBe(protocol)

        const [documentConversation] = await database.db
          .select({ id: occurrenceConversations.id })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.tripDocumentId, link.id))
        const [tripConversation] = await database.db
          .select({ id: occurrenceConversations.id })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.subjectType, 'trip'))
        const [occurrenceConversation] = await database.db
          .insert(occurrenceConversations)
          .values({
            companyId: company.companyId,
            driverUserId,
            occurrenceId: seeded.occurrenceId,
            occurrenceKind: 'document',
            participant: 'driver',
          })
          .returning({ id: occurrenceConversations.id })
        if (!documentConversation || !tripConversation || !occurrenceConversation) {
          throw new Error('EXPECTED_CONVERSATIONS')
        }
        const base = { driverUserId, operatorUserId: company.userId }
        const at = (minutes: number) => new Date(Date.UTC(2026, 9, 9, 12, minutes))
        await insertSubjectMessage(database.db, {
          ...base,
          body: 'Pode aguardar?',
          conversationId: documentConversation.id,
          createdAt: at(1),
          direction: 'outbound',
        })
        await insertSubjectMessage(database.db, {
          ...base,
          body: 'Estou chegando',
          channel: 'whatsapp',
          conversationId: tripConversation.id,
          createdAt: at(2),
          direction: 'inbound',
        })
        await insertSubjectMessage(database.db, {
          ...base,
          body: 'Caixa violada?',
          conversationId: occurrenceConversation.id,
          createdAt: at(3),
          direction: 'outbound',
        })

        const first = await harness.list.list({ ...actor, cursor: null })
        expect(first.nextCursor).toBeNull()
        expect(first.data.map((item) => item.subjectType)).toEqual([
          'occurrence',
          'trip',
          'document',
        ])
        const [occurrenceItem, tripItem, documentItem] = first.data
        expect(first.data.every((item) => PROTOCOL.test(item.protocol))).toBe(true)
        expect(documentItem).toMatchObject({
          awaitingDriver: true,
          channels: ['app'],
          unreadCount: 1,
        })
        expect(tripItem).toMatchObject({
          awaitingDriver: false,
          channels: ['whatsapp'],
          unreadCount: 0,
        })
        expect(occurrenceItem).toMatchObject({
          channels: ['app'],
          lastMessagePreview: 'Caixa violada?',
          subjectLabel: expect.stringMatching(/^Caixa violada · NF /u),
        })
        expect(occurrenceItem).not.toHaveProperty('iconName')

        await database.db
          .update(companyOccurrenceTypes)
          .set({ iconName: 'alert' })
          .where(eq(companyOccurrenceTypes.companyId, company.companyId))
        const withIcon = await harness.list.list({ ...actor, cursor: null })
        expect(withIcon.data[0]).toMatchObject({ iconName: 'alert', subjectType: 'occurrence' })
        expect(withIcon.data[1]).not.toHaveProperty('iconName')

        await database.db
          .update(tripDocuments)
          .set({ releasedAt: at(10) })
          .where(eq(tripDocuments.id, link.id))
        const released = await harness.list.list({ ...actor, cursor: null })
        expect(released.data.find((item) => item.subjectType === 'document')).toMatchObject({
          awaitingDriver: false,
          status: 'closed',
        })
        expect(
          await rejection(() =>
            harness.open.open({ ...actor, subjectId: link.id, subjectType: 'document' }),
          ),
        ).toMatchObject({ code: 'CONVERSATION_CLOSED', status: 409 })
        expect(
          (await harness.messages.list({ ...actor, subjectId: link.id, subjectType: 'document' }))
            .length,
        ).toBe(1)

        await database.db.update(trips).set({ status: 'cancelled' }).where(eq(trips.id, tripId))
        const cancelled = await harness.list.list({ ...actor, cursor: null })
        expect(cancelled.data.find((item) => item.subjectType === 'trip')).toMatchObject({
          status: 'closed',
        })
        expect(cancelled.data.find((item) => item.subjectType === 'occurrence')).toMatchObject({
          status: 'open',
        })
        expect(
          await rejection(() =>
            harness.open.open({ ...actor, subjectId: tripId, subjectType: 'trip' }),
          ),
        ).toMatchObject({ code: 'CONVERSATION_CLOSED' })
      })
    },
    90_000,
  )

  testWithPostgres(
    'retarget: o novo principal alcança sem escrita na leitura, assume ao abrir e o anterior recebe 404',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { company } = seeded
        const previousUser = await linkDriverMembership(database, company, company.firstDriverId)
        const nextUser = await linkDriverMembership(database, company, company.secondDriverId)
        const previous = {
          companyId: company.companyId,
          driverId: company.firstDriverId,
          driverUserId: previousUser,
        }
        const next = {
          companyId: company.companyId,
          driverId: company.secondDriverId,
          driverUserId: nextUser,
        }
        const harness = createSubjectHarness(database.db)
        const tripId = await firstTripOf(database.db, company)
        const [link] = await database.db
          .select({ id: tripDocuments.id })
          .from(tripDocuments)
          .where(eq(tripDocuments.companyId, company.companyId))
        if (link === undefined) throw new Error('EXPECTED_LINK')
        const subject = { subjectId: link.id, subjectType: 'document' as const }
        await harness.open.open({ ...previous, ...subject })

        expect(await rejection(() => harness.messages.list({ ...next, ...subject }))).toMatchObject(
          NOT_FOUND,
        )
        expect((await harness.list.list({ ...next, cursor: null })).data).toEqual([])

        await swapPrincipal(database.db, tripId)
        const ownerOf = async () =>
          (
            await database.db
              .select({ driverUserId: occurrenceConversations.driverUserId })
              .from(occurrenceConversations)
              .where(eq(occurrenceConversations.tripDocumentId, link.id))
          )[0]?.driverUserId
        expect(
          (await harness.list.list({ ...next, cursor: null })).data.map((item) => item.subjectId),
        ).toEqual([link.id])
        expect(await harness.messages.list({ ...next, ...subject })).toEqual([])
        await harness.markRead.markRead({ ...next, ...subject })
        expect(await ownerOf()).toBe(previousUser)

        const takenOver = await harness.open.open({ ...next, ...subject })
        expect(takenOver.created).toBe(false)
        expect(await ownerOf()).toBe(nextUser)
        expect(
          await rejection(() => harness.messages.list({ ...previous, ...subject })),
        ).toMatchObject(NOT_FOUND)
        expect((await harness.list.list({ ...previous, cursor: null })).data).toEqual([])
        expect(await rejection(() => harness.open.open({ ...previous, ...subject }))).toMatchObject(
          { code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED' },
        )
        expect(await database.db.select({ id: fleetDrivers.id }).from(fleetDrivers)).toHaveLength(2)
      })
    },
    90_000,
  )

  testWithPostgres(
    'status das mensagens do motorista: entregue, lida só pelo escritório e por ordem de criação',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { company } = seeded
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const actor = {
          companyId: company.companyId,
          driverId: company.firstDriverId,
          driverUserId,
        }
        const harness = createSubjectHarness(database.db)
        const tripId = await firstTripOf(database.db, company)
        await harness.open.open({ ...actor, subjectId: tripId, subjectType: 'trip' })
        const [conversation] = await database.db
          .select({ id: occurrenceConversations.id })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.subjectType, 'trip'))
        if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
        const base = {
          conversationId: conversation.id,
          driverUserId,
          operatorUserId: company.userId,
        }
        const at = (minutes: number) => new Date(Date.UTC(2026, 9, 9, 12, minutes))
        const first = await insertSubjectMessage(database.db, {
          ...base,
          body: 'um',
          createdAt: at(1),
          direction: 'inbound',
        })
        const second = await insertSubjectMessage(database.db, {
          ...base,
          body: 'dois',
          createdAt: at(2),
          direction: 'inbound',
        })
        const statusesOf = async () =>
          (await harness.messages.list({ ...actor, subjectId: tripId, subjectType: 'trip' })).map(
            (message) => message.status,
          )
        expect(await statusesOf()).toEqual(['delivered', 'delivered'])

        const markRead = (userId: string, lastReadMessageId: string) =>
          database.db.insert(occurrenceConversationReads).values({
            companyId: company.companyId,
            conversationId: conversation.id,
            lastReadMessageId,
            userId,
          })
        await markRead(driverUserId, second)
        expect(await statusesOf()).toEqual(['delivered', 'delivered'])
        await markRead(company.userId, first)
        expect(await statusesOf()).toEqual(['read', 'delivered'])
      })
    },
    90_000,
  )
  testWithPostgres(
    'officeReadAt na lista: só leitura do escritório que alcança mensagem do motorista (T5.5)',
    async () => {
      await withConversationDatabase(async (database) => {
        const seeded = await seedMailScenario(database)
        const { company } = seeded
        const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
        const actor = {
          companyId: company.companyId,
          driverId: company.firstDriverId,
          driverUserId,
        }
        const harness = createSubjectHarness(database.db)
        const tripId = await firstTripOf(database.db, company)
        await harness.open.open({ ...actor, subjectId: tripId, subjectType: 'trip' })
        const [conversation] = await database.db
          .select({ id: occurrenceConversations.id })
          .from(occurrenceConversations)
          .where(eq(occurrenceConversations.subjectType, 'trip'))
        if (conversation === undefined) throw new Error('EXPECTED_CONVERSATION')
        const base = {
          conversationId: conversation.id,
          driverUserId,
          operatorUserId: company.userId,
        }
        const at = (minutes: number) => new Date(Date.UTC(2026, 9, 9, 12, minutes))
        const officeMessage = await insertSubjectMessage(database.db, {
          ...base,
          body: 'escritório',
          createdAt: at(1),
          direction: 'outbound',
        })
        const driverMessage = await insertSubjectMessage(database.db, {
          ...base,
          body: 'motorista',
          createdAt: at(2),
          direction: 'inbound',
        })
        const officeReadAtOf = async () =>
          (await harness.list.list({ ...actor, cursor: null })).data[0]?.officeReadAt
        const markRead = (userId: string, lastReadMessageId: string, readAt: Date) =>
          database.db.insert(occurrenceConversationReads).values({
            companyId: company.companyId,
            conversationId: conversation.id,
            lastReadMessageId,
            readAt,
            userId,
          })
        expect(await officeReadAtOf()).toBeUndefined()
        await markRead(driverUserId, driverMessage, at(5))
        expect(await officeReadAtOf()).toBeUndefined()
        await markRead(company.userId, officeMessage, at(6))
        expect(await officeReadAtOf()).toBeUndefined()
        await database.db
          .update(occurrenceConversationReads)
          .set({ lastReadMessageId: driverMessage, readAt: at(7) })
          .where(eq(occurrenceConversationReads.userId, company.userId))
        expect(await officeReadAtOf()).toBe(at(7).toISOString())
      })
    },
    90_000,
  )
})
